import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHandler } from '../../sales/handler.mjs';
import { contactFixture } from './contact-fixture.mjs';
import { agreement } from '../../sales/terms.mjs';

test('real Shuug stdio MCP reads and changes the same contacts through HTTP, with retry and identity restrictions', async () => {
  const f = contactFixture(), office = await f.createOffice();
  const directory = mkdtempSync(path.join(tmpdir(), 'gigtax-contact-mcp-'));
  const clients = [];
  const localCandidate = { candidateId: 'synthetic-map-candidate', name: 'Synthetic Tax Map Office', address: '42 Fixture Street', city: 'Hartford', state: 'CT', zip: '06103', url: 'https://www.irs.gov/pub/irs-efile/ct.zip' };
  const localTools = { localDiscovery: { discoverer: async () => ({ results: [localCandidate], total: 1, locality: 'Hartford', correction: { from: 'hartord', to: 'Hartford' } }), registry: async () => ({ supported: true, results: [] }),
    search: async () => [{ url:'https://fixture-tax.org',title:'Synthetic official website' }], researcher:async()=>({evidence:[{field:'email',value:'office@fixture-tax.org',sourceURL:'https://fixture-tax.org/contact'}]}), geocoder: async rows => rows.map(row => ({ candidateId: row.candidateId, location: { lat: 41.76, lng: -72.68 } })), lookup: async () => ({ supported: true, matches: [{ legalName: 'Synthetic Tax Map Office LLC', principals: [{ name: 'Synthetic Registry Principal', role: 'Manager' }] }] }) } };
  const server = createServer((req, res) => createHandler(f.env, f.db, localTools)(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; f.env.GIGTAX_SALES_ORIGIN = origin;
  async function connect(code, email = '') {
    const filename = path.join(directory, randomUUID()); writeFileSync(filename, code, { mode: 0o600 });
    const root = process.cwd(), client = new Client({ name: 'synthetic-gigtax-contact-check', version: '1.0.0' });
    clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', path.join(root, 'node_modules/tsx/dist/loader.mjs'), path.join(root, 'scripts/mcp-server.ts')], cwd: root,
      env: { ...process.env, SHUUG_SALES_ONLY: 'true', GIGTAX_SALES_ORIGIN: origin, GIGTAX_SALES_CODE_FILE: filename, GIGTAX_SALES_EMAIL: email }, stderr: 'pipe' });
    await client.connect(transport); return client;
  }
  async function call(client, name, input = {}) {
    const result = await client.callTool({ name, arguments: input });
    const data = result.content.find(content => content.type === 'text')?.text;
    return result.isError ? { error: data } : JSON.parse(data);
  }
  try {
    const client = await connect(f.code);
    assert.equal(client.getServerVersion().name, 'shuug-business');
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['sdr_catalog', 'sdr_read', 'sdr_command', 'sdr_progress', 'sdr_contract', 'sdr_sender']);
    assert.equal((await call(client, 'sdr_catalog')).storage, 'Existing GigTax private sales records');
    const coverage = await call(client, 'sdr_read', { resource:'state_coverage' });
    assert.equal(coverage.states.length,51);assert.equal(coverage.states.filter(row=>row.automaticRecords).length,7);
    const towns=await call(client,'sdr_read',{resource:'territory_localities',state:'CT'});
    assert.equal(towns.stateTotal,169);assert.equal(towns.results.length,100);
    const mappedSearch = await call(client, 'sdr_read', { resource: 'local_offices', city: 'hartord', state: 'CT' });
    assert.equal(mappedSearch.correction.to, 'Hartford');
    const candidateToken = mappedSearch.results[0].candidateToken;
    const researched = await call(client, 'sdr_read', { resource:'contact_research', candidateToken:mappedSearch.results[0].researchToken, website:'https://fixture-tax.org', websiteReviewed:true });
    assert.equal(researched.evidence[0].value,'office@fixture-tax.org'); assert.equal(researched.evidence[0].scope,'business');
    assert.equal((await call(client, 'sdr_read', { resource: 'business', candidateToken })).matches[0].principals[0].role, 'Manager');
    assert.equal((await call(client, 'sdr_read', { resource: 'map_addresses', candidateTokens: [candidateToken] })).results[0].location.lat, 41.76);
    const read = await call(client, 'sdr_read', { resource: 'office', id: String(office.id) });
    const input = { action: 'save-contact', id: String(office.id), expectedRevision: read.contacts.revision, requestId: randomUUID(), contactId: randomUUID(),
      contact: { name: 'Synthetic MCP Owner', role: 'owner', email: 'owner@example.test', preference: 'email', reviewed: true, sourceURL: 'https://example.test/team', sourceNote: 'Synthetic explicit source check.' } };
    const saved = await call(client, 'sdr_command', input);
    assert.equal(saved.book.contacts[0].name, 'Synthetic MCP Owner'); assert(saved.book.contacts[0].verification);
    assert.equal((await call(client, 'sdr_command', input)).duplicate, true);
    assert.equal((await f.app.dispatch(f.owner, 'rolodex')).contacts[0].email, 'owner@example.test');
    f.db.terms = async () => agreement({ business: 'SYNTHETIC MCP CONTRACT', cancellation: 'Synthetic only; no real contract, email or payment.', approved: true });
    await f.app.dispatch(f.owner, 'verify-office', { id: office.id, finding: 'independent', reviewed: true, sourceURL: 'https://example.test/team', note: 'Synthetic ownership checked.' });
    const contract = await call(client, 'sdr_contract', { action: 'prepare', id: String(office.id), ownerName: 'Synthetic MCP Owner', email: 'owner@example.test' });
    assert(contract.link?.includes('/office-signup#'));
    const mailbox = await call(client, 'sdr_sender', { action: 'save', kind: 'shared', name: 'Synthetic MCP Sales', email: 'sales@example.test', mode: 'email_app', approved: true });
    const preview = await call(client, 'sdr_contract', { action: 'preview_email', id: String(office.id), enrollmentId: String(contract.enrollmentId), senderId: mailbox.mailboxes[0].id });
    assert.equal(preview.directSendingAvailable, false);
    await call(client, 'sdr_contract', { action: 'record_sent', id: String(office.id), enrollmentId: String(contract.enrollmentId), deliveryId: preview.id, previewDigest: preview.previewDigest, reviewed: true, evidence: 'Synthetic MCP records a staff-confirmed external-app send.' });
    const refreshed = await call(client, 'sdr_read', { resource: 'office', id: String(office.id) });
    await call(client, 'sdr_progress', { id: String(office.id), expectedRevision: refreshed.pipeline.revision, requestId: randomUUID(), kind: 'replied', channel: 'email', note: 'Synthetic owner asked a question.', outcome: 'questions', waitingOn: 'us', nextAction: 'Answer the question' });
    const pipeline = await call(client, 'sdr_read', { resource: 'pipeline' });
    assert.equal(pipeline.offices[0].pipeline.lastReply.outcome, 'questions'); assert.equal(pipeline.offices[0].pipeline.waitingOn, 'us');
    assert.equal((await call(client, 'sdr_read', { resource: 'contracts' })).contracts.length, 1);
    const other = await f.app.dispatch(f.owner, 'create-agent', { name: 'Synthetic MCP Agent', email: 'agent@example.test', states: ['CT'] });
    const agent = await connect(other.code, 'agent@example.test');
    assert.deepEqual((await call(agent,'sdr_read',{resource:'state_coverage'})).states.map(row=>row.state),['CT']);
    assert.match((await call(agent, 'sdr_read', { resource: 'business', candidateToken })).error, /another agent/);
    assert.equal((await call(agent, 'sdr_read', { resource: 'rolodex' })).contacts.length, 0);
    assert.match((await call(agent, 'sdr_read', { resource: 'office', id: String(office.id) })).error, /not found/);
    await f.app.dispatch(f.owner, 'revoke-agent', { id: other.agent.id });
    assert.match((await call(agent, 'sdr_read', { resource: 'rolodex' })).error, /Check your email/);
    assert.equal(f.rows.enrollments.length, 1, 'Only the explicit synthetic MCP contract is prepared; no payment or provider send is performed.');
  } finally {
    await Promise.allSettled(clients.map(client => client.close()));
    await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true });
  }
});
