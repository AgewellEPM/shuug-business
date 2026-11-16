// Prepare only app policy/support pages over an exact, authenticated live inventory.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactFiles, sha, uploadedFiles } from './sales/prepare-contacts-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [baseline, inventory, deployment, output, projectFile] = process.argv.slice(2);
assert(baseline && inventory && output && projectFile, 'Supply baseline, inventory, deployment, output and project JSON.');
assert.match(deployment, /^dpl_[A-Za-z0-9]+$/);
assert(!existsSync(output), 'Choose a fresh release directory.');
const project = JSON.parse(readFileSync(projectFile));
assert.equal(project.projectId, 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz');
const uploaded = uploadedFiles(JSON.parse(readFileSync(inventory)));
const originals = new Map();
const registryModules = new Set(['registry-catalog.mjs', 'registry-dc.mjs', 'registry-delaware.mjs', 'registry-kentucky.mjs', 'state-registry.mjs']);
for (const [name, digest] of uploaded) {
  assert(!path.isAbsolute(name) && !name.split('/').some(part => ['..', '.', ''].includes(part)), 'Invalid artifact path');
  let file = path.join(baseline, name);
  // Older local output can be reconstructed only from byte-identical source modules.
  if (!existsSync(file) || sha(readFileSync(file), 'sha1') !== digest) {
    assert(/^functions\/api\/[^/]+\.func\/[^/]+$/.test(name) && registryModules.has(path.basename(name)), `Missing exact baseline: ${name}`);
    file = path.join(root, 'sales', path.basename(name));
  }
  const bytes = readFileSync(file);
  assert.equal(sha(bytes, 'sha1'), digest, `Current production artifact differs: ${name}`);
  originals.set(name, bytes);
}
const pages = ['app-support', 'app-privacy'];
for (const page of pages) {
  assert(!uploaded.has(`static/${page}.html`), 'Page already exists; review its current content first.');
}
const config = JSON.parse(originals.get('config.json').toString());
const priorRoutes = structuredClone(config.routes);
const position = config.routes.findIndex(route => route.handle === 'filesystem');
assert(position >= 0, 'Expected routing boundary not found');
const addedRoutes = pages.map(page => ({ src: `/${page}`, dest: `/${page}.html` }));
assert(!config.routes.some(route => pages.some(page => (route.src || '').includes(page))), 'Existing policy route');
config.routes.splice(position, 0, ...addedRoutes);
assert.deepEqual(config.routes.filter(route => !addedRoutes.includes(route)), priorRoutes, 'Existing routes or headers changed');
const destination = path.join(output, '.vercel/output');
mkdirSync(destination, { recursive: true });
for (const [name, bytes] of originals) {
  const file = path.join(destination, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
}
for (const page of pages) cpSync(path.join(root, 'public/rideshare-tax-pros', `${page}.html`), path.join(destination, 'static', `${page}.html`));
writeFileSync(path.join(destination, 'config.json'), JSON.stringify(config, null, 2));
cpSync(projectFile, path.join(output, '.vercel/project.json'));
const names = artifactFiles(destination);
for (const [name, bytes] of originals) {
  if (name !== 'config.json') assert(bytes.equals(readFileSync(path.join(destination, name))), `Protected artifact changed: ${name}`);
}
assert.equal(names.length, originals.size + 2);
const receipt = { preparedAt: new Date().toISOString(), baselineDeployment: deployment,
  baselineVerifiedArtifacts: originals.size, preservedArtifacts: originals.size - 1,
  changed: ['config.json'], added: pages.map(page => `static/${page}.html`), addedRoutes,
  existingRoutesAndHeadersPreserved: true, preparedOutput: destination, project,
  files: names.map(name => { const bytes = readFileSync(path.join(destination, name)); return { path: name, sha1: sha(bytes, 'sha1'), sha256: sha(bytes) }; }) };
writeFileSync(path.join(output, 'preservation-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ verified: originals.size, preserved: originals.size - 1, added: receipt.added, existingRoutesAndHeadersPreserved: true }));
