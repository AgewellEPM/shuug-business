import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This prepares an artifact only. It never contacts Vercel or deploys anything.
export const PRIVATE_STATIC = Object.freeze([
  'sales.html', 'office-signup.html', 'sales.css', 'sales.js',
  'directory-admin.js', 'sales-research.js', 'sales-workflows.js',
  'sales-console.css', 'sales-console.js',
]);
export const PRIVATE_FUNCTIONS = Object.freeze([
  'api/sales.func', 'api/offices.func', 'api/sales-webhook.func',
]);
const PROJECT = 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz';
const TEAM = 'team_KbZcSA3vllTFUuB0DJJVeW83';
const DEPLOYMENT = 'dpl_5H37bhiFyQ3x4ch7Q1ApW2PmE4sC';
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8'));

function safeRelative(value) {
  assert.equal(typeof value, 'string', 'Artifact path must be a string.');
  assert(value && !path.isAbsolute(value) && !value.includes('\\'), `Invalid artifact path: ${value}`);
  assert(value.split('/').every(part => part && part !== '.' && part !== '..'), `Invalid artifact path: ${value}`);
  return value;
}

function filesIn(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), `Symbolic links are not allowed: ${entry.name}`);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return filesIn(path.join(directory, entry.name), relative);
    assert(entry.isFile(), `Unsupported artifact: ${relative}`);
    return [relative];
  }).sort();
}

function readArtifact(root, relative) {
  safeRelative(relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    assert(!lstatSync(current).isSymbolicLink(), `Symbolic links are not allowed: ${relative}`);
  }
  assert(lstatSync(current).isFile(), `Artifact must be a regular file: ${relative}`);
  return readFileSync(current);
}

