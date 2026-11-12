import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { contactFixture } from '../scripts/sales/contact-fixture.mjs';
import { agreement } from './terms.mjs';
import { service } from './service.mjs';
import { metadata } from './model.mjs';
import { progressProjection } from './pipeline.mjs';
import { sendContractMail, mailConfig } from './mail-provider.mjs';

async function fixture({ connected = false, mode = 'live', mailSender } = {}) {
  const f = contactFixture();
  f.db.terms = async () => agreement({ business: 'SYNTHETIC CONTRACT TEST', cancellation: 'Synthetic fixture only; no real contract or payment.', approved: true });
  if (connected) Object.assign(f.env, { GIGTAX_MAILGUN_API_KEY: 'synthetic-provider-key', GIGTAX_MAILGUN_DOMAIN: 'example.test', GIGTAX_MAILGUN_REGION: 'US', GIGTAX_MAILGUN_MODE: mode });
  const app = service(f.env, f.db, undefined, { mailSender });
  const office = await f.createOffice({ contact: 'Synthetic Office Owner', email: 'office@example.test' });
  await app.dispatch(f.owner, 'verify-office', { id: office.id, finding: 'independent', reviewed: true, sourceURL: 'https://example.test/team', note: 'Synthetic ownership fixture.' });
  const invitation = await app.dispatch(f.owner, 'invite', { id: office.id, ownerName: 'Synthetic Office Owner', email: 'office@example.test' });
  const token = Object.fromEntries(new URLSearchParams(new URL(invitation.link).hash.slice(1)));
  const mailbox = await app.dispatch(f.owner, 'save-mailbox', { kind: 'shared', name: 'Synthetic GigTax Team', email: 'sales@example.test', mode: connected ? 'provider' : 'email_app', approved: true });
  return { ...f, app, office, token, senderId: mailbox.mailboxes[0].id, preview: () => app.dispatch(f.owner, 'preview-contract-email', { id: office.id, enrollmentId: token.id, senderId: mailbox.mailboxes[0].id }) };
}
const signedInput = (f, view) => ({ ...f.token, signature: 'Synthetic Office Owner', email: 'office@example.test', termsHash: view.terms.hash, accepted: true, authorized: true, independent: true, electronicConsent: true });

test('contact, reply and next-step facts survive fresh reads without inventing a conversion', async () => {
  const f = contactFixture(), office = await f.createOffice();
  const contact = { id: office.id, requestId: randomUUID(), expectedRevision: metadata(office).revision || '', kind: 'contacted', channel: 'call', note: 'Synthetic phone conversation.', waitingOn: 'office', nextAction: 'Wait for owner callback', nextDue: '2026-12-15' };
  await f.app.dispatch(f.owner, 'record-progress', contact);
  assert.equal((await f.app.dispatch(f.owner, 'record-progress', contact)).duplicate, true);
  let current = await f.db.get('offices', office.id);
  await f.app.dispatch(f.owner, 'record-progress', { ...contact, requestId: randomUUID(), expectedRevision: metadata(current).revision, kind: 'replied', outcome: 'questions', waitingOn: 'us', note: 'Synthetic owner asked about the agreement.', nextAction: 'Answer the owner questions' });
  const workspace = await service(f.env, f.db).dispatch(f.owner, 'bootstrap'), item = workspace.offices[0];
  assert.equal(item.pipeline.lastContact.channel, 'call'); assert.equal(item.pipeline.lastReply.outcome, 'questions');
  assert.equal(item.pipeline.waitingOn, 'us'); assert.equal(item.pipeline.nextAction, 'Answer the owner questions'); assert.equal(item.pipeline.converted, false);
  assert.equal(item.status, 'replied');
  await assert.rejects(f.app.dispatch(f.owner, 'update-office', { id: office.id, stage: 'contract_signed' }), /Contract stages/);
});

