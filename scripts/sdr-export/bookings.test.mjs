import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sqliteStore } from './sqlite.mjs';
import { bookings } from './bookings.mjs';
import { repEmailWorkspace } from './mail/workspace.mjs';
import { defaultPolicy, minute, monthSlots, timeZone } from './booking-times.mjs';

const owner = { id: 'owner', role: 'owner', name: 'Workspace owner' }, origin = 'https://booking.example';
const fixed = Date.parse('2027-03-08T12:00:00Z');
const form = start => ({ action: 'book', host: 'owner', type: 'demo', start, zone: 'America/Los_Angeles',
  requestId: randomUUID(), name: 'Example client', email: 'client@example.invalid', company: 'Example business', notes: 'Discuss onboarding.' });
const tokenOf = result => new URLSearchParams(new URL(result.booking.manageURL).hash.slice(1)).get('manage');
const fails = code => error => error.status === code;
function project(t, env = {}, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdr-booking-test-')), file = join(dir, 'workspace.sqlite');
  const db = sqliteStore(file), key = randomBytes(32).toString('hex');
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const open = store => bookings(env, store, origin, key, { now: () => fixed, ...options });
  const app = open(db);
  return { db, app, file, open, dashboard: () => app.staff(owner, 'booking-dashboard', {}),
    available: async (host = 'owner') => (await app.publicAction('slots', { host, type: 'demo', zone: 'UTC', month: '2027-03' })).days };
}
test('one overlapping request wins across connections, retries persist, and only the holder can move or cancel', async t => {
  const { db, app, file, open, available, dashboard } = project(t);
  const second = sqliteStore(file); t.after(() => second.close());
  const other = open(second);
  const times = Object.values(await available()).flat(), start = times[0];
  const a = form(start), b = { ...form(start + 15 * minute), type: 'appointment' };
  const results = await Promise.allSettled([app.publicAction('book', a), other.publicAction('book', b)]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.status, 409);
  const receipt = results[0].value, token = tokenOf(receipt);
  assert.equal(receipt.booking.client.name, a.name);
  assert.equal((await other.publicAction('book', a)).booking.id, receipt.booking.id);
  await assert.rejects(app.publicAction('book', { ...a, name: 'Different request' }), fails(409));
  assert.throws(() => app.publicAction('read', { token: token.replace(/\..+$/, '.invalid') }), fails(404));
  const moved = await app.publicAction('reschedule', { token, revision: 1, start: times[8], zone: a.zone });
  assert.equal(moved.booking.revision, 2); assert.match(moved.calendar, /SEQUENCE:1/);
  assert.equal((await other.publicAction('reschedule', { token, revision: 1, start: times[8], zone: a.zone })).booking.revision, 2);
  assert.throws(() => app.publicAction('cancel', { token, revision: 1 }), fails(409));
  assert.equal((await dashboard()).entries.length, 1);
  assert.equal(app.nextBooking(owner).start, times[8]);
  const url = (await app.staff(owner, 'booking-feed', { enabled: true })).feedURL;
  const feedKey = new URL(url).pathname.split('/').pop().replace('.ics', '');
  assert.match(app.feed('owner', feedKey), /BEGIN:VEVENT/);
  const cancelled = other.publicAction('cancel', { token, revision: 2 });
  assert.equal(cancelled.booking.status, 'cancelled'); assert.match(cancelled.calendar, /STATUS:CANCELLED/);
  assert.equal(app.nextBooking(owner), null); assert.doesNotMatch(app.feed('owner', feedKey), /BEGIN:VEVENT/);
  assert.ok(Object.values(await available()).flat().includes(times[8]));
  assert.equal((await other.publicAction('book', a)).booking.status, 'cancelled');
  await app.staff(owner, 'booking-feed', { enabled: false });
  assert.throws(() => app.feed('owner', feedKey), fails(404));
  assert.equal(db.booking.statuses(db.booking.get(receipt.booking.id)).clientEmail, 'unconfigured');
});
test('rep publication, time off, intake and revoked reporting branches apply at both public entry points', async t => {
  const { db, app, available } = project(t);
  const member = (name, parentId = 'owner') => {
    const row = db.create('agents', { contact_name: name, contact_email: name + '@example.invalid', status: 'active', notes: JSON.stringify({ parentId }) });
    return { id: String(row.id), name, role: 'agent' };
  };
  const manager = member('manager'), rep = member('rep', manager.id);
  assert.deepEqual(app.publicAction('hosts', {}).hosts.map(h => h.id), ['owner']);
  const p = (await app.staff(rep, 'booking-dashboard', {})).policy;
  await app.staff(rep, 'booking-settings', { ...p, published: true, daysOff: ['2027-03-09'], question: 'Which service?', location: 'Online', buffer: 15 });
  await assert.rejects(app.staff(rep, 'booking-settings', { ...p, host: manager.id }), fails(403));
  await assert.rejects(app.staff(rep, 'booking-settings', { ...p, published: true }), fails(409));
  const pub = app.publicAction('hosts', {}).hosts.find(h => h.id === rep.id);
  assert.equal(pub.name, 'rep'); assert.equal(pub.email, undefined); assert.equal(pub.location, undefined);
  const days = await available(rep.id);
  assert.equal(days['2027-03-09'], undefined);
  const row = await app.publicAction('book', { ...form(days['2027-03-10'][0]), host: rep.id, answer: 'A demo for our office' });
  assert.equal(row.booking.answer, 'A demo for our office');
  assert.equal((await app.staff(manager, 'booking-dashboard', {})).entries.length, 0);
  await assert.rejects(app.staff(manager, 'booking-dashboard', { host: rep.id }), fails(403));
  assert.equal((await app.staff(owner, 'booking-dashboard', { host: rep.id })).entries.length, 1);
  db.patch('agents', manager.id, { status: 'revoked', notes: JSON.stringify({ codeHash: 'revoked' }) });
  assert.ok(!app.publicAction('hosts', {}).hosts.some(h => h.id === rep.id));
  await assert.rejects(available(rep.id), fails(404));
  await assert.rejects(app.publicAction('book', { ...form(days['2027-03-10'][5]), host: rep.id }), fails(404));
  assert.equal(app.publicAction('cancel', { token: tokenOf(row), revision: 1 }).booking.status, 'cancelled');
});
test('rep hours survive DST changes and appear on the correct day in distant client time zones', () => {
  const policy = defaultPolicy(owner, timeZone('America/New_York'));
  const tokyo = monthSlots(policy, 'demo', '2027-03', timeZone('Asia/Tokyo'), fixed, []);
  assert.ok(tokyo['2027-03-12'].includes(Date.parse('2027-03-12T14:00:00Z')));
  assert.ok(tokyo['2027-03-15'].includes(Date.parse('2027-03-15T13:00:00Z')));
  assert.ok(tokyo['2027-03-16'].includes(Date.parse('2027-03-15T18:00:00Z')));
  policy.hours[0] = ['01:00', '04:00'];
  const fall = monthSlots(policy, 'appointment', '2027-11', timeZone('UTC'), Date.parse('2027-10-30T00:00:00Z'), []);
  assert.ok(fall['2027-11-07'].includes(Date.parse('2027-11-07T05:00:00Z')));
  assert.ok(fall['2027-11-07'].includes(Date.parse('2027-11-07T06:00:00Z')));
});
test('email invitations, provider receipts and signed webhook retries use the committed booking revision', async t => {
  let time = fixed, rejectOnce = true;
  const mail = [], callbacks = [], signing = 'test-fixture-webhook-key-for-this-test';
  const env = { GIGTAX_MAILGUN_API_KEY: 'fixture-key-only', GIGTAX_MAILGUN_DOMAIN: 'mailer.example',
    GIGTAX_MAILGUN_REGION: 'US', GIGTAX_MAILGUN_MODE: 'live',
    SDR_BOOKING_WEBHOOKS: JSON.stringify([{ name: 'crm', url: 'https://crm.example/booking', secret: signing }]) };
  const fetcher = async (url, opts) => {
    if (String(url).startsWith('https://api.mailgun.net/')) {
      const id = '<fixture' + mail.length + '@mailer.example>';
      mail.push({ form: opts.body, id }); return Response.json({ id });
    }
    assert.equal(String(url), 'https://crm.example/booking');
    const { body, headers } = opts;
    assert.equal(headers['X-Booking-Signature'], 'sha256=' + createHmac('sha256', signing).update(headers['X-Booking-Timestamp'] + '.' + body).digest('hex'));
    assert.doesNotMatch(body, /manageURL|requestKey|#manage=/);
    callbacks.push(JSON.parse(body));
    if (rejectOnce) { rejectOnce = false; return new Response('', { status: 503 }); }
    return new Response(null, { status: 204 });
  };
  const { db, app, available } = project(t, env, { fetcher, now: () => time });
  db.create('agents', { status: 'mailbox', assigned_to: 'shared', contact_name: 'Sales', contact_email: 'team@mailer.example',
    notes: JSON.stringify({ mailbox: true, mode: 'provider', approvedAt: 'now', replyTo: 'sales@mailer.example' }) });
  const times = Object.values(await available()).flat(), result = await app.publicAction('book', form(times[0])), token = tokenOf(result);
  await app.tick();
  assert.equal(mail.length, 2); assert.equal(mail[0].form.get('to'), 'client@example.invalid');
  assert.match(mail[0].form.get('text'), /\/book#manage=/); assert.match(await mail[0].form.get('attachment').text(), /METHOD:REQUEST/);
  assert.equal(mail[1].form.get('to'), 'sales@mailer.example');
  app.mailNotification({ 'event-data': { event: 'delivered', recipient: 'client@example.invalid', flags: { 'is-test-mode': false },
    message: { headers: { 'message-id': mail[0].id } }, 'user-variables': { sdr_booking: mail[0].form.get('v:sdr_booking') } } });
  assert.equal(app.publicAction('read', { token }).email, 'delivered');
  await app.publicAction('reschedule', { token, revision: 1, start: times[4], zone: 'UTC' });
  await app.tick(); assert.equal(callbacks.length, 1);
  time += 60_000; await app.tick();
  assert.deepEqual(callbacks.map(e => e.event), ['booking.created', 'booking.created', 'booking.rescheduled']);
  assert.equal(callbacks[0].id, callbacks[1].id);
  app.publicAction('cancel', { revision: 2, token }); await app.tick();
  assert.equal(callbacks.at(-1).event, 'booking.cancelled'); assert.match(await mail[4].form.get('attachment').text(), /METHOD:CANCEL/);
});
test('reps can attach their own API and only owners can share an endpoint across calendars', async t => {
  const sent = [];
  const { app, db, available } = project(t, {}, { publicPost: async (url, opts) => {
    sent.push({ url, headers: opts.headers }); return { ok: true };
  } });
  const repRow = db.create('agents', { status: 'active', contact_name: 'Rep', contact_email: 'rep@example.invalid', notes: '{}' });
  const rep = { id: String(repRow.id), name: 'Rep', role: 'agent' };
  const input = { name: 'My CRM', url: 'https://hooks.example.invalid/receive', bearer: 'fixture-token' };
  await assert.rejects(app.staff(rep, 'booking-webhook-add', { ...input, scope: 'workspace' }), fails(403));
  await assert.rejects(app.staff(rep, 'booking-webhook-add', { ...input, url: 'http://localhost/test' }), fails(400));
  const created = await app.staff(rep, 'booking-webhook-add', input);
  assert.ok(created.signingKey.length >= 32);
  const dash = await app.staff(rep, 'booking-dashboard', {}), summary = dash.connections.webhooks;
  assert.deepEqual(summary.map(h => h.name), ['My CRM']);
  assert.doesNotMatch(JSON.stringify(summary), /fixture-token|signingKey/);
  assert.doesNotMatch(JSON.stringify(db.booking.setting('webhooks:' + rep.id)), /fixture-token|hooks.example/);
  await app.publicAction('book', form(Object.values(await available()).flat()[0])); await app.tick();
  assert.equal(sent.length, 0);
  await app.staff(owner, 'booking-webhook-add', { ...input, scope: 'workspace', name: 'Team CRM' });
  await app.staff(rep, 'booking-settings', { ...dash.policy, published: true });
  const result = await app.publicAction('book', { ...form(Object.values(await available(rep.id)).flat()[0]), host: rep.id });
  await app.tick();
  assert.equal(sent.length, 2); assert.ok(sent.every(req => req.headers.Authorization === 'Bearer fixture-token'));
  await app.staff(rep, 'booking-webhook-remove', { name: 'My CRM' });
  app.publicAction('cancel', { token: tokenOf(result), revision: 1 }); await app.tick();
  assert.equal(sent.length, 3);
});
test('a verified rep mailbox sends booking invitations only for the account connection the rep enabled', async t => {
  const { db } = project(t), key = randomBytes(32).toString('hex'), sent = [];
  const repMail = repEmailWorkspace(db, key, {}, {
    async verify() {},
    async send(account, provider, message) { sent.push({ from: account.address, message }); return { saveCopy: async () => true }; },
  });
  const repRow = db.create('agents', { status: 'active', contact_name: 'Rep', contact_email: 'rep@example.invalid', notes: '{}' });
  const rep = { id: String(repRow.id), name: 'Rep', role: 'agent', email: repRow.contact_email };
  const app = bookings({}, db, origin, key, { now: () => fixed, repMail });
  const dashboard = () => app.staff(rep, 'booking-dashboard', {});
  await assert.rejects(app.staff(rep, 'booking-mailbox', { enabled: true }), fails(409));
  const account = await repMail.dispatch(rep, 'rep-email-connect', {
    name: 'Rep', address: rep.email, provider: 'gmail', password: 'fixture-mailbox-credential', revision: '' });
  assert.equal((await dashboard()).connections.email, 'unconfigured');
  await assert.rejects(app.staff(owner, 'booking-mailbox', { host: rep.id, enabled: true }), fails(403));
  await app.staff(rep, 'booking-mailbox', { enabled: true });
  assert.equal((await dashboard()).connections.email, 'smtp');
  await app.staff(rep, 'booking-settings', { ...(await dashboard()).policy, published: true });
  const days = await app.publicAction('slots', { host: rep.id, type: 'demo', zone: 'UTC', month: '2027-03' });
  const slots = Object.values(days.days).flat();
  const event = await app.publicAction('book', { ...form(slots[0]), host: rep.id });
  const token = tokenOf(event); await app.tick();
  assert.equal(app.publicAction('read', { token }).email, 'accepted');
  assert.deepEqual(sent.map(row => row.from), [rep.email, rep.email]);
  assert.equal(sent[0].message.to, event.booking.client.email);
  assert.match(sent[0].message.icalEvent.content, /METHOD:REQUEST/);
  assert.match(sent[0].message.body, /#manage=/);
  assert.doesNotMatch(sent[1].message.body, /#manage=/);
  await app.publicAction('reschedule', { token, revision: 1, start: slots[4], zone: 'UTC' });
  await repMail.dispatch(rep, 'rep-email-disconnect', { revision: account.revision });
  await repMail.dispatch(rep, 'rep-email-connect', { name: 'Rep', address: rep.email, provider: 'gmail', password: 'replacement-fixture', revision: '' });
  await app.tick(); assert.equal(sent.length, 2);
  assert.equal(app.publicAction('read', { token }).email, 'setup-changed');
  assert.equal((await dashboard()).connections.email, 'unconfigured');
  await app.staff(rep, 'booking-mailbox', { enabled: true });
  app.publicAction('cancel', { revision: 2, token }); await app.tick();
  assert.equal(sent.length, 4);
  assert.equal(sent[2].message.icalEvent.method, 'CANCEL');
  assert.equal(new Set(sent.map(row => row.message.messageId)).size, 4);
});
for (const provider of ['google', 'microsoft']) test(provider + ' connection rejects stale authorization, blocks busy time, and creates, updates and deletes one event', async t => {
  let start, fail = false, remote = null; const writes = [];
  const google = provider === 'google';
  const env = { ['SDR_' + provider.toUpperCase() + '_CALENDAR_CLIENT_ID']: 'fixture-client',
    ['SDR_' + provider.toUpperCase() + '_CALENDAR_CLIENT_SECRET']: 'fixture-secret' };
  const fetcher = async (address, opts) => {
    const url = new URL(address);
    if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 });
    assert.equal(opts.headers.Authorization, 'Bearer fixture-access');
    if (opts.method === 'GET') {
      if (fail) return new Response(null, { status: 503 });
      const busy = { id: 'outside', start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(start + 45 * minute).toISOString() } };
      const events = remote ? [busy, remote] : [busy];
      return Response.json(google ? { items: events, timeZone: 'America/New_York' } : { value: events });
    }
    writes.push(opts.method);
    if (opts.method === 'DELETE') { remote = null; return new Response(null, { status: 204 }); }
    const body = JSON.parse(opts.body);
    assert.ok(body.attendees[0]); remote = { ...body, id: remote?.id || body.id || 'ms-record' };
    return Response.json({ id: remote.id });
  };
  const { app, db, available } = project(t, env, { fetcher });
  const slots = Object.values(await available()).flat(); start = slots[0];
  const link = new URL((await app.staff(owner, 'booking-connect', { provider })).url);
  assert.equal(link.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(link.searchParams.get('redirect_uri'), origin + '/book/connect');
  await assert.rejects(app.staff(owner, 'booking-connected', { state: 'not-the-saved-state', code: 'fixture-code' }), fails(400));
  const auth = { state: link.searchParams.get('state'), code: 'fixture-code' };
  await app.staff(owner, 'booking-connected', auth);
  await assert.rejects(app.staff(owner, 'booking-connected', auth), fails(400));
  assert.doesNotMatch(JSON.stringify(db.booking.setting('connection:owner')), /fixture-refresh/);
  assert.ok(!Object.values(await available()).flat().includes(start));
  fail = true; await assert.rejects(app.publicAction('book', form(slots[8])), fails(503)); fail = false;
  await assert.rejects(app.publicAction('book', form(start)), fails(409));
  const booked = await app.publicAction('book', form(slots[8])); await app.tick();
  const token = tokenOf(booked);
  assert.ok(!Object.values(await available()).flat().includes(slots[8]));
  await app.publicAction('reschedule', { token, revision: 1, start: slots[9], zone: 'America/New_York' }); await app.tick();
  app.publicAction('cancel', { token, revision: 2 }); await app.tick();
  assert.deepEqual(writes, ['POST', 'PATCH', 'DELETE']);
});
