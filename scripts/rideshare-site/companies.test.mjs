import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { companies, companyRoute } from './companies.mjs';

const root = path.resolve('deployments/rideshare-tax-pros/.vercel/output/static');
const manifest = JSON.parse(readFileSync(path.join(root, 'site-manifest.json'), 'utf8'));
function page(slug, fragment = '', run = true) {
  const dom = new JSDOM(readFileSync(path.join(root, `${slug}.html`), 'utf8'), {
    url: `${manifest.origin}/${slug}${fragment}`, runScripts: 'outside-only',
  });
  if (run) {
    dom.window.fetch = () => { throw new Error('Company tools must not send a request.'); };
    for (const file of ['company-catalog.js', 'inner-pages.js']) dom.window.eval(readFileSync(path.join(root, file), 'utf8'));
  }
  return dom;
}

test('every native launcher company has a published guide, without claiming app integrations', () => {
  const native = readFileSync('native/ios/RideshareTaxPros/App/GigAppCatalog.swift', 'utf8');
  const launchers = [...native.matchAll(/\.init\(id: "([a-z0-9-]+)"/g)].map(match => match[1]);
  const aliases = { 'lyft-driver': 'lyft', 'uber-driver': 'uber', 'doordash-dasher': 'doordash',
    'spark-driver': 'spark', 'instacart-shopper': 'instacart', 'grubhub-driver': 'grubhub',
    'roadie-driver': 'roadie', 'shipt-shopper': 'shipt', 'gopuff-driver': 'gopuff',
    'taskrabbit-tasker': 'taskrabbit', 'wag-caregiver': 'wag', 'favor-runner': 'favor',
    'curri-driver': 'curri', 'goshare-driver': 'goshare', 'veho-driver': 'veho',
    'dispatch-driver': 'dispatch', 'skipcart-driver': 'skipcart' };
  assert.ok(launchers.length >= 19);
  for (const id of launchers) assert.ok(manifest.aliases.includes(companyRoute(aliases[id] || id)), id);
  assert.ok(manifest.aliases.includes(companyRoute('uber-eats')));
});

test('built company pages have unique titles, descriptions, visible guidance, source links and valid breadcrumbs', () => {
  const titles = new Set(), descriptions = new Set(), intros = new Set();
  const sitemap = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  for (const company of companies) {
    const route = companyRoute(company), dom = page(route, '', false), d = dom.window.document;
    try {
      assert.equal(d.querySelectorAll('h1').length, 1);
      assert.ok(d.querySelector('h1').textContent.includes(company.name));
      assert.equal(d.querySelector('link[rel="canonical"]').href, `${manifest.origin}/${route}`);
      titles.add(d.title); descriptions.add(d.querySelector('meta[name="description"]').content);
      intros.add(d.querySelector('.company-intro').textContent);
      assert.equal(d.querySelectorAll('.company-records>li').length, 3);
      assert.equal(d.querySelectorAll('#company-questions details').length, 3);
      assert.ok(d.querySelectorAll('#company-sources a').length >= 2);
      assert.deepEqual([...d.querySelectorAll('.breadcrumbs meta[itemprop="position"]')].map(meta => meta.content), ['1', '2', '3']);
      assert.equal(d.querySelector('.breadcrumbs [aria-current="page"]').href, `${manifest.origin}/${route}`);
      assert.ok(sitemap.includes(`<loc>${manifest.origin}/${route}</loc>`));
      assert.match(d.querySelector('.company-disclosure').textContent, /independent.*not endorsed/i);
      assert.equal(d.querySelector('input[type="password"], input[type="file"], meta[name="keywords"]'), null);
      for (const link of d.querySelectorAll('#company-sources a')) assert.equal(new URL(link.href).protocol, 'https:');
    } finally { dom.window.close(); }
  }
  assert.equal(titles.size, companies.length); assert.equal(descriptions.size, companies.length); assert.equal(intros.size, companies.length);
});

test('company hub is fully linked without JavaScript and filters by work category and search intent', () => {
  const dom = page('gig-companies'), d = dom.window.document;
  try {
    assert.equal(d.querySelectorAll('.company-card').length, companies.length);
    const search = d.querySelector('[data-search-input]'), category = d.querySelector('[data-search-category]');
    search.value = 'DoorDash'; search.dispatchEvent(new dom.window.Event('input'));
    assert.equal([...d.querySelectorAll('.company-card')].filter(card => !card.hidden).length, 1);
    assert.equal(d.querySelector('[data-search-count]').textContent, '1 company found');
    category.value = 'Local services'; category.dispatchEvent(new dom.window.Event('change'));
    assert.equal(d.querySelector('[data-search-empty]').hidden, false);
    d.querySelector('[data-clear-search]').click();
    assert.equal([...d.querySelectorAll('.company-card')].filter(card => !card.hidden).length, companies.length);
    assert.equal(d.activeElement, search);
  } finally { dom.window.close(); }
  const plain = page('gig-companies', '', false);
  try { for (const company of companies) assert.ok(plain.window.document.querySelector(`a[href="/${companyRoute(company)}"]`)); }
  finally { plain.window.close(); }
});

test('company CTA carries a known company into the actual planner and downloaded checklist context', async () => {
  const guide = page(companyRoute('doordash'), '', false);
  const href = new URL(guide.window.document.querySelector('.hero-actions-row a').href);
  guide.window.close();
  const start = page('get-started', href.hash), d = start.window.document;
  let checklist;
  try {
    assert.equal(d.querySelector('#plan-company').value, 'doordash');
    assert.equal(d.querySelector('input[name="need"]:checked').value, 'filing');
    d.querySelector('#plan-year').value = '2025'; d.querySelector('[data-plan]').click();
    assert.match(d.querySelector('#plan-summary').textContent, /DoorDash/);
    const url = new URL(d.querySelector('#plan-checklist').href);
    checklist = page('document-checklist', url.hash);
    assert.match(checklist.window.document.querySelector('#checklist-context').textContent, /DoorDash/);
    let downloaded;
    checklist.window.Blob = Blob;
    checklist.window.URL.createObjectURL = blob => { downloaded = blob; return 'blob:company-checklist'; };
    checklist.window.URL.revokeObjectURL = () => {};
    checklist.window.HTMLAnchorElement.prototype.click = function () {};
    checklist.window.document.querySelector('[data-download]').click();
    assert.match(await downloaded.text(), /DoorDash/);
    assert.equal(start.window.localStorage.length, 0); assert.equal(start.window.sessionStorage.length, 0);
  } finally { start.window.close(); checklist?.window.close(); }
  for (const value of ['__proto__', 'constructor', '<img src=x onerror=alert(1)>']) {
    const invalid = page('get-started', `#company=${encodeURIComponent(value)}`);
    try { assert.equal(invalid.window.document.querySelector('#plan-company').value, ''); }
    finally { invalid.window.close(); }
  }
});
