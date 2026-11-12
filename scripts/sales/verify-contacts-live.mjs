import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { sha, uploadedFiles } from './prepare-contacts-release.mjs';

// Production reads only. No contact, office, agent, invitation or payment writes.
const [deploymentId, prepared, output] = process.argv.slice(2);
assert.match(deploymentId || '', /^dpl_[A-Za-z0-9]+$/); assert(prepared && output);
const receipt = JSON.parse(readFileSync(path.join(prepared, 'preservation-receipt.json')));
const origin = 'https://gigtax.pro';
const vercel = args => JSON.parse(execFileSync('vercel', args, { cwd: prepared, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
const alias = () => vercel(['inspect', origin, '--json']).id;
const result = { ok: false, checkedAt: new Date().toISOString(), deploymentId, scope: 'Read-only production artifact, public HTTP and installed Shuug MCP verification.', checks: [] };
const client = new Client({ name: 'gigtax-installed-contact-verifier', version: '1.0.0' });
try {
  assert.equal(alias(), deploymentId);
  const inventory = vercel(['api', `/v6/deployments/${deploymentId}/files?teamId=${receipt.orgId}`, '--raw']);
  const uploaded = uploadedFiles(inventory);
  assert.deepEqual([...uploaded.keys()].sort(), receipt.files.map(item => item.path).sort());
  for (const item of receipt.files) assert.equal(uploaded.get(item.path), item.sha1, `Published artifact differs: ${item.path}`);
  result.artifactMatches = receipt.files.length;
  result.checks.push('all uploaded artifacts match the tested private release');
  const config = JSON.parse(readFileSync(path.join(receipt.preparedOutput, 'config.json')));
  const headers = config.routes.find(route => route.headers?.['Content-Security-Policy']).headers;
  const pages = receipt.files.filter(item => item.path.startsWith('static/'));
  const protectedPaths = new Set(receipt.protectedPublic.map(item => item.path));
  let cursor = 0;
  const http = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < pages.length) {
      const item = pages[cursor++], name = item.path.slice(7);
      const response = await fetch(new URL(name, origin + '/'), { signal: AbortSignal.timeout(45000) });
      assert.equal(response.status, 200, `HTTP ${name}`);
      assert.equal(sha(Buffer.from(await response.arrayBuffer())), item.sha256, `HTTP bytes ${name}`);
      if (protectedPaths.has(item.path)) for (const [header, expected] of Object.entries(headers)) assert.equal(response.headers.get(header), expected, `Public header ${header}: ${name}`);
      http.push({ path: name, status: response.status, bytesMatch: true, publicHeadersChecked: protectedPaths.has(item.path) });
    }
  }));
  result.http = http.sort((a, b) => a.path.localeCompare(b.path));
  result.protectedPublicMatches = receipt.protectedPublic.length;
  result.checks.push('public pages, media and headers remain exact; private HTML and scripts match the release');
  const anonymous = await fetch(origin + '/api/sales', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"action":"rolodex"}', signal: AbortSignal.timeout(45000) });
  assert.equal(anonymous.status, 401);
  const foreign = await fetch(origin + '/api/sales', { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{"action":"rolodex"}', signal: AbortSignal.timeout(45000) });
  assert.equal(foreign.status, 403);
  result.checks.push('the Rolodex requires authentication and rejects foreign origins');
  if (receipt.addedApiRoute?.src === '/api/sales-mail-webhook') {
    const callback = await fetch(origin + '/api/sales-mail-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(45000) });
    assert.equal(callback.status, 503, 'Unconfigured email notifications must remain unavailable.');
    const salesHtml = readFileSync(path.join(receipt.preparedOutput, 'static/sales.html'), 'utf8');
    for (const asset of ['sales-progress.js', 'sales-contracts.js']) assert(salesHtml.includes(asset));
    const signatureHtml = readFileSync(path.join(receipt.preparedOutput, 'static/office-signup.html'), 'utf8');
    assert(signatureHtml.includes('contract-signature.js'));
    result.checks.push('the shipped console includes pipeline/contracts tools and separate signing; unconfigured email callbacks fail closed');
  }
  const connection = Object.values(JSON.parse(readFileSync(path.join(homedir(), '.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
  await client.connect(new StdioClientTransport({ ...connection, env: { ...process.env, ...connection.env }, stderr: 'pipe' }));
  const tools = (await client.listTools()).tools.map(tool => tool.name);
  assert.deepEqual(tools, ['sdr_catalog', 'sdr_read', 'sdr_command', 'sdr_progress', 'sdr_contract', 'sdr_sender']);
  async function call(name, input = {}) {
    const response = await client.callTool({ name, arguments: input });
    const text = response.content.find(item => item.type === 'text')?.text;
    assert(!response.isError, text); return JSON.parse(text);
  }
  await call('sdr_catalog');
  const workspace = await call('sdr_read', { resource: 'workspace' }), rolodex = await call('sdr_read', { resource: 'rolodex' });
  assert.equal(workspace.user.role, 'owner'); assert(workspace.rolodex); assert.deepEqual(rolodex, workspace.rolodex);
  result.mcp = { server: client.getServerVersion(), tools, role: workspace.user.role, offices: workspace.offices.length, agents: workspace.agents.length, contacts: rolodex.coverage.contacts, paymentsConfigured: workspace.paymentsConfigured };
  if (receipt.addedApiRoute) {
    const pipeline = await call('sdr_read', { resource: 'pipeline' }), contracts = await call('sdr_read', { resource: 'contracts' }), senders = await call('sdr_sender', { action: 'list' });
    assert.deepEqual(pipeline.offices, workspace.offices); assert.deepEqual(contracts.contracts, workspace.contracts); assert.deepEqual(senders.mailboxes, workspace.mailboxes);
    assert.equal(senders.connection.configured, false); assert.equal(workspace.paymentsConfigured, false);
    Object.assign(result.mcp, { contracts: contracts.contracts.length, senders: senders.mailboxes.length, directEmailConfigured: senders.connection.configured });
    result.checks.push('installed native MCP reads the deployed pipeline, contracts and shared/agent senders; email and payments remain unconfigured');
  }
  result.checks.push('the installed Shuug MCP launcher reads the actual deployed workspace and Rolodex consistently');
  assert.equal(alias(), deploymentId); result.ok = true;
} catch (error) { result.error = error.message; }
finally {
  await client.close();
  result.limits = 'Real contact writes were tested only in disposable D1 boards and synthetic UI/MCP HTTP fixtures. Production reads do not establish human visual acceptance, email delivery or payment activation.';
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ ...result, http: result.http ? { matched: result.http.length } : undefined })); process.exitCode = result.ok ? 0 : 1;
}
