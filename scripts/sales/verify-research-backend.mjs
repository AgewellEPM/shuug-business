import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { backend } from '../../sales/backend.mjs';
import { service } from '../../sales/service.mjs';
import { secret, metadata } from '../../sales/model.mjs';
import { agreement } from '../../sales/terms.mjs';

// Actual Worker/D1, isolated synthetic boards. Research is injected here to
// test persistence; the real first-party transport has a separate live check.
// No real prospects, messages, checkout requests, payments or provider changes.
const config = JSON.parse(readFileSync(path.join(homedir(), '.config/gigtax-sales/installation.json'), 'utf8'));
const boards = {}, archived = [], checks = [], suffix = secret().slice(0, 8);
const receipt = { ok: false, verifiedAt: new Date().toISOString(), checks, scope: 'Actual Worker/D1, isolated synthetic boards and injected research; no outreach or payment.' };
async function request(route, method = 'GET', body) {
  const response = await fetch('https://tinkyspeak-tiles.tinkyspeak.workers.dev' + route, {
    method, headers: { Authorization: `Bearer ${config.GIGTAX_TINKY_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Backend proof HTTP ${response.status}`);
  return response.json();
}
try {
  for (const kind of ['offices', 'agents', 'events', 'enrollments']) {
    const result = await request('/api/outreach/boards', 'POST', { name: `GigTax diagnostic ${suffix} ${kind}`, config_json: { purpose: 'synthetic-gigtax-proof', kind } });
    boards[kind] = result.board.id;
  }
  const env = { ...config, GIGTAX_SALES_BOARDS: JSON.stringify(boards) }, db = backend(env);
  const probe = await db.create('offices', { town: `SYNTHETIC CAS PROBE ${suffix}`, status: 'new', notes: '{}' });
  const outcomes = await Promise.allSettled(['first', 'second'].map(value => db.patchIfUnchanged('offices', probe.id, '{}', { notes: JSON.stringify({ value }) })));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  checks.push('same-snapshot conditional D1 writes produce one success and one conflict');

  const researcher = async () => ({ checkedAt: new Date().toISOString(), evidence: [
    { field: 'email', value: 'owner@example.test', sourceURL: 'https://example.test/contact', excerpt: 'Synthetic contact fixture only', confidence: 'high' },
  ], ownership: { status: 'unverified', requiresOwnerConfirmation: true }, pages: [], issues: [] });
  const app = service(env, db, undefined, { researcher }), owner = { id: 'owner', name: 'Synthetic Owner', role: 'owner', states: [] };
  await db.setTerms(agreement({ business: 'SYNTHETIC TEST ONLY — NO REAL AGREEMENT', cancellation: 'No contract or payment; synthetic persistence check.', approved: true }));
  const agent = await app.dispatch(owner, 'create-agent', { name: 'Synthetic Agent', email: `test-${suffix}@example.test`, states: ['CT'] });
  const login = await app.login({ email: agent.agent.email, code: agent.code }), user = await app.identity(login.token);
  checks.push('real stored agent credentials authenticate');
  const input = { name: `SYNTHETIC TEST OFFICE ${suffix}`, address: '123 Example Street', city: 'Hartford', state: 'CT', postalCode: '06101', contact: 'Synthetic Office Owner', website: 'https://example.test', source: 'https://example.test' };
  const { office } = await app.dispatch(user, 'create-office', input);
  assert.equal(String(office.assigned_to), user.id); assert.equal(metadata(office).postalCode, '06101'); assert.equal(metadata(office).independence, 'unverified');
  const { research } = await app.dispatch(user, 'research-office', { id: office.id });
  await app.dispatch(user, 'apply-research', { id: office.id, token: research.token, reportId: research.reportId, selected: [research.proposals[0].id], reviewed: true });
  await app.dispatch(user, 'verify-office', { id: office.id, finding: 'independent', sourceURL: 'https://example.test/about', note: 'Synthetic ownership evidence reviewed.', reviewed: true });
  await app.dispatch(user, 'update-office', { id: office.id, contactRole: 'owner', contactVerified: true, emailVerified: true, verificationSource: 'https://example.test/contact', verificationNote: 'Synthetic contact fixture reviewed.', nextFollowup: '2028-02-29' });
  const draft = await app.dispatch(user, 'save-outreach-draft', { id: office.id, to: 'owner@example.test', subject: 'Synthetic draft — do not send', message: 'Persistence test. No email was sent.', reviewed: true });
  assert.equal(draft.sent, false);
  const fresh = service(env, backend(env)), record = await fresh.dispatch(user, 'office', { id: office.id });
  assert.equal(record.office.contact_email, 'owner@example.test'); assert.equal(record.office.meeting_date, '2028-02-29');
  assert.equal(metadata(record.office).researchSources.email.sourceURL, 'https://example.test/contact');
  assert(record.events.some(event => metadata(event).action === 'outreach_draft' && event.status === 'draft'));
  checks.push('fresh adapter reads persisted ZIP, assignment, sourced contact, explicit proof, draft and follow-up');

  const invite = await app.dispatch(user, 'invite', { id: office.id, email: 'owner@example.test', ownerName: input.contact });
  const body = Object.fromEntries(new URLSearchParams(new URL(invite.link).hash.slice(1))), view = await fresh.signup('view', body);
  assert.equal(view.terms.upfrontCents, 50000); assert.equal(view.terms.termMonths, 12);
  await assert.rejects(fresh.signup('accept', { ...body, email: 'owner@example.test', signature: input.contact, termsHash: view.terms.hash, accepted: true, authorized: true, independent: true }), /Payment connection/);
  assert.equal((await db.get('offices', office.id)).status, 'invited');
  checks.push('synthetic invitation retains exact terms and missing Stripe prevents activation without payment');
  await app.dispatch(user, 'update-office', { id: office.id, stage: 'do_not_contact' });
  for (const action of ['research-office', 'save-outreach-draft', 'invite']) await assert.rejects(app.dispatch(user, action, { id: office.id }), /do not contact|Confirm independent/);
  await assert.rejects(fresh.signup('view', body), /no longer available/);
  checks.push('persisted do-not-contact blocks research, drafts and invitation access');
  const other = await app.dispatch(owner, 'create-agent', { name: 'Other Synthetic Agent', email: `other-${suffix}@example.test`, states: ['CT'] });
  const second = await app.login({ email: other.agent.email, code: other.code });
  await assert.rejects(app.dispatch(await app.identity(second.token), 'office', { id: office.id }), /not found/);
  await app.dispatch(owner, 'revoke-agent', { id: user.id }); await assert.rejects(fresh.identity(login.token), /revoked/);
  checks.push('real assignment isolation and persisted agent revocation');
  const first = await db.discover('CT', 'Hartford'), all = [...first.results];
  for (let offset = 50; offset < first.total; offset += 50) all.push(...(await db.discover('CT', 'Hartford', { offset, limit: 50 })).results);
  assert.equal(all.length, first.total); assert.equal(new Set(all.map(item => item.candidateId)).size, first.total);
  receipt.discovery = { state: 'CT', city: 'Hartford', total: first.total, uniqueCandidatesReached: all.length };
  checks.push('real IRS directory reaches every unique candidate across all pages');
  receipt.ok = true;
} catch (error) { receipt.error = error.message; }
finally {
  for (const id of Object.values(boards)) {
    try { await request(`/api/outreach/boards/${id}`, 'DELETE'); archived.push(id); }
    catch { receipt.ok = false; receipt.cleanupError = 'A diagnostic board could not be archived.'; }
  }
  if (archived.length) {
    try { const saved = (await request('/api/outreach/boards')).boards; assert(archived.every(id => saved.find(board => board.id === id)?.archived_at)); }
    catch { receipt.ok = false; receipt.cleanupError = 'Diagnostic board archive confirmation failed.'; }
  }
  receipt.diagnosticBoardsArchived = archived;
  mkdirSync(path.resolve('docs/deployments'), { recursive: true });
  writeFileSync('docs/deployments/gigtax-sales-backend-proof-20261108.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2)); process.exitCode = receipt.ok ? 0 : 1;
}
