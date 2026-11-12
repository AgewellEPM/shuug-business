import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { contactFixture } from '../scripts/sales/contact-fixture.mjs';
import { createMailWebhook } from './mail-webhook.mjs';
import { metadata } from './model.mjs';
import { service } from './service.mjs';

async function fixture() {
  const f = contactFixture(), office = await f.createOffice({ email: 'owner@example.test' }), clock = Date.now();
  f.env.GIGTAX_MAILGUN_WEBHOOK_KEY = 'synthetic-hook-key';
  const contract = await f.db.create('enrollments', { status: 'invited', notes: JSON.stringify({ leadId: String(office.id), expiresAt: clock + 86400000 }) });
  const row = await f.db.create('events', { assigned_to: String(office.id), contact_name: 'Synthetic Agent', status: 'accepted', notes: JSON.stringify({ action: 'contract_delivery', actorId: 'owner', contractId: String(contract.id), at: new Date(clock - 10000).toISOString(),
    delivery: { from: 'sales@example.test', replyTo: 'sales@example.test', to: 'owner@example.test', senderId: '1', mode: 'live', status: 'accepted', providerId: '<sent@example.test>', createdAt: new Date(clock - 10000).toISOString(), attemptedAt: new Date(clock - 10000).toISOString() } }) });
  await f.db.patch('enrollments', contract.id, { notes: JSON.stringify({ ...metadata(contract), deliveryReservation: { id: String(row.id), status: 'accepted', mode: 'live' } }) });
  const handler = createMailWebhook(f.env, f.db, { now: () => clock });
  const event = (extra = {}) => ({ id: 'synthetic-delivered', event: 'delivered', timestamp: clock / 1000 - 1, recipient: 'owner@example.test', domain: { name: 'example.test' }, flags: { 'is-test-mode': false },
    message: { headers: { 'message-id': 'sent@example.test' } }, 'user-variables': { gigtax_delivery: String(row.id) }, ...extra });
  const signed = value => { const timestamp = String(Math.floor(clock / 1000)), token = 'a'.repeat(50); return { signature: { timestamp, token, signature: createHmac('sha256', f.env.GIGTAX_MAILGUN_WEBHOOK_KEY).update(timestamp + token).digest('hex') }, 'event-data': value }; };
  async function call(data, headers = {}) {
    let result, status;
    await handler({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof data === 'string' ? data : JSON.stringify(data) }, {
      statusCode: 200, setHeader() {}, end(text) { status = this.statusCode; result = JSON.parse(text); },
    });
    return { status, result };
  }
  return { ...f, office, row, contract, clock, event, signed, call };
}
test('authenticated delivery events update the exact message once; acceptance cannot erase delivery evidence', async () => {
  const f = await fixture();
  assert.equal((await f.call(f.signed(f.event()))).status, 200);
  assert.equal(metadata(await f.db.get('events', f.row.id)).delivery.status, 'delivered');
  assert.equal(metadata(await f.db.get('enrollments', f.contract.id)).deliveryReservation.status, 'delivered');
  assert.equal((await f.call(f.signed(f.event()))).result.duplicate, true);
  await f.call(f.signed(f.event({ id: 'synthetic-late-accepted', event: 'accepted', timestamp: f.clock / 1000 })));
  assert.equal(metadata(await f.db.get('events', f.row.id)).delivery.status, 'delivered');
  const pipeline = (await service(f.env, f.db).dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.lastContact.channel, 'email · delivery confirmed'); assert.equal(pipeline.converted, false);
});
test('unsigned, wrong-message, wrong-recipient and test-mode events cannot claim recipient delivery', async () => {
  const f = await fixture();
  assert.equal((await f.call({ 'event-data': f.event() })).status, 400);
  assert.equal((await f.call(f.signed(f.event({ recipient: 'other@example.test' })))).status, 400);
  assert.equal((await f.call(f.signed(f.event({ message: { headers: { 'message-id': 'other@example.test' } } })))).status, 400);
  assert.equal((await f.call(f.signed(f.event({ flags: { 'is-test-mode': true }, 'delivery-status': { code: 650 } })))).result.testOrUnverified, true);
  assert.equal(metadata(await f.db.get('events', f.row.id)).delivery.status, 'accepted');
});
test('a signed, matching incoming reply is recorded once with provider provenance and does not imply interest or signature', async () => {
  const f = await fixture(), timestamp = String(Math.floor(f.clock / 1000));
  const data = { sender: 'owner@example.test', recipient: 'sales@example.test', 'stripped-text': 'Synthetic question about the agreement.',
    'message-headers': [['Message-ID', '<reply@example.test>'], ['In-Reply-To', '<sent@example.test>']] };
  const raw = JSON.stringify(data), signature = createHmac('sha256', f.env.GIGTAX_MAILGUN_WEBHOOK_KEY).update(timestamp).update(raw).digest('hex');
  const headers = { 'x-mailgun-timestamp': timestamp, 'x-mailgun-signature': signature };
  assert.equal((await f.call(raw, headers)).status, 200);
  assert.equal((await f.call(raw, headers)).result.duplicate, true);
  const pipeline = (await service(f.env, f.db).dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.lastReply.note, data['stripped-text']); assert.equal(pipeline.lastReply.source, 'provider_received');
  assert.equal(pipeline.lastReply.outcome, 'other'); assert.equal(pipeline.waitingOn, 'us'); assert.equal(pipeline.converted, false);
  assert.equal((await f.call(raw + ' ', headers)).status, 400, 'JSON inbound signatures bind the exact raw body');
});
test('unmatched inbound messages are not attached to an office and signed complaints suppress its recipient', async () => {
  const f = await fixture();
  const timestamp = String(Math.floor(f.clock / 1000)), token = 'b'.repeat(50), signature = createHmac('sha256', f.env.GIGTAX_MAILGUN_WEBHOOK_KEY).update(timestamp + token).digest('hex');
  assert.equal((await f.call({ timestamp, token, signature, sender: 'unknown@example.test', recipient: 'sales@example.test', 'message-headers': [] })).result.unmatchedReply, true);
  await f.call(f.signed(f.event({ id: 'synthetic-opt-out', event: 'complained' })));
  const info = metadata(await f.db.get('offices', f.office.id));
  assert(info.emailOptOuts.includes('owner@example.test')); assert.equal(info.primaryContactDoNotContact, true);
  assert.equal(metadata(await f.db.get('events', f.row.id)).delivery.status, 'opted_out');
});
