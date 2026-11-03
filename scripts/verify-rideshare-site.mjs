import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deployments/rideshare-tax-pros/.vercel/output/static');
const origin = 'https://rideshare-tax-pros.vercel.app';
const files = (await readdir(source, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => path.relative(source, path.join(entry.parentPath, entry.name)));
const checks = await Promise.all(files.map(async filename => {
  const route = filename === 'index.html' ? '/' : `/${filename}`;
  const response = await fetch(origin + route, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200, `${route} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(bytes, await readFile(path.join(source, filename)), `${route} differs from saved source`);
  if (route === '/') assert(response.headers.get('content-security-policy')?.includes("default-src 'self'"), 'Missing public security policy');
  return { route, status: response.status, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
const manifest = JSON.parse(await readFile(path.join(source, 'site-manifest.json'), 'utf8'));
for (const slug of manifest.aliases) {
  const response = await fetch(`${origin}/${slug}`, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200, `/${slug} alias failed`);
  assert.equal(await response.text(), await readFile(path.join(source, `${slug}.html`), 'utf8'));
  checks.push({ route: `/${slug}`, status: 200 });
}
const missing = await fetch(`${origin}/__missing-page-check`, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
assert.equal(missing.status, 404, 'Missing page did not return HTTP 404');
assert((await missing.text()).includes('Let’s get you'), 'Missing page did not show the branded recovery page');
checks.push({ route: '/__missing-page-check', status: 404 });
console.log(JSON.stringify({ ok: true, origin, verifiedAt: new Date().toISOString(), checks, visualAcceptance: 'Not established by HTTP checks; Luke’s screenshots are required.' }, null, 2));
