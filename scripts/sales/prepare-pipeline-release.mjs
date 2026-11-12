import assert from 'node:assert/strict';
import { constants, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactFiles, sha, uploadedFiles } from './prepare-contacts-release.mjs';

export const PIPELINE_STATIC = new Set(['sales.html', 'office-signup.html', 'sales.js', 'sales-console.js', 'sales-console.css', 'sales-progress.js', 'sales-contracts.js', 'contract-signature.js']);
const MODULES = new Set(['handler.mjs', 'model.mjs', 'service.mjs', 'pipeline.mjs', 'contracts.mjs', 'contract-delivery.mjs', 'mail-provider.mjs', 'mail-webhook.mjs']);
const MAIL_ROUTE = { src: '/api/sales-mail-webhook', dest: '/api/sales-mail-webhook' };
const LINK = '<a href="/sales">Agent sign-in</a>';
export function validatePipelineDelta(name, before, after) {
  if (name === 'config.json') {
    const original = JSON.parse(before), candidate = JSON.parse(after);
    assert.deepEqual(candidate.routes.filter(route => route.src === MAIL_ROUTE.src), [MAIL_ROUTE], 'Only the one mail callback route may be added.');
    assert.deepEqual({ ...candidate, routes: candidate.routes.filter(route => route.src !== MAIL_ROUTE.src) }, original, 'Existing routes, headers and CSP must remain exact.');
    return 'mail_callback_route';
  }
  if (name.startsWith('static/')) {
    const relative = name.slice(7);
    if (PIPELINE_STATIC.has(relative)) return 'private_pipeline_asset';
    assert(relative.endsWith('.html'), `Protected public artifact changed: ${name}`);
    const html = after.toString();
    assert.equal(html.split(LINK).length - 1, 1, 'Only one agent sign-in link may be added to a public page.');
    assert(/<nav aria-label="Footer Start here">[^]*?<a href="\/sales">Agent sign-in<\/a><\/nav>/.test(html), 'Agent sign-in must be in the existing Start here footer.');
    assert.equal(html.replace(LINK, ''), before.toString(), `Public content changed outside the agent sign-in footer link: ${name}`);
    return 'agent_signin_footer';
  }
  assert(/^functions\/api\/(sales|offices|sales-webhook)\.func\/[^/]+$/.test(name) && MODULES.has(path.basename(name)), `Protected backend artifact changed: ${name}`);
  return 'pipeline_module';
}
export function preparePipelineRelease({ baseline, updated, inventory, deployment, output, projectFile }) {
  assert.match(deployment, /^dpl_[A-Za-z0-9]+$/); assert(!existsSync(output), 'Use a new release directory.');
  const project = JSON.parse(readFileSync(projectFile));
  assert.equal(project.projectId, 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz'); assert.equal(project.orgId, 'team_KbZcSA3vllTFUuB0DJJVeW83');
  const uploaded = uploadedFiles(JSON.parse(readFileSync(inventory))), oldNames = artifactFiles(baseline), names = artifactFiles(updated);
  assert.deepEqual([...uploaded.keys()].sort(), oldNames, 'The baseline must be the exact current production artifact inventory.');
  const originals = new Map(), changed = [], added = [], protectedPublic = [], publicFooterUpdates = [];
  for (const name of oldNames) {
    const bytes = readFileSync(path.join(baseline, name)); assert.equal(sha(bytes, 'sha1'), uploaded.get(name), `Current uploaded baseline differs: ${name}`);
    assert(names.includes(name), `An existing production artifact was removed: ${name}`); originals.set(name, bytes);
  }
  for (const name of names) {
    const bytes = readFileSync(path.join(updated, name));
    if (originals.has(name) && !bytes.equals(originals.get(name))) {
      const reason = validatePipelineDelta(name, originals.get(name), bytes); changed.push({ path: name, reason });
      if (reason === 'agent_signin_footer') publicFooterUpdates.push(name);
    } else if (!originals.has(name)) {
      if (name.startsWith('functions/api/sales-mail-webhook.func/')) {
        const file = path.basename(name);
        if (file === '.vc-config.json') assert.deepEqual(JSON.parse(bytes), { runtime: 'nodejs22.x', handler: 'mail-webhook.mjs', launcherType: 'Nodejs', maxDuration: 60 });
        else { assert(file.endsWith('.mjs') && !file.endsWith('.test.mjs')); assert(bytes.equals(readFileSync(path.join(updated, 'functions/api/sales.func', file))), 'The callback must contain the same reviewed backend modules.'); }
      } else if (name.startsWith('static/')) assert(PIPELINE_STATIC.has(name.slice(7)), `Unexpected public asset: ${name}`);
      else assert(/^functions\/api\/(sales|offices|sales-webhook)\.func\/[^/]+$/.test(name) && MODULES.has(path.basename(name)), `Unexpected backend asset: ${name}`);
      added.push(name);
    }
    if (name.startsWith('static/') && !PIPELINE_STATIC.has(name.slice(7))) protectedPublic.push({ path: name, sha1: sha(bytes, 'sha1'), sha256: sha(bytes), footerLinkOnly: publicFooterUpdates.includes(name) });
  }
  const config = readFileSync(path.join(updated, 'config.json')); validatePipelineDelta('config.json', originals.get('config.json'), config);
  mkdirSync(path.join(output, '.vercel'), { recursive: true }); cpSync(updated, path.join(output, '.vercel/output'), { recursive: true, mode: constants.COPYFILE_FICLONE }); cpSync(projectFile, path.join(output, '.vercel/project.json'));
  const receipt = { ok: true, preparedAt: new Date().toISOString(), baselineDeployment: deployment, preparedOutput: path.join(output, '.vercel/output'), projectId: project.projectId, orgId: project.orgId,
    baselineVerifiedArtifacts: oldNames.length, existingRoutesHeadersCspPreserved: true, addedApiRoute: MAIL_ROUTE, changed, added, removed: [], publicFooterUpdates, protectedPublic,
    unchangedPublicFileCount: protectedPublic.filter(item => !item.footerLinkOnly).length,
    files: names.map(name => { const bytes = readFileSync(path.join(updated, name)); return { path: name, sha1: sha(bytes, 'sha1'), sha256: sha(bytes) }; }) };
  writeFileSync(path.join(output, 'preservation-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseline, updated, inventory, deployment, output, projectFile] = process.argv.slice(2), result = preparePipelineRelease({ baseline, updated, inventory, deployment, output, projectFile });
  console.log(JSON.stringify({ ok: result.ok, baselineVerifiedArtifacts: result.baselineVerifiedArtifacts, artifacts: result.files.length, changed: result.changed, added: result.added, unchangedPublicFiles: result.unchangedPublicFileCount, footerLinkUpdates: result.publicFooterUpdates.length, existingRoutesHeadersCspPreserved: true }));
}
