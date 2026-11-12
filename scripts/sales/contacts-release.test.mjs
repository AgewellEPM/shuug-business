import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { prepareContactsRelease, sha } from './prepare-contacts-release.mjs';
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'gigtax-contact-release-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = path.join(root, 'baseline'), updated = path.join(root, 'updated'), output = path.join(root, 'output'), inventory = path.join(root, 'inventory.json'), projectFile = path.join(root, 'project.json');
  const put = (dir, name, text) => { const target = path.join(dir, name); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, text); };
  const files = { 'config.json': '{"version":3}', 'static/index.html': 'EXACT PUBLIC HOMEPAGE', 'static/sales.html': 'old sales', 'functions/api/sales.func/payments.mjs': 'payment code' };
  const children = [];
  for (const [name, bytes] of Object.entries(files)) { put(baseline, name, bytes); put(updated, name, bytes); children.push({ name, type: 'file', uid: sha(bytes, 'sha1') }); }
  writeFileSync(inventory, JSON.stringify([{ name: 'src', children: [{ name: '.vercel', children: [{ name: 'output', children }] }] }]));
  writeFileSync(projectFile, JSON.stringify({ projectId: 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz', orgId: 'team_KbZcSA3vllTFUuB0DJJVeW83' }));
  put(updated, 'static/sales.html', 'new private console'); put(updated, 'static/sales-contacts.js', 'new private contact code');
  return { baseline, updated, output, inventory, deployment: 'dpl_Synthetic', projectFile, put };
}
test('the contact release preserves public pages and routes against the actual uploaded-hash contract', t => {
  const f = fixture(t), receipt = prepareContactsRelease(f);
  assert.equal(receipt.baselineVerifiedArtifacts, 4); assert.equal(receipt.configPreservedExactly, true);
  assert.deepEqual(readFileSync(path.join(f.output, '.vercel/output/static/index.html')), readFileSync(path.join(f.baseline, 'static/index.html')));
  assert.deepEqual(receipt.added, ['static/sales-contacts.js']);
});
for (const [name, reason] of [['static/index.html', /Protected production artifact/], ['config.json', /Protected production artifact/], ['functions/api/sales.func/payments.mjs', /Protected production artifact/]]) {
  test(`the contact release rejects an unrelated change to ${name} before output exists`, t => {
    const f = fixture(t); f.put(f.updated, name, 'UNAUTHORIZED CHANGE'); assert.throws(() => prepareContactsRelease(f), reason); assert.equal(existsSync(f.output), false);
  });
}