test('owners can sign and download their agreement while Stripe remains unconfigured, without activation', async () => {
  const f = await fixture(), view = await f.app.signup('view', f.token);
  assert.equal(view.paymentsConfigured, false);
  const consent = signedInput(f, view);
  await assert.rejects(f.app.signup('sign', { ...consent, electronicConsent: false }), /electronic signature/);
  await assert.rejects(f.app.signup('sign', { ...consent, termsHash: 'changed' }), /exact agreement/);
  const signed = await f.app.signup('sign', consent);
  assert.equal(signed.signed, true); assert.equal(signed.active, false); assert.equal(signed.terms.hash, view.terms.hash);
  assert.equal((await f.app.signup('receipt', f.token)).signature, consent.signature);
  assert.equal((await f.app.signup('sign', consent)).acceptedAt, signed.acceptedAt);
  assert.equal(f.rows.enrollments[0].status, 'payment_pending'); assert.equal(f.rows.offices[0].status, 'contract_signed');
  const pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.converted, true); assert.equal(pipeline.paidActive, false); assert.equal(pipeline.waitingOn, 'payment');
  assert.equal((await f.app.dispatch(f.owner, 'contracts')).contracts[0].address, '123 Example Street');
});

test('opening an email preview is not a send; a reviewed manual send records who sent it', async () => {
  const f = await fixture(), preview = await f.preview();
  assert.equal(preview.directSendingAvailable, false);
  let pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.lastContact, null); assert.equal(pipeline.stage, 'invited');
  const input = { id: f.office.id, enrollmentId: f.token.id, deliveryId: preview.id, previewDigest: preview.previewDigest, reviewed: true };
  await assert.rejects(f.app.dispatch(f.owner, 'send-contract-email', input), /not connected/);
  await f.app.dispatch(f.owner, 'record-contract-sent', { ...input, evidence: 'Synthetic test: staff records sending through their own email app.' });
  pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.lastContact.by, f.owner.name); assert.equal(pipeline.stage, 'contract_sent'); assert.equal(pipeline.converted, false);
  const office = await f.app.dispatch(f.owner, 'office', { id: f.office.id });
  assert(office.events.every(row => !metadata(row).sealedPreview));
});

test('one durable provider attempt survives an uncertain response and exact retries never resend', async () => {
  let calls = 0;
  const f = await fixture({ connected: true, mailSender: async () => { calls++; return { status: 'uncertain', providerId: null }; } });
  const preview = await f.preview(), input = { id: f.office.id, enrollmentId: f.token.id, deliveryId: preview.id, previewDigest: preview.previewDigest, reviewed: true };
  assert.equal((await f.app.dispatch(f.owner, 'send-contract-email', input)).status, 'uncertain');
  assert.equal((await f.app.dispatch(f.owner, 'send-contract-email', input)).duplicate, true); assert.equal(calls, 1);
  const second = await f.preview();
  await assert.rejects(f.app.dispatch(f.owner, 'send-contract-email', { ...input, deliveryId: second.id, previewDigest: second.previewDigest }), /already has a send attempt/);
  const pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.lastContact, null); assert.equal(pipeline.converted, false);
});

test('provider acceptance is distinct from confirmed recipient delivery; test requests never count as contact', async () => {
  for (const mode of ['live', 'test']) {
    const f = await fixture({ connected: true, mode, mailSender: async () => ({ status: 'accepted', providerId: '<synthetic-message@example.test>' }) });
    const preview = await f.preview();
    const result = await f.app.dispatch(f.owner, 'send-contract-email', { id: f.office.id, enrollmentId: f.token.id, deliveryId: preview.id, previewDigest: preview.previewDigest, reviewed: true });
    assert.equal(result.status, 'accepted'); assert.equal(result.mode, mode);
    const pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
    assert.equal(pipeline.lastContact, null); assert.equal(pipeline.stage, mode === 'test' ? 'invited' : 'contract_sent');
  }
});

