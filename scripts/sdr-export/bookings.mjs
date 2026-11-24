import { randomUUID } from 'node:crypto';
import { HttpError, digest, secret, text } from '../../sales/model.mjs';
import { singleEmail } from '../../sales/mail-provider.mjs';
import { salesTeamTools } from '../../sales/sales-team.mjs';
import { calendarConnections } from './booking-calendars.mjs';
import { bookingDelivery } from './booking-delivery.mjs';
import { calendarFile, keyMatches, manageURL, signedKey } from './booking-invitations.mjs';
import { day, defaultPolicy, meetingTypes, minute, monthSlots, monthWindow, openSlot, policyInput, timeZone } from './booking-times.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missing = () => new HttpError(404, 'This booking link is unavailable.');
const conflict = () => new HttpError(409, 'That time is no longer available. Choose another time.');
const stale = () => new HttpError(409, 'This calendar changed. Refresh it before trying again.');
const owner = { id: 'owner', role: 'owner', name: 'Workspace owner' };
const pad = 2 * 60 * minute;
function confirmedSlot(input) {
  if (!Number.isSafeInteger(input.start)) throw new HttpError(400, 'Choose a start time from the calendar.');
  return input.start;
}
function clientDetails(input) {
  return { name: text(input.name, 120, true), email: singleEmail(input.email), company: text(input.company || '', 140),
    phone: text(input.phone || '', 48), notes: text(input.notes || '', 1600) };
}
export function bookings(env, db, origin, key, options = {}) {
  const now = options.now || Date.now, store = db.booking;
  const defaultZone = timeZone(env.SDR_BOOKING_TIME_ZONE || 'America/New_York');
  const team = salesTeamTools(db, null, owner);
  const calendars = calendarConnections(env, store, origin, key, options);
  const delivery = bookingDelivery(env, db, calendars, origin, key, options);
  const roster = () => team.dispatch(owner, 'sales-team-read', {}).members;
  function policy(host, members = roster()) {
    const member = members.find(r => r.id === host);
    if (!member) throw missing();
    return { ...defaultPolicy(member, defaultZone), ...store.setting('hours:' + host), active: member.active };
  }
  function offered(host, type) {
    const p = policy(host);
    if (!p.active || !p.published) throw missing();
    if (!Object.hasOwn(meetingTypes, type) || !p.durations[type]) throw new HttpError(400, 'Choose an available meeting type.');
    return p;
  }
  function hosts() {
    const members = roster();
    return members.flatMap(member => {
      const p = policy(member.id, members);
      return p.active && p.published ? [{ id: member.id, name: p.name, zone: p.zone, question: p.question, durations: p.durations, horizon: p.horizon }] : [];
    });
  }
  function managed(token) {
    if (typeof token !== 'string' || token.length > 90) throw missing();
    const [id, proof, extra] = token.split('.');
    if (extra !== undefined || !uuid.test(id) || !keyMatches(proof, signedKey(key, 'manage', id))) throw missing();
    const row = store.get(id);
    if (!row) throw missing();
    return row;
  }
  const privateView = row => ({ id: row.id, host: row.host, hostName: row.hostName, type: row.type, title: row.title,
    start: row.start, end: row.end, zone: row.zone, status: row.status, revision: row.revision, location: row.location,
    client: row.client, question: row.question, answer: row.answer, manageURL: manageURL(origin, key, row.id) });
  function receipt(row) {
    const statuses = store.statuses(row);
    return { booking: privateView(row), calendar: calendarFile([row]), email: statuses.clientEmail || 'unconfigured' };
  }
  const localBusy = (host, start, end, except) => store.range(host, start - pad, end + pad)
    .filter(row => row.status === 'confirmed' && row.id !== except);
  async function slots(input, existing) {
    const host = existing?.host || input.host, type = existing?.type || input.type;
    const p = offered(host, type), zone = timeZone(input.zone), when = now();
    if (existing && existing.status !== 'confirmed') throw stale();
    const [start, end] = monthWindow(input.month, when, p.horizon);
    const conn = calendars.connection(host);
    const external = end >= start ? await calendars.busy(host, conn, start - pad, end + pad + p.durations[type] * minute, existing?.id) : [];
    const days = monthSlots(p, type, input.month, zone, when, [...localBusy(host, start, end + p.durations[type] * minute, existing?.id), ...external]);
    return { days, zone, month: input.month };
  }
  function existingRequest(key, signature) {
    const row = store.byRequest(key);
    if (row && row.signature !== signature) throw new HttpError(409, 'This booking request has already been used.');
    return row;
  }
  async function reserve(input, prior) {
    const host = prior?.host || input.host, type = prior?.type || input.type, start = confirmedSlot(input);
    const zone = timeZone(input.zone), client = prior?.client || clientDetails(input);
    const answer = prior?.answer ?? text(input.answer || '', 800);
    let requestKey, signature;
    if (!prior) {
      if (typeof input.requestId !== 'string' || !uuid.test(input.requestId)) throw new HttpError(400, 'Use a new booking request ID.');
      requestKey = digest(input.requestId);
      signature = digest(JSON.stringify([host, type, start, zone, client, answer]));
      const replay = existingRequest(requestKey, signature);
      if (replay) return receipt(replay);
    } else {
      if (prior.status !== 'confirmed' || prior.start <= now()) throw stale();
      if (prior.start === start && prior.zone === zone && (input.revision === prior.revision || input.revision === prior.revision - 1)) return receipt(prior);
      if (input.revision !== prior.revision) throw stale();
    }
    const p = offered(host, type), conn = calendars.connection(host);
    const end = start + p.durations[type] * minute;
    if (!openSlot(p, type, start, now(), localBusy(host, start, end, prior?.id))) throw conflict();
    const external = await calendars.busy(host, conn, start - pad, end + pad, prior?.id);
    return store.transaction(() => {
      if (!prior) {
        const replay = existingRequest(requestKey, signature);
        if (replay) return receipt(replay);
      } else if (store.get(prior.id).revision !== prior.revision) throw stale();
      const current = offered(host, type);
      if (p.revision !== current.revision || conn?.id !== calendars.connection(host)?.id ||
          !openSlot(current, type, start, now(), [...localBusy(host, start, end, prior?.id), ...external])) throw conflict();
      const row = { ...(prior || { id: randomUUID(), host, type, requestKey, signature, client, question: p.question,
        answer: p.question ? answer : '', title: meetingTypes[type] }), revision: (prior?.revision || 0) + 1, status: 'confirmed',
        hostName: p.name, repEmail: p.email, hostZone: p.zone, buffer: p.buffer, location: p.location, zone, start, end, changed: now() };
      store.put(row);
      delivery.enqueue(row, prior ? 'booking.rescheduled' : 'booking.created');
      return receipt(row);
    });
  }
  function cancel(input, before) {
    return store.transaction(() => {
      const row = store.get(before.id);
      if (row.status === 'cancelled') return receipt(row);
      if (row.revision !== input.revision || row.start <= now()) throw stale();
      const after = { ...row, status: 'cancelled', revision: row.revision + 1, changed: now() };
      store.put(after);
      delivery.enqueue(after, 'booking.cancelled');
      return receipt(after);
    });
  }
  function publicAction(action, input) {
    if (action === 'hosts') return { hosts: hosts(), types: meetingTypes, now: now() };
    if (action === 'slots') return slots(input, input.token ? managed(input.token) : null);
    if (action === 'book') return reserve(input);
    const row = managed(input.token);
    if (action === 'read') return receipt(row);
    if (action === 'cancel') return cancel(input, row);
    if (action === 'reschedule') return reserve(input, row);
    throw new HttpError(400, 'Unknown booking operation.');
  }
  function feedURL(host) {
    const nonce = store.setting('feed:' + host);
    return nonce ? origin + '/book/feed/' + host + '/' + signedKey(key, 'feed', host + ':' + nonce) + '.ics' : null;
  }
  function feed(host, proof) {
    const nonce = store.setting('feed:' + host);
    if (!nonce || !keyMatches(proof, signedKey(key, 'feed', host + ':' + nonce)) || !policy(host).active) throw missing();
    return calendarFile(store.range(host, now() - 90 * day, now() + 181 * day).filter(row => row.status === 'confirmed'));
  }
  async function staff(user, action, input) {
    const host = input.host || user.id;
    if (!['owner', 'agent'].includes(user.role) || (user.id !== host && user.role !== 'owner')) throw new HttpError(403, 'Open your own sales calendar.');
    const p = policy(host);
    if (action === 'booking-dashboard') {
      const entries = store.range(host, now() - 365 * day, now() + 181 * day);
      return { host, policy: p, hosts: (user.role === 'owner' ? roster() : [{ id: user.id, active: true, name: user.name }])
        .map(({ id, name, active }) => ({ id, name, active })), shareURL: origin + '/book?rep=' + encodeURIComponent(host),
        feedURL: feedURL(host), connections: { ...calendars.status(host), ...delivery.connections(host) }, now: now(),
        entries: entries.map(row => ({ ...privateView(row), delivery: store.statuses(row) })) };
    }
    if (action === 'booking-settings') {
      const update = policyInput(input);
      return store.transaction(() => {
        if (!p.active || input.revision !== policy(host).revision) throw stale();
        store.save('hours:' + host, { ...update, revision: p.revision + 1 });
        return { saved: true };
      });
    }
    if (action === 'booking-retry') {
      if (store.get(String(input.id))?.host !== host) throw missing();
      store.retry(input.id);
      return { queued: true };
    }
    if (host !== user.id || !p.active) throw new HttpError(403, 'Sign in as this rep to manage their calendar connections.');
    if (action === 'booking-connect') return calendars.begin(host, input.provider);
    if (action === 'booking-connected') {
      const conn = await calendars.complete(host, input.state, input.code);
      store.transaction(() => {
        for (const row of store.range(host, now(), now() + 181 * day)) if (row.status === 'confirmed') delivery.enqueueCalendar(row, conn);
      });
      return { connected: conn.provider };
    }
    if (action === 'booking-disconnect') { calendars.disconnect(host); return { disconnected: true }; }
    if (action === 'booking-feed') {
      if (input.enabled === true) store.save('feed:' + host, secret());
      else if (input.enabled === false) store.clear('feed:' + host);
      else throw new HttpError(400, 'Choose whether to enable calendar subscriptions.');
      return { feedURL: feedURL(host) };
    }
    throw new HttpError(400, 'Unknown sales calendar operation.');
  }
  return { publicAction, staff, feed, tick: delivery.tick, mailNotification: delivery.mailNotification };
}
