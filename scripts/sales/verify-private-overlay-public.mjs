import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Read-only: fetch public files and authenticated Vercel source metadata only.
const [deploymentId, receiptFile, baselineProofFile, evidenceFile] = process.argv.slice(2);
assert.match(deploymentId || '', /^dpl_[A-Za-z0-9]+$/);
assert(receiptFile && baselineProofFile && evidenceFile, 'Usage: node verify-private-overlay-public.mjs DEPLOYMENT RECEIPT BASELINE_PROOF EVIDENCE');
const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
const proof = JSON.parse(readFileSync(baselineProofFile, 'utf8'));
assert.equal(receipt.deploymentId, proof.deploymentId);
assert.equal(receipt.projectId, proof.projectId);
assert.equal(receipt.orgId, proof.orgId);
assert.equal(receipt.baselineArtifactSHA1Matches, 117);
assert.equal(receipt.protectedPublic.length, 78);
assert.equal(receipt.configPreservedExactly, true);
const baseURL = 'https://gigtax.pro';
const api = endpoint => JSON.parse(execFileSync('vercel', ['api', endpoint, '--raw'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
const alias = () => JSON.parse(execFileSync('vercel', ['inspect', baseURL, '--json', '--cwd', receipt.preparedCwd], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })).id;
const initialAlias = alias();
assert.equal(initialAlias, deploymentId, 'The production alias does not reference the requested deployment.');
const inventory = api(`/v6/deployments/${deploymentId}/files?teamId=${proof.orgId}`);
const uploaded = new Map();
function walk(nodes, prefix = '') {
  for (const node of nodes) {
    const relative = `${prefix}/${node.name}`;
    if (node.type === 'file') uploaded.set(relative.replace(/^\/src\/\.vercel\/output\//, ''), node.uid);
    else walk(node.children || [], relative);
  }
}
walk(inventory);
const sourceDigests = new Map(proof.artifacts.map(item => [item.path, item.sha1]));
const configSourceMatch = uploaded.get('config.json') === sourceDigests.get('config.json');
const config = JSON.parse(readFileSync(path.join(receipt.preparedOutput, 'config.json'), 'utf8'));
const expectedHeaders = config.routes.find(route => route.src === '/.*' && route.headers?.['Content-Security-Policy']).headers;
assert(configSourceMatch, 'Published output route/CSP source differs from the original live deployment.');
const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < receipt.protectedPublic.length) {
    const item = receipt.protectedPublic[cursor++];
    const relative = item.path.replace(/^static\//, '');
    const url = new URL(relative.split('/').map(encodeURIComponent).join('/'), `${baseURL}/`).href;
    const result = { path: relative, expectedSHA256: item.sha256, sourceSHA1Match: uploaded.get(item.path) === sourceDigests.get(item.path) };
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'GigTaxPros-public-preservation-verifier/1.0' } });
      result.status = response.status;
      result.finalURL = response.url;
      result.actualSHA256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
      result.bytesMatch = result.actualSHA256 === item.sha256;
      result.headersMatch = Object.entries(expectedHeaders).every(([name, value]) => response.headers.get(name) === value);
      result.ok = response.ok && result.bytesMatch && result.sourceSHA1Match && result.headersMatch;
    } catch (error) {
      result.error = error.name === 'TimeoutError' ? 'Public fetch timed out.' : 'Public fetch failed.';
      result.ok = false;
    }
    results.push(result);
  }
}));
const finalAlias = alias();
const evidence = {
  checkedAt: new Date().toISOString(), readOnly: true, baseURL, deploymentId,
  originalDeploymentId: proof.deploymentId, initialAlias, finalAlias,
  configSourceSHA1Match: configSourceMatch,
  originalConfigSHA1: sourceDigests.get('config.json'), publishedConfigSHA1: uploaded.get('config.json'),
  protectedPublicCount: results.length,
  protectedPublicSourceSHA1Matches: results.filter(result => result.sourceSHA1Match).length,
  protectedPublicHTTPByteMatches: results.filter(result => result.bytesMatch).length,
  protectedPublicHeaderMatches: results.filter(result => result.headersMatch).length,
  ok: finalAlias === deploymentId && configSourceMatch && results.every(result => result.ok),
  results: results.sort((a, b) => a.path.localeCompare(b.path)),
};
writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ deploymentId, checked: results.length, sourceMatches: evidence.protectedPublicSourceSHA1Matches, httpByteMatches: evidence.protectedPublicHTTPByteMatches, headerMatches: evidence.protectedPublicHeaderMatches, configSourceMatch, ok: evidence.ok, failures: results.filter(result => !result.ok).map(({ path: name, status, error, bytesMatch, headersMatch, sourceSHA1Match }) => ({ path: name, status, error, bytesMatch, headersMatch, sourceSHA1Match })) }));
if (!evidence.ok) process.exitCode = 1;
