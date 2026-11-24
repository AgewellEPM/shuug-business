import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { renderSalesCoach } from '../rideshare-site/sales-coach.mjs';

const script = readFileSync(new URL('../../public/rideshare-tax-pros/sales-coach.js', import.meta.url), 'utf8');

test('opening and minimizing the coach preserves the underlying screen and navigation runs once', async t => {
  const dom = new JSDOM('<main id="sales-workspace"><section id="work"></section>' + renderSalesCoach(() => '') + '</main>', {
    url: 'https://workspace.example/sales#view=today', runScripts: 'outside-only',
  });
  const w = dom.window, el = selector => w.document.querySelector(selector);
  t.after(() => w.close());
  w.eval(script);
  let here = { view: 'today', label: 'Today’s Plan' }, navigations = 0;
  const turns = [], saved = { turns, next: [], calendar: {}, goal: null };
  const api = async (action, data) => {
    if (action === 'coach-state') return { ...saved, turns: [...turns] };
    assert.equal(data.screen.view, 'today');
    const turn = { id: 1, question: data.question, answer: 'Here is Pipeline.', mode: 'workflow',
      sources: [], navigation: { title: 'Pipeline', href: '#view=pipeline' } };
    turns.push(turn); return { turn };
  };
  const coach = w.SdrCoach.mount({ api, context: () => here, navigate(href) {
    ++navigations; assert.equal(href, '#view=pipeline'); here = { view: 'pipeline', label: 'Pipeline' }; w.location.hash = href;
  } });
  coach.view({ id: 'staff1' });
  assert.equal(el('[data-tab-panel="coach"]'), null); assert.equal(el('#coach-popup').hidden, true);
  el('#coach-launch').click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.location.hash, '#view=today'); assert.equal(el('#coach-popup').hidden, false);
  const composer = el('#coach-form');
  composer.elements.question.value = 'Open my pipeline';
  composer.requestSubmit(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(navigations, 1); assert.equal(el('#coach-context').textContent, 'Pipeline'); assert.equal(el('#coach-popup').hidden, false);
  el('#coach-show-goal').click(); assert.equal(el('#coach-side').hidden, false);
  el('#coach-minimize').click(); assert.equal(w.location.hash, '#view=pipeline'); assert.equal(el('#coach-launch').hidden, false);
  el('#coach-launch').click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(navigations, 1);
  coach.reset(); assert.equal(el('#coach-widget').hidden, true); assert.equal(el('#coach-messages').children.length, 0);
});
