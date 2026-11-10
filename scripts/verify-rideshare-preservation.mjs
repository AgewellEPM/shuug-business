import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { structuredDataHashes } from './rideshare-site/seo.mjs';

// Compare the assembled release with verified production artifacts. A public
// build from an older branch must not replace the live tour or private backend.
export function verifyPreservation({ proofFile, candidate }) {
  const proof = JSON.parse(readFileSync(proofFile, 'utf8'));
  assert.match(proof.deploymentId, /^dpl_[A-Za-z0-9]+$/);
  assert.equal(proof.projectId, 'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz');
  assert.equal(proof.verifiedUploadedArtifacts, proof.artifacts.length);
  const baseline = path.join(proof.baseline, '.vercel/output');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const read = (root, name) => readFileSync(path.join(root, name));
  const text = (root, name) => read(root, name).toString('utf8');
  const original = new Map();
  for (const item of proof.artifacts) {
    assert(!path.isAbsolute(item.path) && item.path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid artifact path.');
    const bytes = read(baseline, item.path);
    assert.equal(hash(bytes), item.sha256, `Production baseline changed: ${item.path}`);
    original.set(item.path, bytes);
  }
  const names = readdirSync(candidate, { recursive: true, withFileTypes: true }).filter(entry => {
    assert(!entry.isSymbolicLink(), 'Release artifacts must not be symbolic links.');
    return entry.isFile();
  }).map(entry => path.relative(candidate, path.join(entry.parentPath, entry.name))).sort();
  const oldPage = 'static/app-features.html';
  const newPage = 'static/about-the-app.html';
  assert.deepEqual(names.filter(name => !original.has(name)), [newPage]);
  assert.deepEqual([...original.keys()].filter(name => !names.includes(name)), [oldPage]);
  const withoutNavigation = html => html.replace(/<nav (?:class="public-primary" aria-label="Primary"|aria-label="Main navigation")>[\s\S]*?<\/nav>/g, '<nav>SHARED NAVIGATION</nav>');
  const featureLinks = html => html.replaceAll('href="/app-features', 'href="/about-the-app')
    .replaceAll('href="/get-the-app#app-features"', 'href="/about-the-app#app-features"')
    .replaceAll('See all app features →', 'About The App →');
  const changed = [], preserved = [], navigationPages = [];
  for (const name of names) {
    const bytes = read(candidate, name);
    if (!original.has(name)) continue;
    if (bytes.equals(original.get(name))) { preserved.push(name); continue; }
    changed.push(name);
    if (['config.json', 'static/site-manifest.json', 'static/sitemap.xml'].includes(name)) continue;
    assert(name.endsWith('.html') && !['static/sales.html', 'static/office-signup.html'].includes(name), `Protected production artifact changed: ${name}`);
    assert.equal(withoutNavigation(bytes.toString('utf8')), withoutNavigation(featureLinks(original.get(name).toString('utf8'))), `Public content changed outside app navigation/links: ${name}`);
    navigationPages.push(name);
  }
  const oldHtml = original.get(oldPage).toString('utf8');
  const newHtml = text(candidate, newPage);
  const body = html => { const match = html.match(/<body\b[^>]*>[\s\S]*<\/body>/i); assert(match); return match[0]; };
  assert.equal(withoutNavigation(body(newHtml)), withoutNavigation(body(oldHtml).replaceAll('href="#app-download"', 'href="/get-the-app#app-download"')), 'Detailed app content changed.');
  assert(newHtml.includes('<link rel="canonical" href="https://gigtax.pro/about-the-app">'));
  const oldManifest = JSON.parse(text(baseline, 'static/site-manifest.json'));
  const expectedManifest = JSON.parse(JSON.stringify(oldManifest).replaceAll('app-features', 'about-the-app'));
  assert.deepEqual(JSON.parse(text(candidate, 'static/site-manifest.json')), expectedManifest);
  assert.equal(text(candidate, 'static/sitemap.xml'), text(baseline, 'static/sitemap.xml').replaceAll('/app-features<', '/about-the-app<'));

  const before = JSON.parse(text(baseline, 'config.json'));
  const after = JSON.parse(text(candidate, 'config.json'));
  assert.equal(before.version, after.version);
  const appRoute = route => /app-features|about-the-app/.test(route.src || '');
  const expectedRoutes = [
    { src: '^/app-features$', status: 308, headers: { Location: '/about-the-app' } },
    { src: '^/app-features\\.html$', status: 308, headers: { Location: '/about-the-app' } },
    { src: '^/about-the-app\\.html$', status: 308, headers: { Location: '/about-the-app' } },
    { src: '/about-the-app', dest: '/about-the-app.html' },
  ];
  assert.deepEqual(after.routes.filter(appRoute), expectedRoutes);
  const security = config => config.routes.find(route => route.headers?.['Content-Security-Policy']).headers;
  const oldCsp = security(before)['Content-Security-Policy'];
  const newCsp = security(after)['Content-Security-Policy'];
  const directives = csp => csp.split(';').map(part => part.trim());
  assert.deepEqual(directives(oldCsp).filter(part => !part.startsWith('script-src ')), directives(newCsp).filter(part => !part.startsWith('script-src ')));
  const sources = csp => directives(csp).find(part => part.startsWith('script-src ')).split(/\s+/).slice(1);
  const expectedSources = new Set(sources(oldCsp));
  structuredDataHashes(oldHtml).forEach(value => expectedSources.delete(`'${value}'`));
  structuredDataHashes(newHtml).forEach(value => expectedSources.add(`'${value}'`));
  assert.deepEqual(new Set(sources(newCsp)), expectedSources, 'Only the renamed page JSON-LD hash may change.');
  const withoutAppRoutesOrCsp = config => config.routes.filter(route => !appRoute(route)).map(route => {
    const value = structuredClone(route);
    if (value.headers) delete value.headers['Content-Security-Policy'];
    return value;
  });
  assert.deepEqual(withoutAppRoutesOrCsp(after), withoutAppRoutesOrCsp(before), 'Unrelated routing or headers changed.');
  assert.equal(preserved.filter(name => name.startsWith('functions/')).length, 45);
  return {
    ok: true, checkedAt: new Date().toISOString(), baselineDeployment: proof.deploymentId,
    candidate: path.resolve(candidate), artifactCount: names.length, changed, added: [newPage], removed: [oldPage],
    preservedBackendArtifacts: 45, preservedArtifacts: preserved, navigationPages,
    limits: 'Artifact/content verification; deployment, runtime and human visual acceptance are separate.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [proofFile, candidate, evidenceFile] = process.argv.slice(2);
  assert(proofFile && candidate && evidenceFile, 'Usage: node verify-rideshare-preservation.mjs PROOF OUTPUT EVIDENCE');
  const result = verifyPreservation({ proofFile, candidate });
  writeFileSync(evidenceFile, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ok: result.ok, artifacts: result.artifactCount, changed: result.changed.length, preserved: result.preservedArtifacts.length, preservedBackend: result.preservedBackendArtifacts }));
}
