// Change only the app privacy page over a byte-verified current deployment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactFiles, sha, uploadedFiles } from './sales/prepare-contacts-release.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [baseline, output] = process.argv.slice(2);
assert(baseline && output && !existsSync(output), 'Supply a verified prior release and a fresh output directory');
const prior = JSON.parse(readFileSync(path.join(baseline, 'preservation-receipt.json')));
const project = JSON.parse(readFileSync(path.join(baseline, '.vercel/project.json')));
assert.equal(project.projectId, 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz');
const vercel = args => JSON.parse(execFileSync('vercel', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
const current = vercel(['inspect', 'https://gigtax.pro', '--json']);
assert.equal(current.readyState, 'READY');
const uploaded = uploadedFiles(vercel(['api', `/v6/deployments/${current.id}/files?teamId=${project.orgId}`, '--raw']));
assert.deepEqual([...uploaded.keys()].sort(), prior.files.map(x => x.path).sort());
const source = path.join(baseline, '.vercel/output');
for (const file of prior.files) {
  const bytes = readFileSync(path.join(source, file.path));
  assert.equal(sha(bytes, 'sha1'), uploaded.get(file.path), `Current deployed baseline differs: ${file.path}`);
  assert.equal(sha(bytes), file.sha256, `Local baseline differs: ${file.path}`);
}
cpSync(path.join(baseline, '.vercel'), path.join(output, '.vercel'), { recursive: true });
const destination = path.join(output, '.vercel/output');
const changed = 'static/app-privacy.html';
cpSync(path.join(root, 'public/rideshare-tax-pros/app-privacy.html'), path.join(destination, changed));
const files = artifactFiles(destination).map(name => {
  const bytes = readFileSync(path.join(destination, name));
  if (name !== changed) assert.equal(sha(bytes, 'sha1'), uploaded.get(name), `Protected file changed: ${name}`);
  return { path: name, sha1: sha(bytes, 'sha1'), sha256: sha(bytes) };
});
assert.equal(files.length, prior.files.length);
assert.equal(vercel(['inspect', 'https://gigtax.pro', '--json']).id, current.id, 'Production changed during preparation');
const receipt = { preparedAt: new Date().toISOString(), baselineDeployment: current.id,
  baselineVerifiedArtifacts: files.length, preservedArtifacts: files.length - 1,
  changed: [changed], added: [], existingRoutesAndHeadersPreserved: true,
  preparedOutput: destination, project, files };
writeFileSync(path.join(output, 'preservation-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ baseline: current.id, verified: files.length, changed: receipt.changed, preserved: files.length - 1 }));
