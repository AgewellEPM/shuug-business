import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTACT_STATIC = new Set(['sales.html', 'sales-console.css', 'sales.js', 'sales-research.js', 'sales-workflows.js', 'sales-contacts.js']);
const modules = new Set(['contacts.mjs', 'model.mjs', 'service.mjs', 'prospect-tools.mjs']);
export const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
export function uploadedFiles(nodes, prefix = '') {
  const result = new Map();
  for (const node of nodes) {
    const name = `${prefix}/${node.name}`;
    if (node.type === 'file') result.set(name.replace(/^\/src\/\.vercel\/output\//, ''), node.uid);
    else for (const entry of uploadedFiles(node.children || [], name)) result.set(...entry);
  }
  return result;
}
export function artifactFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => {
    assert(!entry.isSymbolicLink(), 'Release artifacts must not be symbolic links.'); return entry.isFile();
  }).map(entry => path.relative(directory, path.join(entry.parentPath, entry.name))).sort();
}
const permitted = name => name.startsWith('static/') ? CONTACT_STATIC.has(name.slice(7)) : /^functions\/api\/(sales|offices|sales-webhook)\.func\/[^/]+$/.test(name) && modules.has(path.basename(name));

export function prepareContactsRelease({ baseline, updated, inventory, deployment, output, projectFile }) {
  assert.match(deployment, /^dpl_[A-Za-z0-9]+$/);
  assert(!existsSync(output), 'Use a new release directory; an existing result is never overwritten.');
  const project = JSON.parse(readFileSync(projectFile));
  assert.equal(project.projectId, 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz');
  assert.equal(project.orgId, 'team_KbZcSA3vllTFUuB0DJJVeW83');
  const uploaded = uploadedFiles(JSON.parse(readFileSync(inventory)));
  const oldNames = artifactFiles(baseline), newNames = artifactFiles(updated);
  assert.deepEqual([...uploaded.keys()].sort(), oldNames, 'The baseline must contain exactly the current uploaded artifacts.');
  const before = new Map(), changed = [], added = [], protectedPublic = [];
  for (const name of oldNames) {
    const bytes = readFileSync(path.join(baseline, name));
    assert.equal(sha(bytes, 'sha1'), uploaded.get(name), `Current production baseline differs: ${name}`);
    assert(newNames.includes(name), `Production artifact was removed: ${name}`); before.set(name, bytes);
  }
  for (const name of newNames) {
    const bytes = readFileSync(path.join(updated, name));
    if (!before.has(name)) { assert(permitted(name), `Unexpected new artifact: ${name}`); added.push(name); }
    else if (!before.get(name).equals(bytes)) { assert(permitted(name), `Protected production artifact changed: ${name}`); changed.push(name); }
    if (name.startsWith('static/') && !CONTACT_STATIC.has(name.slice(7))) protectedPublic.push({ path: name, sha256: sha(bytes), sha1: sha(bytes, 'sha1') });
  }
  assert(before.get('config.json').equals(readFileSync(path.join(updated, 'config.json'))), 'Routes, CSP and public headers must remain exact.');
  mkdirSync(path.join(output, '.vercel'), { recursive: true });
  cpSync(updated, path.join(output, '.vercel/output'), { recursive: true });
  cpSync(projectFile, path.join(output, '.vercel/project.json'));
  const receipt = { ok: true, preparedAt: new Date().toISOString(), baselineDeployment: deployment, preparedOutput: path.join(output, '.vercel/output'),
    projectId: project.projectId, orgId: project.orgId, baselineVerifiedArtifacts: oldNames.length, configPreservedExactly: true,
    changed, added, removed: [], protectedPublic,
    files: newNames.map(name => { const bytes = readFileSync(path.join(updated, name)); return { path: name, sha256: sha(bytes), sha1: sha(bytes, 'sha1') }; }) };
  writeFileSync(path.join(output, 'preservation-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseline, updated, inventory, deployment, output, projectFile] = process.argv.slice(2);
  const receipt = prepareContactsRelease({ baseline, updated, inventory, deployment, output, projectFile });
  console.log(JSON.stringify({ ok: receipt.ok, baselineVerifiedArtifacts: receipt.baselineVerifiedArtifacts, changed: receipt.changed, added: receipt.added, publicFilesPreserved: receipt.protectedPublic.length, configPreservedExactly: true }));
}
