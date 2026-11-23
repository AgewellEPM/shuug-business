import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function run(root) {
  const port = await freePort();
  const origin = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['scripts/sdr-export/server.mjs'], {
    cwd: root, env: { PATH: process.env.PATH, SDR_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'exit');
    child.kill('SIGTERM');
    await closed;
  };
  try {
    for (let retry = 0; retry < 60; retry++) {
      if (child.exitCode !== null) throw new Error('Export server exited: ' + stderr);
      try {
        if ((await fetch(origin + '/sales')).ok) return { origin, stop };
      } catch {}
      await delay(50);
    }
    throw new Error('Export server did not start: ' + stderr);
  } catch (error) {
    await stop();
    throw error;
  }
}

function browserSession(origin) {
  let cookie = '';
  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('Origin', origin);
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(origin + path, { ...options, headers });
    const next = response.headers.get('set-cookie');
    if (next) cookie = next.split(';')[0];
    return response;
  }
  async function api(action, data = {}, expected = 200) {
    const response = await request('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
    const result = await response.json();
    assert.equal(response.status, expected, result.error);
    return result;
  }
  return { request, api };
}

test('exported workspace runs its real console, keeps projects isolated and persists an agreement workflow', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'universal-sdr-test-'));
  const root = join(directory, 'first');
  const second = join(directory, 'second');
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(server => server.stop()));
    rmSync(directory, { recursive: true, force: true });
  });
  for (const destination of [root, second]) execFileSync(process.execPath, ['scripts/sdr-export/export.mjs', destination]);
  assert.equal(existsSync(join(root, 'workspace-data')), false);
  const office = { name: 'Sample Solar Partner', city: 'Hartford', state: 'CT', address: '10 Example St', postalCode: '06103', source: 'https://example.test/partners', contact: 'Example Owner', email: 'owner@example.test' };
  writeFileSync(join(root, 'workspace.json'), JSON.stringify({ name: 'Solar Partners SDR', directory: 'project', contracts: 'agreement' }));
  writeFileSync(join(root, 'business-directory.json'), JSON.stringify([office]));

  const first = await run(root);
  servers.push(first);
  const other = await run(second);
  servers.push(other);
  const code = readFileSync(join(root, 'workspace-data', 'owner-code'), 'utf8').trim();
  const otherCode = readFileSync(join(second, 'workspace-data', 'owner-code'), 'utf8').trim();
  assert.notEqual(code, otherCode);
  const owner = browserSession(first.origin);
  const differentProject = browserSession(other.origin);
  await differentProject.api('login', { code, email: 'agent@example.test' }, 401);
  await differentProject.api('login', { code: otherCode });
  assert.deepEqual((await differentProject.api('bootstrap')).offices, []);
  assert.equal((await fetch(first.origin + '/workspace-data/owner-code')).status, 404);
  assert.equal((await fetch(first.origin + '/business-directory.json')).status, 404);
  assert.equal((await fetch(first.origin + '/api/sales', { method: 'POST', headers: { Origin: 'https://other.example.test', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);

  const response = await owner.request('/sales');
  const html = await response.text();
  assert.ok(html.includes('Solar Partners SDR'));
  assert.ok(!html.includes('portal.gigtax.pro'));
  const dom = new JSDOM(html, { url: first.origin + '/sales', runScripts: 'outside-only', beforeParse(window) {
    window.fetch = (path, options) => owner.request(path, options);
  } });
  t.after(() => dom.window.close());
  const { window } = dom;
  for (const script of window.document.querySelectorAll('script[src]')) {
    const asset = await owner.request(script.getAttribute('src'));
    assert.equal(asset.status, 200);
    window.eval(await asset.text());
  }
  assert.equal(window.document.querySelector('#sales-workspace').hidden, true);
  const login = window.document.querySelector('#sales-login-form');
  login.elements.code.value = code;
  login.dispatchEvent(new window.Event('submit', { cancelable: true }));
  for (let retry = 0; retry < 100 && window.document.querySelector('#sales-workspace').hidden; retry++) await delay(20);
  assert.equal(window.document.querySelector('#sales-workspace').hidden, false);
  assert.equal(window.document.querySelector('[data-tab=team]').hidden, false);

  const agentEmail = 'agent@example.test';
  const { agent, code: accessCode } = await owner.api('create-agent', { name: 'Example Agent', email: agentEmail, states: ['CT'] });
  const agentSession = browserSession(first.origin);
  await agentSession.api('login', { email: agentEmail, code: accessCode });
  await agentSession.api('create-agent', { name: 'Denied', email: 'denied@example.test', states: [] }, 403);
  await agentSession.api('search-local', { city: 'Boston', state: 'MA' }, 403);
  assert.ok((await agentSession.api('territory-localities', { state: 'CT', query: 'Hartford' })).results.length > 0);

  const candidates = await owner.api('search-local', { city: 'Hartford', state: 'CT' });
  assert.equal(candidates.results[0].name, office.name);
  const sourced = await owner.api('research-local-contacts', { candidateToken: candidates.results[0].researchToken });
  assert.ok(sourced.evidence.some(item => item.value === office.email));
  const saved = (await owner.api('create-office', { ...office, assignedTo: agent.id })).office;
  const id = String(saved.id);
  assert.equal((await agentSession.api('bootstrap')).offices[0].town, office.name);
  const detail = await agentSession.api('office', { id });
  assert.match(detail.drafts.message, /Solar Partners SDR/);
  await agentSession.api('record-progress', { id, expectedRevision: detail.pipeline.revision, requestId: randomUUID(), kind: 'contacted', channel: 'call', note: 'Synthetic call recorded.', waitingOn: 'office' });
  const lead = await agentSession.api('office', { id });
  await agentSession.api('save-contact', { id, contactId: 'office-contact', expectedRevision: lead.contacts.revision, requestId: randomUUID(),
    contact: { name: office.contact, email: office.email, role: 'owner', preference: 'email', sourceURL: office.source, sourceNote: 'Reviewed sample source.', reviewed: true } });
  await owner.api('verify-office', { id, finding: 'independent', reviewed: true, sourceURL: office.source, note: 'Synthetic ownership proof.' });

  const agreement = { business: 'Solar Partners', agreementTitle: 'Project partnership', agreementText: 'Synthetic contract content for a local project. This written text records the agreed responsibilities of the two businesses.' };
  await owner.api('publish-terms', { ...agreement, approved: false }, 400);
  await owner.api('publish-terms', { ...agreement, approved: true });
  const invitation = await agentSession.api('invite', { id, ownerName: office.contact, email: office.email });
  const inviteURL = new URL(invitation.link);
  const token = Object.fromEntries(new URLSearchParams(inviteURL.hash.slice(1)));
  assert.equal(inviteURL.origin, first.origin);
  const signer = browserSession(first.origin);
  assert.match(await (await signer.request('/office-signup')).text(), /Review and sign your agreement/);
  const view = await signer.api('signup-view', token);
  assert.equal(view.terms.title, agreement.agreementTitle);
  const sign = await signer.api('signup-sign', { ...token, signature: office.contact, email: office.email, termsHash: view.terms.hash, authorized: true, independent: true, electronicConsent: true, accepted: true });
  assert.equal(sign.paymentStatus, 'not_required');
  await signer.api('signup-confirm', token, 409);
  assert.equal((await owner.api('bootstrap')).offices[0].pipeline.waitingOn, 'none');
  await owner.api('revoke-agent', { id: agent.id });
  await agentSession.api('bootstrap', {}, 401);

  await first.stop();
  const restarted = await run(root);
  servers.push(restarted);
  const reopen = browserSession(restarted.origin);
  await reopen.api('login', { code });
  const recovered = await reopen.api('bootstrap');
  assert.equal(recovered.offices[0].pipeline.stage, 'contract_signed');
  assert.equal(recovered.contracts[0].status, 'signed');
  assert.deepEqual(recovered.agents, []);
  assert.deepEqual((await differentProject.api('bootstrap')).offices, []);
  const doLogin = (origin, secret) => fetch(origin + '/api/sales', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', code: secret }),
  });
  const firstCookie = (await doLogin(restarted.origin, code)).headers.get('set-cookie').split('=')[0];
  const secondCookie = (await doLogin(other.origin, otherCode)).headers.get('set-cookie').split('=')[0];
  assert.notEqual(firstCookie, secondCookie);

  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  const client = new Client({ name: 'sdr-export-test', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: ['scripts/sdr-export/mcp.mjs'], cwd: root,
      env: { SDR_ORIGIN: restarted.origin }, stderr: 'pipe',
    }));
    const read = await client.callTool({ name: 'sdr_read', arguments: { resource: 'pipeline' } });
    assert.ok(!read.isError, read.content[0]?.text);
    assert.equal(JSON.parse(read.content[0].text).offices[0].town, office.name);
  } finally {
    await client.close();
  }
});
