// Verify the actual deployed files and public endpoints; no account or record writes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { sha, uploadedFiles } from './sales/prepare-contacts-release.mjs';

const [deployment, receiptFile, evidenceFile] = process.argv.slice(2);
assert.match(deployment || '', /^dpl_[A-Za-z0-9]+$/);
const proof = JSON.parse(readFileSync(receiptFile));
const vercel = args => JSON.parse(execFileSync('vercel', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
const alias = () => vercel(['inspect', 'https://gigtax.pro', '--json']).id;
assert.equal(alias(), deployment, 'Production changed before verification');
const uploaded = uploadedFiles(vercel(['api', `/v6/deployments/${deployment}/files?teamId=${proof.project.orgId}`, '--raw']));
assert.deepEqual([...uploaded.keys()].sort(), proof.files.map(item => item.path).sort());
for (const file of proof.files) assert.equal(uploaded.get(file.path), file.sha1, `Deployed bytes differ: ${file.path}`);
const expected = new Map(proof.files.map(file => [file.path, file]));
const checks = [];
for (const name of ['index.html', 'app-support.html', 'app-privacy.html', 'site-config.json', 'styles.css', 'sales.html']) {
  const response = await fetch(`https://gigtax.pro/${name}`, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(sha(bytes), expected.get(`static/${name}`).sha256, `Public bytes differ: ${name}`);
  checks.push({ path: `/${name}`, status: response.status, bytesMatch: true });
}
for (const name of ['app-support', 'app-privacy']) {
  const response = await fetch(`https://gigtax.pro/${name}`, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(sha(Buffer.from(html)), expected.get(`static/${name}.html`).sha256);
  assert(html.includes('mailto:support@gigtax.pro') && !html.includes('support@@'));
  assert(response.headers.get('content-security-policy'));
  checks.push({ path: `/${name}`, status: response.status, bytesMatch: true, supportAddress: true });
}
for (const [origin, status] of [['https://gigtax.pro', 401], ['https://foreign.example', 403]]) {
  const response = await fetch('https://gigtax.pro/api/sales', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"action":"rolodex"}',
    signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, status, 'Existing sales authorization changed');
  checks.push({ path: '/api/sales', status, authorizationPreserved: true });
}
assert.equal(alias(), deployment, 'Production changed during verification');
const receipt = { verifiedAt: new Date().toISOString(), deploymentId: deployment,
  artifactMatches: proof.files.length, existingArtifactsPreserved: proof.preservedArtifacts,
  existingRoutesAndHeadersPreserved: proof.existingRoutesAndHeadersPreserved, checks,
  mailboxDeliveryTested: false, humanVisualAcceptance: false, ok: true };
writeFileSync(evidenceFile, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
