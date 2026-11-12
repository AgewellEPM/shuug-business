import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { backend } from '../../sales/backend.mjs';
import { service } from '../../sales/service.mjs';
import { metadata } from '../../sales/model.mjs';

// New disposable diagnostic boards only. Never writes real pipeline records.
const output = process.argv[2];
if (!output) throw new Error('Select a new evidence file.');
const config = JSON.parse(readFileSync(path.join(homedir(), '.config/gigtax-sales/installation.json'), 'utf8'));
const boards = {}, archived = [], checks = [], suffix = randomUUID().slice(0, 8);
const receipt = { ok: false, checkedAt: new Date().toISOString(), scope: 'Actual Worker/D1 contact persistence on isolated synthetic boards; no real office records, outreach, invitations, payments or provider changes.', checks };
async function request(route, method = 'GET', body) {
  const response = await fetch('https://tinkyspeak-tiles.tinkyspeak.workers.dev' + route, { method,
    headers: { Authorization: `Bearer ${config.GIGTAX_TINKY_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Diagnostic backend returned HTTP ${response.status}.`);
  return response.json();
}
try {
  for (const kind of ['offices', 'agents', 'events', 'enrollments']) boards[kind] = (await request('/api/outreach/boards', 'POST', { name: `GigTax synthetic contacts ${suffix} ${kind}`, config_json: { purpose: 'synthetic-gigtax-contacts-proof', kind } })).board.id;
  const env = { ...config, GIGTAX_SALES_BOARDS: JSON.stringify(boards) }, db = backend(env), app = service(env, db);
  const owner = { id: 'owner', name: 'Synthetic Diagnostic Owner', role: 'owner', states: [] };
  const office = (await app.dispatch(owner, 'create-office', { name: `SYNTHETIC CONTACT TEST ${suffix}`, address: '123 Example Street', city: 'Hartford', state: 'CT' })).office;
  const contactId = randomUUID();
  const change = { id: office.id, contactId, requestId: randomUUID(), expectedRevision: metadata(office).revision || '',
    contact: { name: 'Synthetic Office Owner', role: 'owner', email: 'owner@example.test', phone: '+1 860 555 0100', preference: 'email', sourceURL: 'https://example.test/team', sourceNote: 'Synthetic source evidence only.', reviewed: true } };
  await app.dispatch(owner, 'save-contact', change);
  const fresh = service(env, backend(env)), record = await fresh.dispatch(owner, 'office', { id: office.id });
  assert.equal(record.contacts.contacts[0].name, 'Synthetic Office Owner'); assert(record.contacts.contacts[0].verification);
  assert.equal(record.office.contact_email, 'owner@example.test'); assert.equal(metadata(record.office).independence, 'unverified');
  checks.push('fresh backend adapter reads persisted owner, business details, source check and primary fields');
  assert.equal((await fresh.dispatch(owner, 'save-contact', change)).duplicate, true);
  const second = { ...change, requestId: randomUUID(), contactId: randomUUID(), expectedRevision: record.contacts.revision,
    contact: { name: 'Synthetic Manager', role: 'manager', preference: 'phone', phone: '+1 860 555 0199' } };
  await fresh.dispatch(owner, 'save-contact', second);
  await assert.rejects(fresh.dispatch(owner, 'save-contact', { ...second, requestId: randomUUID() }), error => error.status === 409);
  checks.push('exact retry is idempotent and a stale contact revision is rejected');
  const directory = await fresh.dispatch(owner, 'rolodex'); assert.equal(directory.coverage.contacts, 2); assert.equal(directory.coverage.owners, 1);
  const agent = { id: 'synthetic-unassigned', name: 'Synthetic Unassigned', role: 'agent', states: ['CT'] };
  assert.equal((await fresh.dispatch(agent, 'rolodex')).contacts.length, 0);
  await assert.rejects(fresh.dispatch(agent, 'archive-contact', { ...second, contactId }), error => error.status === 404);
  checks.push('Rolodex persists multiple people and does not reveal them to an unassigned agent');
  let current = await fresh.dispatch(owner, 'office', { id: office.id });
  await fresh.dispatch(owner, 'archive-contact', { id: office.id, contactId, requestId: randomUUID(), expectedRevision: current.contacts.revision });
  current = await fresh.dispatch(owner, 'office', { id: office.id });
  assert(current.contacts.contacts.find(c => c.id === contactId).archived); assert.equal(current.office.contact_email, '');
  await fresh.dispatch(owner, 'restore-contact', { id: office.id, contactId, requestId: randomUUID(), expectedRevision: current.contacts.revision });
  assert.equal((await fresh.dispatch(owner, 'rolodex')).coverage.contacts, 2);
  checks.push('archive and restore retain contacts and clear the old primary without deleting history');
  receipt.ok = true;
} catch (error) { receipt.error = error.message; }
finally {
  for (const id of Object.values(boards)) {
    try { await request(`/api/outreach/boards/${id}`, 'DELETE'); archived.push(id); } catch { receipt.ok = false; receipt.cleanupError = 'Diagnostic board archive failed.'; }
  }
  if (archived.length) {
    try { const saved = (await request('/api/outreach/boards')).boards; assert(archived.every(id => saved.find(board => board.id === id)?.archived_at)); }
    catch { receipt.ok = false; receipt.cleanupError = 'Diagnostic archive could not be verified.'; }
  }
  receipt.diagnosticBoardsArchived = archived;
  writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt)); process.exitCode = receipt.ok ? 0 : 1;
}
