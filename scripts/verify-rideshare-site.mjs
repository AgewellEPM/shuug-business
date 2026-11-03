import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deployments/rideshare-tax-pros/.vercel/output/static');
const origin = 'https://rideshare-tax-pros.vercel.app';
const files = (await readdir(source, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => path.relative(source, path.join(entry.parentPath, entry.name)));
async function load(route) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(origin + route, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      return { response, bytes: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      if (attempt === 1) throw new Error(`Public request failed for ${route}: ${error.message}`);
    }
  }
}
const checks = [];
for (let offset = 0; offset < files.length; offset += 4) {
  const batch = await Promise.all(files.slice(offset, offset + 4).map(async filename => {
  const route = filename === 'index.html' ? '/' : `/${filename}`;
  const { response, bytes } = await load(route);
  assert.equal(response.status, 200, `${route} returned ${response.status}`);
  assert.deepEqual(bytes, await readFile(path.join(source, filename)), `${route} differs from saved source`);
  if (route === '/') assert(response.headers.get('content-security-policy')?.includes("default-src 'self'"), 'Missing public security policy');
  return { route, status: response.status, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  checks.push(...batch);
}
const manifest = JSON.parse(await readFile(path.join(source, 'site-manifest.json'), 'utf8'));
for (const slug of manifest.aliases) {
  const { response, bytes } = await load(`/${slug}`);
  assert.equal(response.status, 200, `/${slug} alias failed`);
  assert.equal(bytes.toString('utf8'), await readFile(path.join(source, `${slug}.html`), 'utf8'));
  checks.push({ route: `/${slug}`, status: 200 });
}
const { response: missing, bytes: missingBytes } = await load('/__missing-page-check');
assert.equal(missing.status, 404, 'Missing page did not return HTTP 404');
assert(missingBytes.toString('utf8').includes('Let’s get you'), 'Missing page did not show the branded recovery page');
checks.push({ route: '/__missing-page-check', status: 404 });
console.log(JSON.stringify({ ok: true, origin, verifiedAt: new Date().toISOString(), checks, visualAcceptance: 'Not established by HTTP checks; Luke’s screenshots are required.' }, null, 2));
