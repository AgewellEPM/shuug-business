import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { renderCertification } from '../rideshare-site/sales-certification.mjs';
import { trainingTools } from '../../sales/training-progress.mjs';

test('certification shows real completion and adds the unfinished core courses to My Plan', async t => {
  const script = new URL('../../public/rideshare-tax-pros/sales-certification.js', import.meta.url);
  const dom = new JSDOM(renderCertification(() => ''), { url: 'http://127.0.0.1/sales#view=certification', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom, find = selector => window.document.querySelector(selector);
  find('.sdr-certification').hidden = false;
  let saved = { completed: { 'sales-onboarding': '2026-11-12T12:00:00Z' }, plan: ['aging-and-dementia'] }, reloads = 0;
  const training = trainingTools({
    trainingProgress: () => structuredClone(saved),
    updateTrainingProgress: (_id, update) => (saved = update(structuredClone(saved))),
  });
  window.eval(readFileSync(script, 'utf8'));
  const app = window.SdrCertification.mount({ api: (action, body) => training({ id: 'owner', role: 'owner' }, action, body),
    onPlanSaved: () => { reloads++; } });
  await app.show();
  assert.equal(find('[data-cert-paths] progress').value, 1);
  assert.equal(window.document.querySelectorAll('[data-cert-awards] [data-earned="true"]').length, 0);
  app.renderEarnings({ earnings: { totalCents: 12345, count: 1 } });
  assert.equal(find('[data-cert-earnings] dd').textContent, '$123.45');
  const search = find('[data-cert-search] input');
  search.value = 'commission';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(find('[data-cert-result="earnings"]').hidden, false);
  assert.ok(find('[data-cert-result="training"]').hidden);
  await app.show('apply');
  find('[data-cert-enroll]').click();
  await setImmediate();
  assert.equal(reloads, 1);
  assert.equal(window.location.hash, '#view=training&course=qualify-directory-prospects');
  assert.equal(saved.plan.length, 7);
  assert.ok(saved.plan.includes('aging-and-dementia'));
  assert.ok(!saved.plan.includes('sales-onboarding'));
});
