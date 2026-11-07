import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

const output = 'deployments/rideshare-tax-pros/.vercel/output/static';
const html = readFileSync(`${output}/how-it-works.html`, 'utf8');
function page() { return new JSDOM(html, { url: 'https://gigtax.pro/how-it-works', runScripts: 'outside-only' }); }

test('How it works contains every explanation and real app images directly on the requested route', () => {
  const dom = page(); const d = dom.window.document;
  try {
    assert.equal(d.querySelector('link[rel=canonical]').href, 'https://gigtax.pro/how-it-works');
    assert.equal(d.querySelectorAll('h1').length, 1); assert.equal(d.querySelector('h1').textContent, 'How the app works.');
    assert.equal(d.querySelectorAll('[data-feature-entry]').length, 61);
    assert.equal(d.querySelectorAll('[data-feature-group]').length, 8);
    for (const entry of d.querySelectorAll('[data-feature-entry]')) {
      assert.equal(entry.hidden, false); assert.match(entry.textContent, /What it does/); assert.match(entry.textContent, /Why it helps you/);
    }
    for (const group of d.querySelectorAll('[data-feature-group]')) assert.equal(group.querySelectorAll('.feature-explanation ol li').length, 4);
    const provenance = JSON.parse(readFileSync('docs/deployments/gig-tax-pros-app-screens-20261107.json','utf8'));
    assert.equal(d.querySelectorAll('#app-images img').length, 5);
    for (const img of d.querySelectorAll('main img')) {
      const asset = img.getAttribute('src'); const bytes = readFileSync(`public/rideshare-tax-pros${asset}`);
      const proof = provenance.screens.find(screen => screen.asset.endsWith(asset));
      assert.ok(proof); assert.equal(createHash('sha256').update(bytes).digest('hex'), proof.sha256);
      assert.equal(bytes.readUInt32BE(16), Number(img.getAttribute('width'))); assert.equal(bytes.readUInt32BE(20), Number(img.getAttribute('height')));
      assert.ok(img.getAttribute('alt').length > 20);
    }
    const routes = JSON.parse(readFileSync(`${output}/site-manifest.json`,'utf8')).aliases;
    for (const a of d.querySelectorAll('main a[href]')) {
      const url = new URL(a.href);
      if (url.pathname === '/how-it-works' && url.hash) assert.ok(d.getElementById(url.hash.slice(1)));
      else if (url.origin === dom.window.location.origin) assert.ok(url.pathname === '/' || routes.includes(url.pathname.slice(1)) || url.pathname.startsWith('/assets/'));
    }
    assert.equal(d.querySelector('.features-search').hidden, true);
  } finally { dom.window.close(); }
});

test('feature search filters individual explanations and topic navigation restores them before jumping', () => {
  const dom = page(); const d = dom.window.document;
  try {
    dom.window.eval(readFileSync(`${output}/features.js`, 'utf8'));
    const query = d.querySelector('[data-feature-query]');
    const visible = selector => [...d.querySelectorAll(selector)].filter(item => !item.hidden);
    function search(value) { query.value = value; query.dispatchEvent(new dom.window.Event('input')); }
    assert.equal(d.querySelector('.features-search').hidden, false);
    search('twenty-three'); assert.equal(visible('[data-feature-entry]').length, 1); assert.deepEqual(visible('[data-feature-group]').map(item => item.id), ['money']);
    search('no such feature 123'); assert.equal(visible('[data-feature-group]').length, 0); assert.equal(d.querySelector('[data-feature-empty]').hidden, false);
    d.querySelector('[data-feature-clear]').click(); assert.equal(visible('[data-feature-entry]').length, 61); assert.equal(d.activeElement, query);
    search('receipt'); d.querySelector('.features-index a[href="#offers"]').click();
    assert.equal(query.value, ''); assert.equal(visible('[data-feature-group]').length, 8); assert.equal(visible('[data-feature-entry]').length, 61);
    assert.equal(dom.window.localStorage.length, 0);
  } finally { dom.window.close(); }
});
