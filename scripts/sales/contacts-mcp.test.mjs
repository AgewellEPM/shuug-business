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

test('real Shuug stdio MCP reads and changes the same contacts through HTTP, with retry and identity restrictions', async () => {
  const f = contactFixture(), office = await f.createOffice();
  const directory = mkdtempSync(path.join(tmpdir(), 'gigtax-contact-mcp-'));
  const clients = [];
  const server = createServer((req, res) => createHandler(f.env, f.db)(req, res));
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
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['sdr_catalog', 'sdr_read', 'sdr_command']);
    assert.equal((await call(client, 'sdr_catalog')).storage, 'Existing GigTax private sales records');
    const read = await call(client, 'sdr_read', { resource: 'office', id: String(office.id) });
    const input = { action: 'save-contact', id: String(office.id), expectedRevision: read.contacts.revision, requestId: randomUUID(), contactId: randomUUID(),
      contact: { name: 'Synthetic MCP Owner', role: 'owner', email: 'owner@example.test', preference: 'email', reviewed: true, sourceURL: 'https://example.test/team', sourceNote: 'Synthetic explicit source check.' } };
    const saved = await call(client, 'sdr_command', input);
    assert.equal(saved.book.contacts[0].name, 'Synthetic MCP Owner'); assert(saved.book.contacts[0].verification);
    assert.equal((await call(client, 'sdr_command', input)).duplicate, true);
    assert.equal((await f.app.dispatch(f.owner, 'rolodex')).contacts[0].email, 'owner@example.test');
    const other = await f.app.dispatch(f.owner, 'create-agent', { name: 'Synthetic MCP Agent', email: 'agent@example.test', states: ['CT'] });
    const agent = await connect(other.code, 'agent@example.test');
    assert.equal((await call(agent, 'sdr_read', { resource: 'rolodex' })).contacts.length, 0);
    assert.match((await call(agent, 'sdr_read', { resource: 'office', id: String(office.id) })).error, /not found/);
    await f.app.dispatch(f.owner, 'revoke-agent', { id: other.agent.id });
    assert.match((await call(agent, 'sdr_read', { resource: 'rolodex' })).error, /Check your email/);
    assert.equal(f.rows.enrollments.length, 0);
  } finally {
    await Promise.allSettled(clients.map(client => client.close()));
    await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true });
  }
});
