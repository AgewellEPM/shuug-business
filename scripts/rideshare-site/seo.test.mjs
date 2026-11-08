import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import { optimizeSeo, seoIndexable, structuredDataHashes } from './seo.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const origin = 'https://gigtax.pro';
const body = '<body class="approved-art"><main><h1>Keep this exact artwork.</h1><a href="/get-the-app">Get The App →</a></main><script src="/app.js" defer></script></body>';
const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Old title</title><meta name="description" content="Old description"><link rel="canonical" href="https://old.example/"><link rel="stylesheet" href="/styles.css"><script defer src="/links.js"></script></head>${body}</html>`;
const publicRoutes = ['', 'services', 'how-it-works', 'drivers', 'get-the-app', 'offices', 'resources', 'about', 'tax-preparation', 'mileage-and-expenses', 'quarterly-taxes', 'bookkeeping', 'free', 'get-started', 'document-checklist', 'guides/uber-lyft-tax-forms', 'faq', 'contact', 'tour', 'privacy', 'terms', 'accessibility'];
function inspect(html) {
  const dom = new JSDOM(html);
  const d = dom.window.document;
  return { dom, d, content: selector => d.querySelector(selector)?.getAttribute('content') };
}
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

test('public routes receive unique descriptive titles, complete social metadata and their exact canonical URLs', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const slug of publicRoutes) {
    const html = optimizeSeo(fixture, { slug, origin });
    const { dom, d, content } = inspect(html);
    try {
      assert(d.title.includes('Gig Tax Pros'));
      if (!slug) assert.equal(d.title, 'Gig Tax Pros | Gig Tax Experts for Rideshare & Delivery');
      assert(d.title.length >= 20 && d.title.length <= 75, slug);
      assert(!titles.has(d.title), `Repeated title on ${slug}`); titles.add(d.title);
      const description = content('meta[name="description"]');
      assert(description.length >= 70 && description.length <= 190, `${slug}: ${description}`);
      assert(!descriptions.has(description), `Repeated description on ${slug}`); descriptions.add(description);
      const canonical = `${origin}/${slug === 'tour' ? 'tour/' : slug}`;
      assert.equal(d.querySelector('link[rel="canonical"]').href, canonical);
      assert.equal(content('meta[property="og:url"]'), canonical);
      assert.equal(content('meta[property="og:title"]'), d.title);
      assert.equal(content('meta[property="og:description"]'), description);
      assert.equal(content('meta[property="og:site_name"]'), 'Gig Tax Pros');
      assert.equal(content('meta[property="og:locale"]'), 'en_US');
      assert.equal(content('meta[property="og:image"]'), `${origin}/tour/poster.jpg`);
      assert.equal(content('meta[name="twitter:title"]'), d.title);
      assert.equal(content('meta[name="twitter:description"]'), description);
      assert.equal(content('meta[name="twitter:card"]'), 'summary_large_image');
      assert(!content('meta[name="robots"]').includes('noindex'));
      assert(seoIndexable(slug));
    } finally { dom.window.close(); }
  }
});

test('metadata upserts remove duplicates and stay idempotent while preserving the exact body and unrelated head assets', () => {
  const extra = '<TITLE>Duplicate</TITLE><META CONTENT="duplicate" NAME="DESCRIPTION"><meta property="og:title" content="Old > title"><meta name="robots" content="noindex"><link href="https://duplicate.example/" rel="CANONICAL"><meta name="google-site-verification" content="owner-token">';
  const input = fixture.replace('</head>', `${extra}</head>`);
  const once = optimizeSeo(input, { slug: 'services', origin });
  assert.equal(optimizeSeo(once, { slug: 'services', origin }), once);
  assert.equal(once.slice(once.indexOf('<body')), input.slice(input.indexOf('<body')));
  assert(once.includes('<link rel="stylesheet" href="/styles.css">'));
  assert(once.includes('<script defer src="/links.js"></script>'));
  const { dom, d, content } = inspect(once);
  try {
    assert.equal(d.querySelectorAll('title').length, 1);
    assert.equal(d.querySelectorAll('link[rel="canonical"]').length, 1);
    for (const name of ['description', 'robots', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.equal(d.querySelectorAll(`meta[name="${name}"]`).length, 1);
    for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name', 'og:locale']) assert.equal(d.querySelectorAll(`meta[property="${property}"]`).length, 1);
    assert.equal(content('meta[name="google-site-verification"]'), 'owner-token');
    assert.equal(d.querySelectorAll('script#site-seo-structured-data').length, 1);
  } finally { dom.window.close(); }
});

test('home identity schema uses only known brand details and public pages receive accurate breadcrumb hierarchy', () => {
  const { dom, d } = inspect(optimizeSeo(fixture, { slug: '', origin }));
  try {
    const data = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
    const organization = data['@graph'].find(item => item['@type'] === 'Organization');
    const site = data['@graph'].find(item => item['@type'] === 'WebSite');
    assert.equal(organization.name, 'Gig Tax Pros');
    assert.equal(organization.alternateName, 'gigtax.pro');
    assert.deepEqual(organization.logo, { '@type': 'ImageObject', url: `${origin}/assets/brand-mark.svg`, width: 144, height: 144 });
    assert.equal(site.name, 'Gig Tax Pros');
    assert.equal(site.alternateName, 'gigtax.pro');
    assert.equal(site.publisher['@id'], organization['@id']);
    assertTruthfulSchema(data);
    assert(data['@graph'].some(item => item['@type'] === 'WebPage'));
  } finally { dom.window.close(); }
  for (const [slug, expectedNames] of [['services', ['Home', 'Services']], ['tax-preparation', ['Home', 'Services', 'Tax Preparation']], ['guides/uber-lyft-tax-forms', ['Home', 'Resources', 'Uber & Lyft Tax Forms']], ['tour', ['Home', 'App Tour']]]) {
    const { dom: current, d: doc } = inspect(optimizeSeo(fixture, { slug, origin }));
    try {
      const graph = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
      assert.deepEqual(graph.map(item => item['@type']), ['WebPage', 'BreadcrumbList']);
      const trail = graph[1].itemListElement;
      assert.deepEqual(trail.map(item => item.name), expectedNames);
      assert.deepEqual(trail.map(item => item.position), expectedNames.map((_, index) => index + 1));
      assert.equal(trail.at(-1).item, doc.querySelector('link[rel="canonical"]').href);
    } finally { current.window.close(); }
  }
});

test('utility routes are excluded from the sitemap policy and retain explicit non-indexing rules', () => {
  for (const [slug, robots] of [['client-portal', 'noindex, follow'], ['sales', 'noindex, nofollow'], ['office-signup', 'noindex, nofollow'], ['404', 'noindex, follow'], ['bank-return', 'noindex, nofollow']]) {
    const { dom, d, content } = inspect(optimizeSeo(fixture, { slug, origin }));
    try {
      assert.equal(content('meta[name="robots"]'), robots);
      assert.equal(seoIndexable(slug), false);
      assert.equal(d.querySelectorAll('script[type="application/ld+json"]').length, 0);
    } finally { dom.window.close(); }
  }
  assert.equal(seoIndexable('/client-portal.html'), false);
  assert.equal(seoIndexable('/tour/'), true);
});

test('existing reference imagery is preserved, safely escaped, and canonical aliases normalize consistently', () => {
  const input = fixture.replace('</head>', '<meta property="og:image" content="https://cdn.example/photo.png?a=1&amp;b=2"></head>');
  const html = optimizeSeo(input, { slug: '/about.html', origin: `${origin}/` });
  const { dom, d, content } = inspect(html);
  try {
    assert.equal(content('meta[property="og:image"]'), 'https://cdn.example/photo.png?a=1&b=2');
    assert.equal(content('meta[name="twitter:image"]'), content('meta[property="og:image"]'));
    assert.equal(d.querySelector('link[rel="canonical"]').href, `${origin}/about`);
    assert(html.includes('photo.png?a=1&amp;b=2'));
    assert.equal(d.querySelectorAll('body').length, 1);
  } finally { dom.window.close(); }
  for (const slug of ['tour', '/tour/', 'tour/index.html']) {
    const output = optimizeSeo(fixture, { slug, origin });
    assert(output.includes(`href="${origin}/tour/"`));
  }
  assert.throws(() => optimizeSeo(fixture, { slug: '../private', origin }), /slug/);
  assert.throws(() => optimizeSeo(fixture, { slug: '', origin: 'http://example.com' }), /HTTPS/);
  assert.throws(() => optimizeSeo(fixture, { slug: '', origin: 'https://owner:secret@example.com' }), /credentials/);
});

test('JSON-LD hashes cover exact inline bytes, deduplicate scripts, and ignore executable or external scripts', () => {
  const html = optimizeSeo(fixture, { slug: 'services', origin });
  const { dom, d } = inspect(html);
  try {
    const payload = d.querySelector('script[type="application/ld+json"]').textContent;
    const expected = `sha256-${createHash('sha256').update(payload).digest('base64')}`;
    const duplicate = html.replace('</head>', `<script type="application/ld+json">${payload}</script><script type="application/ld+json" src="/external.json"></script><script>window.ready=true</script></head>`);
    assert.deepEqual(structuredDataHashes(duplicate), [expected]);
    assert.equal(JSON.parse(payload)['@context'], 'https://schema.org');
    assert(!payload.includes('<'));
  } finally { dom.window.close(); }
});
