import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { renderMonthlyPrizes } from '../rideshare-site/sales-prizes.mjs';
import { monthlyPrizes } from './monthly-prizes.mjs';

const enrollment = (leadId, agentId, acceptedAt, signature = 'Signed') => ({
  notes: JSON.stringify({ leadId, agentId, acceptedAt, signature }),
});
const demo = (id, host, start, status = 'confirmed', type = 'demo') => ({ id, host, start: Date.parse(start), status, type });
const month = '2026-11';
const rep = { id: 'rep-a', role: 'agent' };
const owner = { id: 'owner', role: 'owner' };
const db = {
  list(collection) {
    if (collection === 'agents') return [{ id: 'rep-a' }, { id: 'rep-b' }];
    return [
      enrollment('old-location', 'rep-a', '2026-11-01T03:30:00Z'),
      enrollment('old-location', 'rep-a', '2026-11-15T18:00:00Z'),
      enrollment('new-a', 'rep-a', '2026-11-01T04:30:00Z'),
      enrollment('new-b', 'rep-a', '2026-11-11T04:30:00Z'),
      enrollment('new-c', 'rep-a', '2026-11-11T05:30:00Z'),
      enrollment('new-c', 'rep-b', '2026-11-23T14:00:00Z'),
      enrollment('new-d', 'rep-b', '2026-11-23T14:00:00Z'),
      enrollment('unsigned', 'rep-a', '2026-11-06T14:00:00Z', ''),
    ];
  },
  booking: {
    range(host, start, end) {
      return [
        demo('local-november', 'rep-a', '2026-12-01T04:30:00Z'),
        demo('local-december', 'rep-a', '2026-12-01T05:30:00Z'),
        demo('cancelled', 'rep-a', '2026-11-14T14:00:00Z', 'cancelled'),
        demo('appointment', 'rep-a', '2026-11-14T14:00:00Z', 'confirmed', 'appointment'),
        demo('other-rep', 'rep-b', '2026-11-24T14:00:00Z'),
      ].filter(row => row.host === host && row.start >= start && row.start < end);
    },
  },
};
const get = monthlyPrizes(db, { now: () => Date.parse('2026-11-24T15:00:00Z') });

test('counts a location on its first signed agreement and respects the rep and calendar boundaries', async () => {
  assert.deepEqual(await get(rep, { month }), { month, currentMonth: month, scope: 'rep', signedLocations: 3, signedBy10th: 2, confirmedDemos: 1 });
  assert.deepEqual(await get(owner, { month }), { month, currentMonth: month, scope: 'team', signedLocations: 4, signedBy10th: 2, confirmedDemos: 2 });
  await assert.rejects(get(rep, { month: '2026-13' }), { status: 400 });
  await assert.rejects(get({ id: 'location', role: 'location' }, { month }), { status: 403 });
});

test('the prize page shows recorded progress and filters by prize item', async t => {
  const dom = new JSDOM(renderMonthlyPrizes(() => ''), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom, find = selector => window.document.querySelector(selector);
  window.eval(readFileSync(new URL('../../public/rideshare-tax-pros/sales-prizes.js', import.meta.url), 'utf8'));
  const view = window.SdrMonthlyPrizes.mount({ api: (action, input) => {
    assert.equal(action, 'monthly-prizes-read');
    return get(rep, input);
  } });
  await view.show();
  assert.equal(find('[data-prize-count="signedLocations"]').textContent, '3 / 10');
  assert.equal(find('[data-prize-count="confirmedDemos"]').textContent, '1 / 20');
  assert.equal(find('[data-prize-early]').textContent, '2 signed by the 10th');
  const search = find('[data-prize-search] input');
  search.value = 'air m4';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.deepEqual([...window.document.querySelectorAll('[data-prize-row]:not([hidden])')].map(row => row.dataset.prizeRow), ['grand']);
});
