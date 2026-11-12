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
  if (receipt.addedApiRoute?.src === '/api/sales-mail-webhook' || receipt.workflowReadChecks) {
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
  if (receipt.addedApiRoute || receipt.workflowReadChecks) {
    const pipeline = await call('sdr_read', { resource: 'pipeline' }), contracts = await call('sdr_read', { resource: 'contracts' }), senders = await call('sdr_sender', { action: 'list' });
    assert.deepEqual(pipeline.offices, workspace.offices); assert.deepEqual(contracts.contracts, workspace.contracts); assert.deepEqual(senders.mailboxes, workspace.mailboxes);
    assert.equal(senders.connection.configured, false); assert.equal(workspace.paymentsConfigured, false);
    Object.assign(result.mcp, { contracts: contracts.contracts.length, senders: senders.mailboxes.length, directEmailConfigured: senders.connection.configured });
    result.checks.push('installed native MCP reads the deployed pipeline, contracts and shared/agent senders; email and payments remain unconfigured');
  }
  if (receipt.revenueReadChecks) {
    const html = readFileSync(path.join(receipt.preparedOutput, 'static/sales.html'), 'utf8'); assert(html.includes('id="sales-revenue"'));
    const revenue = workspace.revenue, commission = revenue?.commission; assert(commission);
    assert.equal(revenue.scope, 'team'); assert.equal(commission.signupCents, 10000); assert.equal(commission.residualCents, 5000);
    assert.equal(commission.residualStartsMonth, 2); assert.equal(commission.bonusCents, 200000); assert.equal(commission.bonusOffices, 10); assert.equal(commission.bonusMode, 'first_ten');
    if (!workspace.offices.length) assert.equal(commission.earnedCents, 0);
    result.revenue = revenue;
    result.checks.push('the live API/installed MCP expose the confirmed commission plan, real earned totals and a persistent top-corner earnings card');
  }
  if (receipt.localMapReadChecks) {
    for (const route of ['/sales','/sales.html']) {
      const response = await fetch(origin + route, { signal: AbortSignal.timeout(45000) });
      assert.equal(response.status, 200); assert.equal(response.headers.get('content-security-policy'), receipt.privateMapRoute.headers['Content-Security-Policy'], `Private map policy: ${route}`); await response.body.cancel();
    }
    const search = await call('sdr_read', { resource:'local_offices', state:'CT', city:'hartord' });
    assert.equal(search.correction?.from, 'hartord'); assert.equal(search.city.toLowerCase(), 'hartford'); assert(search.results.length > 50); assert.equal(search.results.length, search.total);
    const points = [], ids = new Set(search.results.map(row=>row.candidateId)); let cursor = 0;
    await Promise.all([0,1].map(async()=>{
      while(cursor < search.results.length) {
        const candidates = search.results.slice(cursor,cursor += 10);
        const mapped = await call('sdr_read', { resource:'map_addresses', candidateTokens:candidates.map(row=>row.candidateToken) });
        assert.equal(mapped.results.length,candidates.length);
        for(const point of mapped.results) { assert(ids.has(point.candidateId)); if(point.location) assert(Number.isFinite(point.location.lat)&&Number.isFinite(point.location.lng)); points.push(point); }
      }
    }));
    const mapped = points.filter(point=>point.location); assert(mapped.length > 0);
    const selected = search.results.find(row=>row.registryId&&/\btax\b/i.test(row.name)); assert(selected);
    const business = await call('sdr_read', { resource:'business', candidateToken:selected.candidateToken });
    assert(business.matches.length); assert.equal(business.matches[0].registryId, selected.registryId); assert(business.matches[0].principals.length);
    assert(business.matches[0].principals.every(person=>person.name&&!person.verifiedOwner));
    const z=12,n=2**z,location=mapped[0].location,lat=location.lat*Math.PI/180;
    const tile=`https://tile.openstreetmap.org/${z}/${Math.floor((location.lng+180)/360*n)}/${Math.floor((1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*n)}.png`;
    const response = await fetch(tile,{headers:{'User-Agent':'GigTaxMapEvidence/1.0 (+https://gigtax.pro/privacy)',Referer:origin+'/'},signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200); const bytes=Buffer.from(await response.arrayBuffer()); assert(bytes.length<512000); assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    result.localMap = { query:'hartord', resolvedCity:search.city,state:'CT',candidates:search.total,irsCandidates:search.irsTotal,registryCandidates:search.registryTotal,
      addressesChecked:points.length,mapped:mapped.length,unmatched:points.length-mapped.length,chainsIncluded:search.results.some(row=>row.chain),
      registryEntityMatched:true,principalsReported:business.matches[0].principals.length,ownerAutomaticallyVerified:false,privateTilePolicyVerified:true,mapTileStatus:response.status,
      sourceIssues:search.issues,coverage:search.coverage };
    result.checks.push('actual installed MCP corrects the Hartford typo, reads all multi-source candidates, geocodes every returned address and cross-references an actual CT entity/principal without saving prospects; private CSP and one real map tile verified');
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
