import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { preparePrivateOverlay, PRIVATE_FUNCTIONS, PRIVATE_STATIC } from './prepare-private-overlay.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gigtax-private-overlay-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = path.join(root, 'baseline');
  const updated = path.join(root, 'updated');
  const output = path.join(root, 'candidate');
  const proof = path.join(root, 'proof.json');
  const artifacts = [];
  const put = (file, bytes) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes); };
  const project = { projectId: 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz', orgId: 'team_KbZcSA3vllTFUuB0DJJVeW83', projectName: 'rideshare-tax-pros' };
  for (const directory of [baseline, updated]) put(path.join(directory, '.vercel/project.json'), JSON.stringify(project));
  const old = (relative, bytes) => {
    put(path.join(baseline, '.vercel/output', relative), bytes);
    artifacts.push({ path: relative, sha1: createHash('sha1').update(bytes).digest('hex') });
  };
  const config = JSON.stringify({ version: 3, routes: [
    { src: '/.*', headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'" }, continue: true },
    { src: '/sales', dest: '/sales.html' }, { handle: 'filesystem' },
    { src: '/.*', status: 404, dest: '/404.html' },
  ] }, null, 2);
  old('config.json', config);
  for (const name of PRIVATE_STATIC) {
    const bytes = name.endsWith('.html') ? '<!doctype html><h1>Private update</h1><script src="/sales.js"></script>' : '// private update';
    put(path.join(updated, '.vercel/output/static', name), bytes);
    if (!['sales-research.js', 'sales-workflows.js'].includes(name)) old(`static/${name}`, `original ${name}`);
  }
  for (const prefix of PRIVATE_FUNCTIONS) {
    const settings = JSON.stringify({ runtime: 'nodejs22.x', handler: 'handler.mjs' });
    put(path.join(updated, '.vercel/output/functions', prefix, '.vc-config.json'), settings);
    put(path.join(updated, '.vercel/output/functions', prefix, 'handler.mjs'), 'export default () => "updated";');
    old(`functions/${prefix}/.vc-config.json`, settings);
    old(`functions/${prefix}/removed.mjs`, 'old module removed from the new function');
  }
  while (artifacts.length < 117) old(`static/public-${artifacts.length}.txt`, `exact public bytes ${artifacts.length}\n`);
  put(proof, JSON.stringify({ deploymentId: 'dpl_5H37bhiFyQ3x4ch7Q1ApW2PmE4sC', ...project, artifacts }));
  return { baseline, updated, output, proof, put, config, artifacts };
}

test('overlay preserves all protected public bytes and complete route/CSP bytes while replacing private function directories', t => {
  const f = fixture(t);
  const receipt = preparePrivateOverlay(f);
  assert.equal(receipt.baselineArtifactSHA1Matches, 117);
  assert.equal(receipt.configPreservedExactly, true);
  assert.equal(readFileSync(path.join(f.output, '.vercel/output/config.json'), 'utf8'), f.config);
  assert(receipt.protectedPublic.length > 100);
  for (const entry of receipt.protectedPublic) {
    assert.deepEqual(readFileSync(path.join(f.baseline, '.vercel/output', entry.path)), readFileSync(path.join(f.output, '.vercel/output', entry.path)));
  }
  assert(receipt.added.includes('static/sales-research.js'));
  assert(receipt.removed.includes('functions/api/sales.func/removed.mjs'));
  assert(!existsSync(path.join(f.output, '.vercel/output/functions/api/sales.func/removed.mjs')));
  assert.equal(JSON.parse(readFileSync(path.join(f.output, '.vercel/project.json'))).projectId, 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz');
  assert.equal(receipt.deployed, false);
});

test('a changed public baseline fails before creating any output', t => {
  const f = fixture(t);
  const victim = f.artifacts.find(entry => entry.path.startsWith('static/public-'));
  f.put(path.join(f.baseline, '.vercel/output', victim.path), 'different public design');
  assert.throws(() => preparePrivateOverlay(f), /Published baseline differs/);
  assert(!existsSync(f.output));
});

test('wrong deployment or project metadata cannot produce a package', t => {
  const f = fixture(t);
  const proof = JSON.parse(readFileSync(f.proof));
  f.put(f.proof, JSON.stringify({ ...proof, deploymentId: 'another-deployment' }));
  assert.throws(() => preparePrivateOverlay(f), /reviewed live deployment/);
  assert(!existsSync(f.output));
  f.put(f.proof, JSON.stringify(proof));
  f.put(path.join(f.updated, '.vercel/project.json'), JSON.stringify({ projectId: 'another-project' }));
  assert.throws(() => preparePrivateOverlay(f), /project must not change/);
  assert(!existsSync(f.output));
});

test('new private inline scripts blocked by the original CSP fail before writing output', t => {
  const f = fixture(t);
  f.put(path.join(f.updated, '.vercel/output/static/sales.html'), '<h1>Private</h1><script>window.unsafe = true;</script>');
  assert.throws(() => preparePrivateOverlay(f), /blocked by original CSP/);
  assert(!existsSync(f.output));
});

test('existing output and unexpected private function files fail safely', t => {
  const f = fixture(t);
  mkdirSync(f.output);
  f.put(path.join(f.output, 'keep.txt'), 'existing output');
  assert.throws(() => preparePrivateOverlay(f), /never overwritten/);
  assert.equal(readFileSync(path.join(f.output, 'keep.txt'), 'utf8'), 'existing output');
  const secondOutput = path.join(path.dirname(f.output), 'second-output');
  f.put(path.join(f.updated, '.vercel/output/functions/api/sales.func/.env'), 'no secrets permitted');
  assert.throws(() => preparePrivateOverlay({ ...f, output: secondOutput }), /Unexpected function artifact/);
  assert(!existsSync(secondOutput));
});