test('sender, office and recipient suppression checks are repeated after preview', async () => {
  let calls = 0;
  const f = await fixture({ connected: true, mailSender: async () => { calls++; return { status: 'accepted', providerId: 'synthetic' }; } }), preview = await f.preview();
  await f.app.dispatch(f.owner, 'update-office', { id: f.office.id, stage: 'do_not_contact' });
  await assert.rejects(f.app.dispatch(f.owner, 'send-contract-email', { id: f.office.id, enrollmentId: f.token.id, deliveryId: preview.id, previewDigest: preview.previewDigest, reviewed: true }), /paused/);
  assert.equal(calls, 0);
  const agent = await f.app.dispatch(f.owner, 'create-agent', { name: 'Synthetic Agent', email: 'agent@example.test', states: ['CT'] });
  const login = await f.app.login({ email: 'agent@example.test', code: agent.code }), user = await f.app.identity(login.token);
  await assert.rejects(f.app.dispatch(user, 'save-mailbox', { kind: 'shared', name: 'Fake', email: 'someone@example.test', mode: 'provider', approved: true }), /Only the workspace owner/);
  await assert.rejects(f.app.dispatch(user, 'save-mailbox', { kind: 'agent', name: 'Fake', email: 'someone@example.test', mode: 'email_app', approved: true }), /match your agent email/);
  const own = await f.app.dispatch(user, 'save-mailbox', { kind: 'agent', name: 'Synthetic Agent', email: user.email, mode: 'email_app', approved: true });
  assert.equal(own.mailboxes.filter(profile => profile.kind === 'agent').length, 1);
});

test('the provider transport uses only the exact reviewed recipient and labels malformed results uncertain', async () => {
  const config = mailConfig({ GIGTAX_MAILGUN_API_KEY: 'synthetic-api-key', GIGTAX_MAILGUN_DOMAIN: 'example.test', GIGTAX_MAILGUN_REGION: 'US', GIGTAX_MAILGUN_MODE: 'test' });
  const preview = { from: 'sales@example.test', fromName: 'Synthetic Sales', to: 'office@example.test', replyTo: 'agent@example.test', subject: 'Synthetic contract', text: 'No real sending.' };
  let sent;
  const result = await sendContractMail(config, preview, 'test-delivery', async (_url, options) => { sent = options.body; return new Response(JSON.stringify({ id: '<synthetic@example.test>' }), { status: 200 }); });
  assert.equal(result.status, 'accepted'); assert.equal(sent.get('to'), preview.to); assert.equal(sent.get('o:testmode'), 'yes'); assert.equal(sent.get('o:tracking'), 'no');
  assert.equal((await sendContractMail(config, preview, 'test-delivery', async () => new Response('broken', { status: 200 }))).status, 'uncertain');
});

test('new send/signature facts replace stale next steps, while explicit plans survive previews and test sends', async () => {
  const f = await fixture({ connected: true, mode: 'test', mailSender: async () => ({ status: 'accepted', providerId: '<synthetic@example.test>' }) });
  let current = await f.db.get('offices', f.office.id);
  await f.app.dispatch(f.owner, 'record-progress', { id: f.office.id, requestId: randomUUID(), expectedRevision: metadata(current).revision, kind: 'waiting', channel: 'other', note: 'Synthetic callback expected.', waitingOn: 'office', nextAction: 'Wait for the owner callback' });
  const preview = await f.preview();
  await f.app.dispatch(f.owner, 'send-contract-email', { id: f.office.id, enrollmentId: f.token.id, deliveryId: preview.id, previewDigest: preview.previewDigest, reviewed: true });
  let pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.nextAction, 'Wait for the owner callback'); assert.equal(pipeline.waitingOn, 'office');
  f.env.GIGTAX_MAILGUN_MODE = 'live';
  const live = await f.preview();
  await f.app.dispatch(f.owner, 'send-contract-email', { id: f.office.id, enrollmentId: f.token.id, deliveryId: live.id, previewDigest: live.previewDigest, reviewed: true });
  pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.waitingOn, 'delivery'); assert.match(pipeline.nextAction, /Confirm email delivery/);
  const view = await f.app.signup('view', f.token); await f.app.signup('sign', signedInput(f, view));
  pipeline = (await f.app.dispatch(f.owner, 'bootstrap')).offices[0].pipeline;
  assert.equal(pipeline.waitingOn, 'payment'); assert.match(pipeline.nextAction, /payment/);
});