function put(root, relative, bytes) {
  const target = path.join(root, safeRelative(relative));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function projectLink(directory) {
  const result = json(path.join(directory, '.vercel/project.json'));
  assert.equal(result.projectId, PROJECT, 'The Vercel project must not change.');
  assert.equal(result.orgId, TEAM, 'The Vercel team must not change.');
  return result;
}

export function preparePrivateOverlay({ baseline, updated, proof, output }) {
  for (const [name, value] of Object.entries({ baseline, updated, proof, output })) {
    assert(value && path.isAbsolute(value), `${name} must be an absolute path.`);
  }
  assert(!existsSync(output), 'Output must be a new directory; existing output is never overwritten.');
  const baselineLink = projectLink(baseline);
  const updatedLink = projectLink(updated);
  assert.equal(updatedLink.projectId, baselineLink.projectId);
  assert.equal(updatedLink.orgId, baselineLink.orgId);
  const manifest = json(proof);
  assert.equal(manifest.deploymentId, DEPLOYMENT, 'The reviewed live deployment must match.');
  assert.equal(manifest.projectId, PROJECT);
  assert.equal(manifest.orgId, TEAM);
  assert.equal(manifest.artifacts.length, 117, 'The reviewed live inventory contains exactly 117 artifacts.');
  assert.equal(new Set(manifest.artifacts.map(item => item.path)).size, 117, 'Duplicate baseline artifacts.');
  const original = new Map();
  const baseOutput = path.join(baseline, '.vercel/output');
  const updatedOutput = path.join(updated, '.vercel/output');

  // Validate every source before creating output, so a stale or altered baseline fails closed.
  for (const artifact of manifest.artifacts) {
    assert.match(artifact.sha1, /^[a-f0-9]{40}$/);
    const bytes = readArtifact(baseOutput, artifact.path);
    assert.equal(hash(bytes, 'sha1'), artifact.sha1, `Published baseline differs: ${artifact.path}`);
    original.set(artifact.path, bytes);
  }
  assert(original.has('config.json'), 'The original route configuration is required.');
  const overlays = new Map();
  for (const relative of PRIVATE_STATIC) {
    const bytes = readArtifact(updatedOutput, `static/${relative}`);
    if (relative.endsWith('.html')) {
      const html = bytes.toString('utf8');
      for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=/.test(attributes) || !body.trim()) continue;
        const csp = JSON.parse(original.get('config.json')).routes.flatMap(route => Object.entries(route.headers || {}))
          .find(([key]) => key.toLowerCase() === 'content-security-policy')?.[1] || '';
        assert(csp.includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`), `Private inline script is blocked by original CSP: ${relative}`);
      }
      assert(!/<style\b|\sstyle\s*=|\son[a-z]+\s*=/i.test(html), `Private page requires disallowed inline style/handler: ${relative}`);
    }
    overlays.set(`static/${relative}`, bytes);
  }
  for (const prefix of PRIVATE_FUNCTIONS) {
    const directory = path.join(updatedOutput, 'functions', prefix);
    const names = filesIn(directory);
    assert(names.length && names.includes('.vc-config.json'), `Function configuration missing: ${prefix}`);
    const settings = json(path.join(directory, '.vc-config.json'));
    assert.equal(settings.runtime, 'nodejs22.x');
    assert(names.includes(settings.handler), `Function handler missing: ${prefix}`);
    for (const name of names) {
      assert(name === '.vc-config.json' || (/\.mjs$/.test(name) && !/\.test\.mjs$/.test(name)), `Unexpected function artifact: ${prefix}/${name}`);
      overlays.set(`functions/${prefix}/${name}`, readArtifact(directory, name));
    }
  }

  const candidate = new Map(original);
  // Replace each function directory as a unit, so removed code cannot survive in the package.
  for (const prefix of PRIVATE_FUNCTIONS) {
    for (const relative of candidate.keys()) if (relative.startsWith(`functions/${prefix}/`)) candidate.delete(relative);
  }
  for (const [relative, bytes] of overlays) candidate.set(relative, bytes);
  const destination = path.join(output, '.vercel/output');
  for (const [relative, bytes] of candidate) put(destination, relative, bytes);
  put(output, '.vercel/project.json', Buffer.from(JSON.stringify(baselineLink, null, 2) + '\n'));

  const changed = [];
  const added = [];
  const removed = [];
  const protectedPublic = [];
  for (const [relative, bytes] of original) {
    if (!candidate.has(relative)) removed.push(relative);
    else if (!bytes.equals(candidate.get(relative))) changed.push(relative);
    if (relative.startsWith('static/') && !overlays.has(relative)) {
      assert(bytes.equals(readArtifact(destination, relative)), `Public artifact changed: ${relative}`);
      protectedPublic.push({ path: relative, sha256: hash(bytes), size: bytes.length });
    }
  }
  for (const relative of candidate.keys()) if (!original.has(relative)) added.push(relative);
  const permitted = relative => overlays.has(relative) || PRIVATE_FUNCTIONS.some(prefix => relative.startsWith(`functions/${prefix}/`));
  assert([...changed, ...added, ...removed].every(permitted), 'The output changes an artifact outside the private whitelist.');
  assert(original.get('config.json').equals(readArtifact(destination, 'config.json')), 'Original routes/CSP must remain byte-identical.');
  const actual = filesIn(destination);
  assert.deepEqual(actual, [...candidate.keys()].sort(), 'Unexpected output files.');
  assert(actual.every(relative => readArtifact(destination, relative).equals(candidate.get(relative))), 'Output digest differs.');
  const receipt = {
    preparedAt: new Date().toISOString(), deployed: false, deploymentId: DEPLOYMENT,
    projectId: PROJECT, orgId: TEAM, preparedCwd: output, preparedOutput: destination,
    baselineArtifactCount: original.size, baselineArtifactSHA1Matches: original.size,
    configPreservedExactly: true, configSHA256: hash(original.get('config.json')),
    privateStaticOverlay: PRIVATE_STATIC, functionOverlay: PRIVATE_FUNCTIONS,
    changed: changed.sort(), added: added.sort(), removed: removed.sort(),
    protectedPublic,
    files: actual.map(relative => ({ path: relative, sha256: hash(candidate.get(relative)), size: candidate.get(relative).length })),
  };
  put(output, 'preservation-receipt.json', Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    assert(['--baseline', '--updated', '--proof', '--output'].includes(process.argv[index]), 'Use --baseline --updated --proof --output.');
    values[process.argv[index].slice(2)] = process.argv[index + 1];
  }
  const receipt = preparePrivateOverlay(values);
  console.log(JSON.stringify({ preparedCwd: receipt.preparedCwd, baselineSHA1Matches: receipt.baselineArtifactSHA1Matches, publicFilesPreserved: receipt.protectedPublic.length, configPreservedExactly: receipt.configPreservedExactly, changed: receipt.changed.length, added: receipt.added.length, removed: receipt.removed.length }));
}
