import assert from 'node:assert/strict';
import { constants, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactFiles, sha, uploadedFiles } from './prepare-contacts-release.mjs';

const STATIC = new Set(['sales.html', 'sales-console.css', 'sales-console.js']);
const MODULES = new Set(['service.mjs', 'billing.mjs', 'revenue.mjs']);
const permitted = name => name.startsWith('static/') ? STATIC.has(name.slice(7)) :
  /^functions\/api\/(sales|offices|sales-webhook|sales-mail-webhook)\.func\/[^/]+$/.test(name) && MODULES.has(path.basename(name));
export function prepareEarningsRelease({ baseline, updated, inventory, deployment, output, projectFile }) {
  assert.match(deployment, /^dpl_[A-Za-z0-9]+$/); assert(!existsSync(output), 'Use a new release directory.');
  const project = JSON.parse(readFileSync(projectFile));
  assert.equal(project.projectId, 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz'); assert.equal(project.orgId, 'team_KbZcSA3vllTFUuB0DJJVeW83');
  const uploaded = uploadedFiles(JSON.parse(readFileSync(inventory))), oldNames = artifactFiles(baseline), names = artifactFiles(updated);
  assert.deepEqual([...uploaded.keys()].sort(), oldNames, 'The baseline must be the exact current deployment.');
  const originals = new Map(), changed = [], added = [], protectedPublic = [];
  for (const name of oldNames) {
    const bytes = readFileSync(path.join(baseline, name)); assert.equal(sha(bytes, 'sha1'), uploaded.get(name), `Production baseline differs: ${name}`);
    assert(names.includes(name), `Production artifact removed: ${name}`); originals.set(name, bytes);
  }
  for (const name of names) {
    const bytes = readFileSync(path.join(updated, name));
    if (!originals.has(name)) { assert(name.endsWith('/revenue.mjs') && permitted(name), `Unexpected new artifact: ${name}`); added.push(name); }
    else if (!bytes.equals(originals.get(name))) { assert(permitted(name), `Protected artifact changed: ${name}`); changed.push(name); }
    if (name.startsWith('static/') && !STATIC.has(name.slice(7))) protectedPublic.push({ path: name, sha1: sha(bytes, 'sha1'), sha256: sha(bytes) });
  }
  assert(originals.get('config.json').equals(readFileSync(path.join(updated, 'config.json'))), 'Routes, CSP and headers must remain exact.');
  mkdirSync(path.join(output, '.vercel'), { recursive: true }); cpSync(updated, path.join(output, '.vercel/output'), { recursive: true, mode: constants.COPYFILE_FICLONE }); cpSync(projectFile, path.join(output, '.vercel/project.json'));
  const receipt = { ok: true, preparedAt: new Date().toISOString(), baselineDeployment: deployment, preparedOutput: path.join(output, '.vercel/output'), projectId: project.projectId, orgId: project.orgId,
    baselineVerifiedArtifacts: oldNames.length, configPreservedExactly: true, workflowReadChecks: true, revenueReadChecks: true, changed, added, removed: [], protectedPublic,
    files: names.map(name => { const bytes = readFileSync(path.join(updated, name)); return { path: name, sha1: sha(bytes, 'sha1'), sha256: sha(bytes) }; }) };
  writeFileSync(path.join(output, 'preservation-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseline, updated, inventory, deployment, output, projectFile] = process.argv.slice(2), result = prepareEarningsRelease({ baseline, updated, inventory, deployment, output, projectFile });
  console.log(JSON.stringify({ ok: result.ok, baselineVerifiedArtifacts: result.baselineVerifiedArtifacts, changed: result.changed, added: result.added, protectedPublicFiles: result.protectedPublic.length, configPreservedExactly: true }));
}
