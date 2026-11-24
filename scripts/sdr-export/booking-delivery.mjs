import { createHmac } from 'node:crypto';
import { digest, HttpError, metadata } from '../../sales/model.mjs';
import { mailConfig, sendProviderMail } from '../../sales/mail-provider.mjs';
import { calendarFile, manageURL } from './booking-invitations.mjs';
import { bookingWebhooks, postPublicWebhook } from './booking-webhooks.mjs';

export function bookingDelivery(env, db, calendars, origin, key, { fetcher = fetch, now = Date.now, publicPost = postPublicWebhook } = {}) {
  const store = db.booking, config = mailConfig(env), hooks = bookingWebhooks(env, store, key);
  function sender(host) {
    if (!config.ready) return null;
    const profiles = db.list('agents').filter(r => r.status === 'mailbox' && [host, 'shared'].includes(String(r.assigned_to)) &&
      metadata(r).mailbox && metadata(r).mode === 'provider' && metadata(r).approvedAt && r.contact_email.split('@')[1] === config.domain);
    const row = profiles.find(r => String(r.assigned_to) === host) || profiles[0];
    return row && { from: row.contact_email, fromName: row.contact_name, replyTo: metadata(row).replyTo || row.contact_email };
  }
  function connections(host) {
    return { email: sender(host) ? config.mode : 'unconfigured',
      webhooks: [...hooks.forHost(host).values()].map(h => ({ name: h.name, scope: h.scope, hostname: new URL(h.url).hostname })) };
  }
  function enqueueCalendar(row, conn) {
    if (conn) store.enqueue(row, 'calendar:' + conn.id, 'pending', { row, connection: conn.id });
  }
  function enqueue(row, event) {
    const conn = calendars.connection(row.host), mailbox = sender(row.host);
    enqueueCalendar(row, conn);
    const recipients = { clientEmail: row.client.email, repEmail: row.repEmail || mailbox?.replyTo };
    for (const [channel, to] of Object.entries(recipients)) {
      store.enqueue(row, channel, mailbox && to ? 'pending' : 'unconfigured', { row, event, to, mailbox, providerInvites: Boolean(conn), mode: config.mode });
    }
    for (const [name, hook] of hooks.forHost(row.host)) store.enqueue(row, 'webhook:' + name, 'pending', { row, event, endpointHash: digest(hook.url + hook.key) });
  }
  async function email(job) {
    const { row, event, to, mailbox, providerInvites, mode } = job.data;
    const current = sender(row.host);
    if (!current || current.from !== mailbox.from || config.mode !== mode) return 'setup-changed';
    const guest = job.channel === 'clientEmail';
    const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone: guest ? row.zone : row.hostZone });
    const verb = { 'booking.created': 'confirmed', 'booking.rescheduled': 'rescheduled', 'booking.cancelled': 'cancelled' }[event];
    const body = [row.title + ' ' + verb, fmt.format(row.start), row.hostName + ' and ' + row.client.name,
      row.location, row.client.company, row.client.notes, row.answer && row.question + ' ' + row.answer,
      guest ? 'View or manage your appointment: ' + manageURL(origin, key, row.id) : 'Open your sales calendar: ' + origin + '/sales#view=calendar'];
    const method = row.status === 'cancelled' ? 'CANCEL' : guest ? 'REQUEST' : 'PUBLISH';
    const attachment = providerInvites ? null : calendarFile([row], { method,
      organizer: guest ? row.repEmail || mailbox.replyTo : '', attendee: guest ? to : '' });
    const result = await sendProviderMail(config, { ...mailbox, to, replyTo: guest ? row.repEmail || mailbox.replyTo : row.client.email,
      subject: 'TinkyTown · ' + row.title + ' ' + verb, text: body.filter(Boolean).join('\n\n') }, job.id, fetcher, { method, calendar: attachment });
    if (result.providerId) store.save('mail-receipt:' + job.id, result.providerId);
    return result.status === 'accepted' && mode === 'test' ? 'test-accepted' : result.status;
  }
  async function webhook(job) {
    const hook = hooks.forHost(job.data.row.host).get(job.channel.slice(8));
    if (!hook || digest(hook.url + hook.key) !== job.data.endpointHash) return 'setup-changed';
    const { row, event } = job.data;
    const id = row.id + '.' + row.revision;
    const body = JSON.stringify({ version: 1, id, event, occurredAt: new Date(row.changed).toISOString(), booking: {
      id: row.id, revision: row.revision, status: row.status, type: row.type, repId: row.host, repName: row.hostName,
      start: new Date(row.start).toISOString(), end: new Date(row.end).toISOString(), timeZone: row.zone,
      client: row.client, question: row.question, answer: row.answer, location: row.location } });
    const timestamp = String(Math.floor(now() / 1000));
    const signature = createHmac('sha256', hook.key).update(timestamp + '.' + body).digest('hex');
    const send = hook.scope === 'server' ? fetcher : publicPost;
    const response = await send(hook.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', 'X-Booking-Event': event, 'X-Booking-ID': id,
        'X-Booking-Timestamp': timestamp, 'X-Booking-Signature': 'sha256=' + signature,
        ...(hook.bearer ? { Authorization: 'Bearer ' + hook.bearer } : {}) }, body });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Webhook delivery failed.');
    return 'delivered';
  }
  async function run(job) {
    if (job.channel.startsWith('webhook:')) return webhook(job);
    if (job.channel.startsWith('calendar:')) {
      const conn = calendars.connection(job.data.row.host);
      if (conn?.id !== job.data.connection) return 'disconnected';
      await calendars.sync(store.get(job.booking), conn);
      return 'synced';
    }
    return email(job);
  }
  let running;
  function tick() {
    if (!running) running = (async () => {
      for (let i = 0; i < 64; i++) {
        const job = store.claim(now());
        if (!job) break;
        try { store.finish(job, await run(job)); }
        catch {
          const mail = ['clientEmail', 'repEmail'].includes(job.channel);
          store.finish(job, mail ? 'uncertain' : job.attempts < 8 ? 'pending' : 'failed', now() + Math.min(3600000, 15000 * 2 ** job.attempts));
        }
      }
    })().finally(() => { running = null; });
    return running;
  }
  function mailNotification(payload) {
    const event = payload['event-data'], hint = event?.['user-variables']?.sdr_booking;
    if (!hint) return false;
    const job = store.mailJob(String(hint)), provider = store.setting('mail-receipt:' + hint);
    if (!job || job.data.mode !== 'live' || event.flags?.['is-test-mode'] !== false) return true;
    const normalize = value => String(value || '').trim().replace(/^<|>$/g, '');
    if (!provider || normalize(event.message?.headers?.['message-id']) !== normalize(provider) ||
        String(event.recipient || '').toLowerCase() !== job.data.to) throw new HttpError(409, 'Email receipt is awaiting a matching provider message.');
    if (event.event === 'delivered') store.receipt(job.id, 'delivered');
    if (event.event === 'failed' && event.severity === 'permanent' && job.status !== 'delivered') store.receipt(job.id, 'failed');
    return true;
  }
  return { connections, changeWebhook: hooks.change, enqueue, enqueueCalendar, tick, mailNotification };
}
