import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { service } from '../../sales/service.mjs';
import { createMailWebhook } from '../../sales/mail-webhook.mjs';
import { campaigns, campaignOwner } from './campaigns.mjs';
import { campaignNotifications } from './campaign-mail.mjs';
import { sqliteStore } from './sqlite.mjs';

test('campaign research, personalized draft, send reservation, signed reply and scheduling share persistent records', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'sdr-campaign-test-'));
  const db = sqliteStore(join(directory, 'test.sqlite'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  let now = Date.parse('2026-11-23T00:00:00Z');
  const env = { GIGTAX_SALES_ORIGIN: 'https://workspace.example.test', GIGTAX_SALES_SESSION_KEY: 'b'.repeat(64),
    GIGTAX_MAILGUN_API_KEY: 'fixture-key-only', GIGTAX_MAILGUN_DOMAIN: 'example.test', GIGTAX_MAILGUN_REGION: 'US',
    GIGTAX_MAILGUN_MODE: 'live', GIGTAX_MAILGUN_WEBHOOK_KEY: 'fixture-signing-key-only' };
  const mailbox = db.create('agents', { status: 'mailbox', contact_name: 'Test Sender', contact_email: 'sender@example.test',
    notes: JSON.stringify({ kind: 'shared', mailbox: true, mode: 'provider', approvedAt: new Date(now).toISOString(), replyTo: 'sender@example.test' }) });
  const company = { name: 'Example Roofing', state: 'CT', city: 'Hartford', address: '10 Example Street', zip: '06103',
    sourceURL: 'https://example.test/registry', website: 'https://company.example.test' };
  const deliveries = [];
  const app = campaigns(env, db, { now: () => now,
    findRegistry: async (city, keywords) => { assert.equal(city, 'Hartford'); assert.equal(keywords, 'roofing'); return [company]; },
    registryDetails: async () => ({ matches: [{ match: 'registry_record', principals: [{ name: 'Person Example', role: 'Manager', sourceURL: 'https://example.test/roles' }] }] }),
    websiteResearch: async () => ({ evidence: [{ field: 'email', value: 'contact@company.example.test', sourceURL: 'https://company.example.test/contact' }] }),
    senderRequest: async (config, draft, id) => { deliveries.push({ draft, id }); return { status: 'accepted', providerId: '<example-message@example.test>' }; },
  });
  const sales = service(env, db).dispatch;
  const request = (action, body = {}) => app.dispatch(campaignOwner, action, body, sales);
  const input = { campaignName: 'Roofing campaign', business: 'Example Services', offer: 'We build scheduling tools for roofing teams.',
    nextStep: 'Reply to compare your scheduling workflow.', state: 'CT', city: 'Hartford', keywords: 'roofing',
    source: 'registry', mode: 'draft', limit: 2, interval: 0, postalAddress: '20 Example St, Hartford, CT', senderId: String(mailbox.id) };
  await assert.rejects(app.dispatch({ id: '8', role: 'agent' }, 'campaign-read', {}, sales), /workspace owner/);
  const { campaign } = await request('campaign-save', input);
  assert.equal((await request('campaign-run', campaign)).saved, 1);
  let report = await request('campaign-read', { id: campaign.id });
  assert.equal(report.leads[0].people[0].role, 'Manager');
  assert.equal(report.leads[0].evidence[0].sourceURL, 'https://company.example.test/contact');
  assert.match(report.leads[0].draft.text, /Example Roofing team/);
  assert.match(report.leads[0].draft.text, /scheduling tools/);
  assert.equal(db.list('offices')[0].town, company.name);
  assert.equal(deliveries.length, 0);
  await request('campaign-save', { ...input, id: campaign.id, revision: report.campaigns[0].revision, mode: 'send' });
  assert.equal((await request('campaign-run', campaign)).submitted, 1);
  assert.equal((await request('campaign-run', campaign)).submitted, 0);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].draft.to, 'contact@company.example.test');

  const webhook = createMailWebhook(env, db, { now: () => now, campaignNotification: campaignNotifications(db, () => now) });
  async function notify(data, expected = 200, sign = true) {
    const timestamp = String(now / 1000), rawBody = Buffer.from(JSON.stringify(data));
    const signature = sign ? createHmac('sha256', env.GIGTAX_MAILGUN_WEBHOOK_KEY).update(timestamp).update(rawBody).digest('hex') : '0'.repeat(64);
    const req = { method: 'POST', rawBody, headers: { 'content-type': 'application/json', 'x-mailgun-timestamp': timestamp, 'x-mailgun-signature': signature } };
    const response = { statusCode: 0, setHeader() {}, end() {} };
    await webhook(req, response);
    assert.equal(response.statusCode, expected);
  }
  const delivery = { 'event-data': { id: 'delivered-1', event: 'delivered', timestamp: now / 1000, recipient: deliveries[0].draft.to,
    domain: { name: 'example.test' }, flags: { 'is-test-mode': false }, 'user-variables': { gigtax_delivery: deliveries[0].id },
    message: { headers: { 'message-id': '<example-message@example.test>' } } } };
  await notify(delivery, 400, false);
  await notify(delivery);
  assert.equal((await request('campaign-read', campaign)).leads[0].status, 'delivered');
  const incoming = { sender: deliveries[0].draft.to, recipient: deliveries[0].draft.replyTo, 'stripped-text': 'Please unsubscribe me.',
    'message-headers': [['In-Reply-To', '<example-message@example.test>'], ['Message-ID', '<reply@example.test>']] };
  await notify(incoming);
  await notify(incoming);
  report = await request('campaign-read', campaign);
  assert.equal(report.leads[0].status, 'opted_out');
  assert.equal(report.leads[0].reply.text, incoming['stripped-text']);
  assert.equal(db.suppressedEmail(deliveries[0].draft.to), true);
  const second = (await request('campaign-save', { ...input, mode: 'send', interval: 60 })).campaign;
  now += 60 * 60000;
  await app.tick(sales);
  assert.equal((await request('campaign-read', second)).leads[0].status, 'suppressed');
  assert.equal(deliveries.length, 1);
  const paused = await request('campaign-pause', second);
  assert.equal(paused.campaign.nextAt, null);
});
