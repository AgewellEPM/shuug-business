import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { seoIndexable, structuredDataHashes } from './rideshare-site/seo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'deployments/rideshare-tax-pros/.vercel/output/static');
const manifest = JSON.parse(await readFile(path.join(output, 'site-manifest.json'), 'utf8'));
const { origin, aliases } = manifest;
const checks = [];
async function load(url, options = {}) {
  return fetch(url, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(30000), ...options });
}
async function redirect(from, to) {
  const requested = new URL(from, origin);
  const expected = new URL(to, origin);
  const response = await load(requested);
  assert.equal(response.status, 308, requested.href);
  assert.equal(new URL(response.headers.get('location'), requested).href, expected.href, requested.href);
  checks.push({ url: requested.href, status: 308, location: expected.href });
}
for (const [from, to] of [
  ['/index.html', '/'],
  ...aliases.filter(seoIndexable).map(slug => [`/${slug}.html`, `/${slug}`]),
  ['/tour/index.html', '/tour/'], ['/tour', '/tour/'],
]) await redirect(`${from}?source=seo-check&step=1`, `${to}?source=seo-check&step=1`);
if (origin === 'https://gigtax.pro') {
  for (const route of ['/', '/services?source=seo-check', '/tour/']) await redirect(`https://www.gigtax.pro${route}`, `${origin}${route}`);
}
const sitemapResponse = await load(`${origin}/sitemap.xml`);
assert.equal(sitemapResponse.status, 200);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const expectedUrls = ['', ...aliases, 'tour'].filter(seoIndexable).map(slug => `${origin}/${slug === 'tour' ? 'tour/' : slug}`);
assert.deepEqual([...urls].sort(), [...new Set(expectedUrls)].sort());
for (let index = 0; index < urls.length; index += 4) {
  checks.push(...await Promise.all(urls.slice(index, index + 4).map(async url => {
    // A user-agent accessibility check; this is not proof of an actual Google crawl.
    const response = await load(url, { headers: { 'User-Agent': 'Googlebot' } });
    assert.equal(response.status, 200, url);
    const html = await response.text();
    assert(html.includes(`<link rel="canonical" href="${url}">`), url);
    assert(html.includes('content="index, follow, max-image-preview:large"'), url);
    const csp = response.headers.get('content-security-policy') || '';
    for (const hash of structuredDataHashes(html)) assert(csp.includes(`'${hash}'`), `${url} structured data hash`);
    return { url, status: 200, canonical: url, userAgent: 'Googlebot', structuredDataAllowed: true };
  })));
}
const robotsResponse = await load(`${origin}/robots.txt`);
assert.equal(robotsResponse.status, 200);
assert((await robotsResponse.text()).includes(`Sitemap: ${origin}/sitemap.xml`));
for (const route of ['/client-portal', '/sales', '/office-signup', '/bank-return', '/__seo-missing-page-check']) {
  const response = await load(origin + route);
  assert.equal(response.status, route.startsWith('/__') ? 404 : 200, route);
  assert((await response.text()).match(/<meta name="robots" content="noindex,/), route);
  checks.push({ url: origin + route, status: response.status, noindex: true });
}
console.log(JSON.stringify({ ok: true, origin, verifiedAt: new Date().toISOString(), checks, limits: 'HTTP and metadata checks do not establish Google indexing, rankings or visual acceptance.' }, null, 2));
