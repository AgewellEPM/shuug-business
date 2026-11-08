import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { seoIndexable } from './seo.mjs';
import { renderTour } from './tour.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'public/rideshare-tax-pros');
const output = process.env.RIDESHARE_TEST_SITE_DIR || path.join(root, 'deployments/rideshare-tax-pros/.vercel/output/static');
const read = (directory, file) => readFileSync(path.join(directory, file), 'utf8');
const htmlFiles = directory => readdirSync(directory, { recursive: true }).filter(filename => filename.endsWith('.html')).sort();
const manifest = JSON.parse(read(output, 'site-manifest.json'));
process.env.RIDESHARE_SITE_ORIGIN ||= manifest.origin;
const { renderedPages } = await import('./pages.mjs');
const { renderHome, renderPage } = await import('./layout.mjs');
const slugOf = file => file === 'index.html' ? '' : file === 'tour/index.html' ? 'tour' : file.replace(/\.html$/, '');
const canonicalOf = slug => `${manifest.origin}/${slug === 'tour' ? 'tour/' : slug}`;
const bodyOf = html => {
  const match = html.match(/<body\b[^>]*>[\s\S]*<\/body\s*>/i);
  assert(match, 'Expected a body element');
  return match[0];
};
function assertTruthfulSchema(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(assertTruthfulSchema); return; }
  const forbiddenTypes = new Set(['LocalBusiness', 'AggregateRating', 'Review', 'SoftwareApplication', 'VideoObject', 'FAQPage', 'Article']);
  const forbiddenKeys = new Set(['telephone', 'email', 'address', 'sameAs', 'legalName', 'foundingDate', 'ratingValue', 'price', 'offers', 'downloadUrl', 'aggregateRating', 'review', 'reviews', 'ratingCount', 'reviewCount', 'hasCredential']);
  for (const [key, item] of Object.entries(value)) {
    assert(!forbiddenKeys.has(key), `Unverified structured-data property: ${key}`);
    if (key === '@type') for (const type of [].concat(item)) assert(!forbiddenTypes.has(type), `Unverified structured-data type: ${type}`);
    if (key === 'alternateName') assert.equal(item, 'gigtax.pro');
    assertTruthfulSchema(item);
  }
}

test('built SEO leaves every generated or copied page body identical to its existing renderer/source', () => {
  const expected = new Map(htmlFiles(source).map(file => [file, read(source, file)]));
  expected.set('index.html', renderHome(read(source, 'index.html')));
  expected.set('tour/index.html', renderTour(read(source, 'tour/index.html')));
  renderedPages().forEach(page => expected.set(page.file, page.html));
  for (const [slug, label] of [['privacy', 'Privacy notice'], ['terms', 'Website terms'], ['accessibility', 'Accessibility']]) {
    const original = read(source, `${slug}.html`);
    const body = original.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
    expected.set(`${slug}.html`, renderPage({ slug, label, description: `${label} for the Gig Tax Pros website.`, main: `<div class="legal-content">${body}</div>` }));
  }
  assert.deepEqual(htmlFiles(output), [...expected.keys()].sort());
  for (const [file, html] of expected) assert.equal(bodyOf(read(output, file)), bodyOf(html), `${file} body changed`);
});

