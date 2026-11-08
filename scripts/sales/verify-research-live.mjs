import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Read-only deployed verification. Only this probe's sign-in cookie is created
// and cleared; no office, contact, draft, invitation or payment is written.
const [deployment, staticRoot] = process.argv.slice(2);
if (!/^dpl_[A-Za-z0-9]+$/.test(deployment || '') || !staticRoot) throw new Error('Pass the confirmed deployment ID and its prepared static directory.');
const origin = 'https://gigtax.pro', checks = [];
const receipt = { ok: false, deployment, verifiedAt: new Date().toISOString(), checks, scope: 'Read-only deployed API and exact private assets/public homepage; no prospect writes, outreach or payment.' };
let cookie = '';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function api(action, body = {}, authenticated = true, requestOrigin = origin) {
  const response = await fetch(origin + '/api/sales', { method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(authenticated && cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ action, ...body }), signal: AbortSignal.timeout(45000),
  });
  return { response, data: await response.json() };
}
try {
  assert.equal((await api('bootstrap', {}, false)).response.status, 401);
  const login = await api('login', { code: readFileSync(path.join(homedir(), '.config/gigtax-sales/owner-code'), 'utf8').trim() }, false);
  assert.equal(login.response.status, 200);
  const protectedCookie = login.response.headers.get('set-cookie') || '';
  assert(protectedCookie.includes('HttpOnly') && protectedCookie.includes('Secure') && protectedCookie.includes('SameSite=Strict'));
  cookie = protectedCookie.split(';')[0];
  const workspace = await api('bootstrap'); assert.equal(workspace.response.status, 200); assert.equal(workspace.data.user.role, 'owner');
  receipt.workspace = { offices: workspace.data.offices.length, agents: workspace.data.agents.length, paymentsConfigured: workspace.data.paymentsConfigured, termsPublished: Boolean(workspace.data.terms) };
  checks.push('anonymous denial and authenticated owner bootstrap with protected session cookie');
  const first = await api('search', { city: 'Hartford', state: 'CT', offset: 0 });
  assert.equal(first.response.status, 200); assert.equal(first.data.offset, 0); assert(first.data.results.length > 0);
  const all = [...first.data.results];
  for (let offset = 50; offset < first.data.total; offset += 50) {
    const page = await api('search', { city: 'Hartford', state: 'CT', offset });
    assert.equal(page.response.status, 200); assert.equal(page.data.offset, offset); assert.equal(page.data.total, first.data.total); all.push(...page.data.results);
  }
  assert.equal(all.length, first.data.total); assert.equal(new Set(all.map(row => row.candidateId)).size, all.length);
  assert(all.every(row => row.independence === 'unverified'));
  receipt.discovery = { total: first.data.total, uniqueCandidatesReached: all.length, pages: Math.ceil(all.length / 50), withPhone: all.filter(row => row.phone).length, withNamedContact: all.filter(row => row.contact).length };
  assert.equal((await api('search', { city: 'Hartford', state: 'CT', offset: -1 })).response.status, 400);
  checks.push('all real IRS discovery pages reachable with stable unique IDs and no inferred ownership');
  for (const file of ['sales.html', 'office-signup.html', 'sales.css', 'sales.js', 'sales-research.js', 'sales-workflows.js', 'directory-admin.js']) {
    const response = await fetch(origin + '/' + file, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    assert.equal(response.status, 200); assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(readFileSync(path.join(staticRoot, file))));
  }
  checks.push('seven private sales assets match the prepared deployment byte for byte');
  for (const base of [origin, 'https://www.gigtax.pro']) {
    const response = await fetch(base, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    assert.equal(response.status, 200); assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(readFileSync(path.join(staticRoot, 'index.html'))));
  }
  checks.push('apex and www preserve the exact current public homepage');
  assert.equal((await api('bootstrap', {}, true, 'https://foreign.example')).response.status, 403);
  const webhook = await fetch(origin + '/api/sales-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=0,v1=' + '0'.repeat(64) }, body: '{}', signal: AbortSignal.timeout(25000) });
  assert.equal(webhook.status, 400);
  const directory = await fetch(origin + '/api/offices', { signal: AbortSignal.timeout(25000) }); assert.equal(directory.status, 200);
  receipt.publishedOfficeCount = (await directory.json()).offices.length;
  checks.push('foreign-origin requests and unsigned webhooks denied; public directory remains readable');
  receipt.ok = true;
} catch (error) { receipt.error = error.message; }
finally {
  if (cookie) { try { receipt.probeLogoutStatus = (await api('logout')).response.status; } catch { receipt.probeLogoutStatus = 'unconfirmed'; } }
  receipt.limits = 'No real mailbox or Stripe credentials configured; sending, checkout, recurring billing and physical-phone acceptance remain unverified.';
  writeFileSync('docs/deployments/gigtax-sales-research-deployed-20261108.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2)); process.exitCode = receipt.ok ? 0 : 1;
}
