import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { appPages } from './app-pages.mjs';
import { appFeatures } from './app-features.mjs';
import { appScreens } from './app-screens.mjs';
import { renderPage } from './layout.mjs';
import { featuresPage } from './features-page.mjs';

function hub(script = true) {
  const dom = new JSDOM(renderPage(appPages()[0]), { url: 'https://gigtax.pro/app', runScripts: 'outside-only' });
  if (script) dom.window.eval(readFileSync('public/rideshare-tax-pros/app-tour.js', 'utf8'));
  return dom;
}
test('the app tour works with buttons, selection and keyboard without changing records or contacting services', () => {
  const dom = hub(); const d = dom.window.document;
  try {
    const frames = [...d.querySelectorAll('[data-tour-frame]')];
    const next = d.querySelector('[data-tour-next]'); const previous = d.querySelector('[data-tour-prev]'); const select = d.querySelector('[data-tour-select]');
    const visible = () => frames.filter(frame => !frame.hidden).map(frame => frame.dataset.screenId);
    assert.deepEqual(visible(), ['home']); assert.equal(previous.disabled, true); assert.equal(select.disabled, false);
    next.click(); assert.deepEqual(visible(), ['offers']); assert.equal(previous.disabled, false);
    select.value = 'alerts'; select.dispatchEvent(new dom.window.Event('change'));
    assert.deepEqual(visible(), ['alerts']); assert.equal(next.disabled, true);
    previous.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.deepEqual(visible(), ['home']); assert.equal(d.activeElement, next);
    next.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.deepEqual(visible(), ['alerts']); assert.equal(d.activeElement, previous);
    previous.click(); assert.deepEqual(visible(), ['job-status']);
    assert.match(d.querySelector('[data-tour-status]').textContent, /4 of 5/);
    assert.equal(dom.window.localStorage.length, 0); assert.equal(dom.window.sessionStorage.length, 0);
  } finally { dom.window.close(); }
});
test('every real screenshot and caption is available without JavaScript and matches reviewed provenance', () => {
  const dom = hub(false);
  const provenance = JSON.parse(readFileSync('docs/deployments/gig-tax-pros-app-screens-20261107.json', 'utf8'));
  try {
    for (const frame of dom.window.document.querySelectorAll('[data-tour-frame]')) assert.equal(frame.hidden, false);
    assert.equal(dom.window.document.querySelector('[data-tour-select]').disabled, true);
    for (const screen of appScreens) {
      const bytes = readFileSync(`public/rideshare-tax-pros${screen.src}`);
      assert.equal(bytes.readUInt32BE(16), screen.width); assert.equal(bytes.readUInt32BE(20), screen.height);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.screens.find(item => item.id === screen.id).sha256);
      assert.equal(dom.window.document.querySelector(`[data-screen-id="${screen.id}"] img`).getAttribute('alt'), screen.alt);
    }
  } finally { dom.window.close(); }
});
test('feature search reaches detailed guides and can recover from no matches', () => {
  const dom = hub(); const d = dom.window.document;
  try {
    dom.window.eval(readFileSync('public/rideshare-tax-pros/inner-pages.js', 'utf8'));
    const search = d.querySelector('[data-search-input]'); const cards = [...d.querySelectorAll('[data-search-card]')];
    search.value = 'five-star'; search.dispatchEvent(new dom.window.Event('input'));
    assert.deepEqual(cards.filter(card => !card.hidden).map(card => card.dataset.featureId), ['coach']);
    search.value = 'no such feature 123'; search.dispatchEvent(new dom.window.Event('input'));
    assert.equal(d.querySelector('[data-search-empty]').hidden, false);
    d.querySelector('[data-clear-search]').click();
    assert.equal(cards.filter(card => !card.hidden).length, appFeatures.length); assert.equal(d.activeElement, search);
    for (const feature of appFeatures) {
      const page = appPages().find(item => item.slug === `app/${feature.id}`);
      assert.ok(page); assert.equal(feature.steps.length, 4);
      for (const item of feature.features) assert.ok(page.body.includes(item.text.replaceAll('&', '&amp;').replaceAll("'", '&#39;')));
    }
    for (const screen of appScreens) assert.ok(existsSync(`public/rideshare-tax-pros${screen.src}`));
  } finally { dom.window.close(); }
});

test('the Features page explains every feature inline without requiring scripts or opening a guide', () => {
  const dom = new JSDOM(renderPage(featuresPage())); const d = dom.window.document;
  try {
    assert.equal(d.querySelector('h1').textContent, 'App features, explained.');
    assert.equal(d.querySelectorAll('[data-feature-group]').length, 8);
    assert.equal(d.querySelectorAll('[data-feature-entry]').length, 61);
    for (const entry of d.querySelectorAll('[data-feature-entry]')) {
      assert.equal(entry.hidden, false);
      assert.ok(entry.querySelector('h3').textContent.length > 5);
      assert.match(entry.textContent, /What it does/); assert.match(entry.textContent, /Why it helps you/);
    }
    for (const group of d.querySelectorAll('[data-feature-group]')) {
      assert.equal(group.querySelectorAll('.feature-explanation ol li').length, 4);
      assert.match(group.textContent, /Where to find it/); assert.match(group.textContent, /A working-day example/);
    }
    for (const link of d.querySelectorAll('.features-index nav a')) assert.ok(d.getElementById(link.hash.slice(1)));
    assert.equal(d.querySelector('.features-search').hidden, true);
    assert.equal(d.querySelector('.desktop-links a').getAttribute('href'), '/features');
  } finally { dom.window.close(); }
});

test('individual feature search hides empty topics and topic navigation restores the full explanations', () => {
  const dom = new JSDOM(renderPage(featuresPage()), { url: 'https://gigtax.pro/features', runScripts: 'outside-only' }); const d = dom.window.document;
  try {
    dom.window.eval(readFileSync('public/rideshare-tax-pros/features.js', 'utf8'));
    const query = d.querySelector('[data-feature-query]');
    const visibleEntries = () => [...d.querySelectorAll('[data-feature-entry]')].filter(entry => !entry.hidden);
    const visibleGroups = () => [...d.querySelectorAll('[data-feature-group]')].filter(group => !group.hidden);
    const search = value => { query.value = value; query.dispatchEvent(new dom.window.Event('input')); };
    assert.equal(d.querySelector('.features-search').hidden, false);
    search('twenty-three'); assert.equal(visibleEntries().length, 1); assert.deepEqual(visibleGroups().map(group => group.id), ['money']);
    search('unfindable test 123'); assert.equal(visibleGroups().length, 0); assert.equal(d.querySelector('[data-feature-empty]').hidden, false);
    d.querySelector('[data-feature-clear]').click(); assert.equal(visibleEntries().length, 61); assert.equal(d.activeElement, query);
    search('receipt'); assert.ok(visibleEntries().length < 61);
    d.querySelector('.features-index a[href="#routes"]').click(); assert.equal(query.value, ''); assert.equal(visibleEntries().length, 61);
    assert.equal(visibleGroups().length, 8); assert.equal(dom.window.localStorage.length, 0);
  } finally { dom.window.close(); }
});