test('all built HTML has unique metadata, truthful structured data, and correctly scoped indexing', () => {
  const titles = new Set();
  for (const file of htmlFiles(output)) {
    const slug = slugOf(file);
    const dom = new JSDOM(read(output, file));
    const d = dom.window.document;
    try {
      assert.equal(d.querySelectorAll('head title').length, 1, file);
      assert(!titles.has(d.title), `Duplicate built title: ${d.title}`); titles.add(d.title);
      assert.equal(d.querySelectorAll('head meta[name="description"]').length, 1, file);
      assert.equal(d.querySelectorAll('head meta[name="robots"]').length, 1, file);
      assert.equal(d.querySelectorAll('head link[rel="canonical"]').length, 1, file);
      assert.equal(d.querySelector('head link[rel="canonical"]').href, canonicalOf(slug), file);
      const robots = d.querySelector('meta[name="robots"]').content;
      assert.equal(robots.includes('noindex'), !seoIndexable(slug), file);
      for (const property of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image', 'og:site_name', 'og:locale']) assert.equal(d.querySelectorAll(`head meta[property="${property}"]`).length, 1, `${file}: ${property}`);
      for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.equal(d.querySelectorAll(`head meta[name="${name}"]`).length, 1, `${file}: ${name}`);
      assert.equal(d.querySelector('meta[property="og:site_name"]').content, 'Gig Tax Pros');
      const schemas = [...d.querySelectorAll('script[type="application/ld+json"]')];
      assert.equal(schemas.length, seoIndexable(slug) ? 1 : 0, file);
      for (const script of schemas) {
        const data = JSON.parse(script.textContent);
        const graph = data['@graph'];
        assert(graph.some(item => item['@type'] === 'WebPage'));
        assertTruthfulSchema(data);
        if (!slug) {
          const organization = graph.find(item => item['@type'] === 'Organization');
          assert.equal(organization.name, 'Gig Tax Pros');
          assert.equal(organization.logo.url, `${manifest.origin}/assets/brand-mark.svg`);
          assert.equal(organization.alternateName, 'gigtax.pro');
        } else assert(graph.some(item => item['@type'] === 'BreadcrumbList'));
      }
    } finally { dom.window.close(); }
  }
});

test('generated sitemap includes the tour canonical and excludes non-indexable utility routes', () => {
  const dom = new JSDOM(read(output, 'sitemap.xml'), { contentType: 'text/xml' });
  try {
    const actual = [...dom.window.document.querySelectorAll('loc')].map(element => element.textContent).sort();
    const expected = [...new Set(['', ...manifest.aliases, 'tour'])].filter(seoIndexable).map(canonicalOf).sort();
    assert.deepEqual(actual, expected);
    assert(actual.includes(`${manifest.origin}/tour/`));
    assert(!actual.includes(`${manifest.origin}/client-portal`));
    assert.equal(new Set(actual).size, actual.length);
    assert(read(output, 'robots.txt').includes(`Sitemap: ${manifest.origin}/sitemap.xml`));
  } finally { dom.window.close(); }
});

test('the deployed CSP permits each exact JSON-LD payload without allowing arbitrary inline scripts', () => {
  const config = path.resolve(output, '../config.json');
  const csp = existsSync(config)
    ? JSON.parse(readFileSync(config, 'utf8')).routes.find(route => route.headers?.['Content-Security-Policy']).headers['Content-Security-Policy']
    : read(output, '_headers').match(/Content-Security-Policy:\s*([^\n]+)/)[1];
  assert(csp.includes("script-src 'self'"));
  assert(!csp.includes("'unsafe-inline'"));
  const required = new Set();
  for (const file of htmlFiles(output)) {
    const dom = new JSDOM(read(output, file));
    try {
      for (const script of dom.window.document.querySelectorAll('script[type="application/ld+json"]:not([src])')) {
        const hash = `sha256-${createHash('sha256').update(script.textContent).digest('base64')}`;
        required.add(hash);
        assert(csp.includes(`'${hash}'`), `${file} structured data missing from CSP`);
      }
    } finally { dom.window.close(); }
  }
  const configured = new Set([...csp.matchAll(/'(sha256-[^']+)'/g)].map(match => match[1]));
  assert.deepEqual([...configured].sort(), [...required].sort());
});

test('the explicit 144px organization mark preserves the existing favicon artwork exactly', () => {
  const mark = new JSDOM(read(output, 'assets/brand-mark.svg'), { contentType: 'image/svg+xml' });
  const favicon = new JSDOM(read(source, 'favicon.svg'), { contentType: 'image/svg+xml' });
  try {
    const actual = mark.window.document.documentElement;
    const original = favicon.window.document.documentElement;
    assert.equal(actual.getAttribute('width'), '144');
    assert.equal(actual.getAttribute('height'), '144');
    assert.equal(actual.getAttribute('viewBox'), original.getAttribute('viewBox'));
    assert.equal(actual.innerHTML, original.innerHTML);
  } finally { mark.window.close(); favicon.window.close(); }
});
