import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { backend } from '../../sales/backend.mjs';
import { service } from '../../sales/service.mjs';
import { agreement } from '../../sales/terms.mjs';
import { metadata } from '../../sales/model.mjs';

const output = process.argv[2]; assert(output, 'Select a new evidence file.');
const config = JSON.parse(readFileSync(path.join(homedir(), '.config/gigtax-sales/installation.json')));
const suffix = randomUUID().slice(0, 8), prefix = `GigTax workflow diagnostic ${suffix}`, boards = {}, checks = [], archived = [];
const receipt = { ok: false, checkedAt: new Date().toISOString(), scope: 'Actual Worker/D1 in isolated synthetic boards. No real office, mailbox, contract, email or payment is created. Manual-send evidence and signatures are fictional test fixtures.', checks };
async function request(route, method = 'GET', body) {
  const response = await fetch('https://tinkyspeak-tiles.tinkyspeak.workers.dev' + route, { method, headers: { Authorization: `Bearer ${config.GIGTAX_TINKY_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Diagnostic Worker returned HTTP ${response.status}.`); return response.json();
}
try {
  for (const kind of ['offices', 'agents', 'events', 'enrollments']) boards[kind] = (await request('/api/outreach/boards', 'POST', { name: `${prefix} ${kind}`, config_json: { purpose: 'synthetic-workflow-proof', kind } })).board.id;
  const env = { ...config, GIGTAX_SALES_BOARDS: JSON.stringify(boards) }, db = backend(env), app = service(env, db), owner = { id: 'owner', name: 'Synthetic Diagnostic Owner', role: 'owner', states: [] };
  await db.setTerms(agreement({ business: 'SYNTHETIC DIAGNOSTIC ONLY — NO REAL CONTRACT', cancellation: 'No real agreement, person, service, message or payment. Test fixture only.', approved: true }));
  const agent = await app.dispatch(owner, 'create-agent', { name: 'Synthetic Diagnostic Agent', email: `agent-${suffix}@example.test`, states: ['CT'] });
  const login = await app.login({ email: agent.agent.email, code: agent.code }), user = await app.identity(login.token);
  const office = (await app.dispatch(user, 'create-office', { name: `${prefix} SYNTHETIC OFFICE`, address: '123 Example Street', city: 'Hartford', state: 'CT', postalCode: '06103', contact: 'Synthetic Office Owner', email: `owner-${suffix}@example.test` })).office;
  const progress = async (kind, extra = {}) => { const current = await db.get('offices', office.id); return app.dispatch(user, 'record-progress', { id: office.id, expectedRevision: metadata(current).revision || '', requestId: randomUUID(), kind, channel: 'call', note: 'Synthetic workflow fixture only.', waitingOn: kind === 'replied' ? 'us' : 'office', nextAction: kind === 'replied' ? 'Send the synthetic agreement' : 'Wait for synthetic reply', ...extra }); };
  await progress('contacted'); await progress('replied', { outcome: 'interested' });
  await app.dispatch(user, 'verify-office', { id: office.id, finding: 'independent', reviewed: true, sourceURL: 'https://example.test/team', note: 'Synthetic ownership fixture.' });
  let read = await service(env, backend(env)).dispatch(user, 'bootstrap');
  assert.equal(read.offices[0].pipeline.lastContact.by, user.name); assert.equal(read.offices[0].pipeline.lastReply.outcome, 'interested'); assert.equal(read.offices[0].pipeline.waitingOn, 'us');
  checks.push('actual stored agent sign-in, assigned office, contact, interested reply, waiting state and next step survive a fresh adapter');
  const shared = await app.dispatch(owner, 'save-mailbox', { kind: 'shared', name: 'Synthetic Shared Sender', email: 'sales@example.test', mode: 'email_app', approved: true });
  await app.dispatch(user, 'save-mailbox', { kind: 'agent', name: user.name, email: user.email, mode: 'email_app', approved: true });
  assert.equal((await app.dispatch(user, 'mailboxes')).mailboxes.length, 2);
  const invitation = await app.dispatch(user, 'invite', { id: office.id, ownerName: 'Synthetic Office Owner', email: `owner-${suffix}@example.test` }), token = Object.fromEntries(new URLSearchParams(new URL(invitation.link).hash.slice(1)));
  const preview = await app.dispatch(user, 'preview-contract-email', { id: office.id, enrollmentId: token.id, senderId: shared.mailboxes[0].id });
  assert.equal(preview.directSendingAvailable, false);
  await app.dispatch(user, 'record-contract-sent', { id: office.id, enrollmentId: token.id, deliveryId: preview.id, previewDigest: preview.previewDigest, reviewed: true, evidence: 'Synthetic staff-confirmed manual send. No email was actually sent.' });
  read = await service(env, backend(env)).dispatch(user, 'bootstrap');
  assert.equal(read.offices[0].pipeline.stage, 'contract_sent'); assert.equal(read.offices[0].pipeline.waitingOn, 'signature');
  assert.equal(read.contracts[0].deliveries[0].status, 'manual_sent');
  checks.push('shared/agent sender details, contract snapshot, reviewed preview and explicit synthetic manual-send evidence persist without provider requests');
  const view = await app.signup('view', token); assert.equal(view.paymentsConfigured, false);
  const signed = await app.signup('sign', { ...token, signature: 'Synthetic Office Owner', email: view.email, accepted: true, independent: true, authorized: true, electronicConsent: true, termsHash: view.terms.hash });
  assert.equal(signed.signed, true); assert.equal(signed.active, false);
  const fresh = service(env, backend(env)), final = await fresh.dispatch(user, 'bootstrap');
  assert.equal(final.offices[0].pipeline.stage, 'contract_signed'); assert.equal(final.offices[0].pipeline.waitingOn, 'payment'); assert.equal(final.offices[0].pipeline.converted, true); assert.equal(final.offices[0].pipeline.paidActive, false);
  assert.equal(final.contracts[0].address, '123 Example Street'); assert.equal(final.contracts[0].postalCode, '06103');
  assert.equal((await fresh.signup('receipt', token)).termsHash, view.terms.hash);
  checks.push('payment-deferred signature and exact receipt survive a fresh process; signed office address/ZIP is available while paid activation remains false');
  const other = { id: 'unassigned', role: 'agent', name: 'Synthetic Unassigned', states: ['CT'] };
  assert.equal((await fresh.dispatch(other, 'contracts')).contracts.length, 0);
  await app.dispatch(owner, 'revoke-agent', { id: user.id }); await assert.rejects(fresh.identity(login.token), /revoked/);
  checks.push('unassigned agents cannot read contracts and persisted revocation ends the diagnostic agent session');
  receipt.ok = true;
} catch (error) { receipt.error = error.message; }
finally {
  const owned = new Set(Object.values(boards));
  try { for (const board of (await request('/api/outreach/boards')).boards) if (board.name?.startsWith(prefix + ' ') && board.config_json?.purpose === 'synthetic-workflow-proof') owned.add(board.id); } catch { /* Known boards are still cleaned up below. */ }
  for (const id of owned) { try { await request(`/api/outreach/boards/${id}`, 'DELETE'); archived.push(id); } catch { receipt.ok = false; receipt.cleanupError = 'A diagnostic board could not be archived.'; } }
  try { const all = (await request('/api/outreach/boards')).boards; assert(archived.length === 4 && archived.every(id => all.find(board => board.id === id)?.archived_at)); }
  catch { receipt.ok = false; receipt.cleanupError = 'The four diagnostic board archives were not verified.'; }
  receipt.diagnosticBoardsArchived = archived;
  writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(receipt)); process.exitCode = receipt.ok ? 0 : 1;
}
