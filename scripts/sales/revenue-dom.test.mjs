import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { revenueSummary } from '../../sales/revenue.mjs';
import { agreement } from '../../sales/terms.mjs';

test('shipped top-corner earnings card separates zero earned, pending sales, residual and bonus progress and opens discovery', () => {
  const html = readFileSync('deployments/rideshare-tax-pros/.vercel/output/static/sales.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://gigtax.pro/sales', runScripts: 'outside-only' }), w = dom.window, d = w.document, navigated = [];
  try {
    w.fetch = () => { throw new Error('The earnings presentation cannot send requests.'); };
    w.eval(readFileSync('public/rideshare-tax-pros/sales-console.js', 'utf8'));
    const view = w.GigTaxConsole.mount({ onNavigate: name => navigated.push(name) });
    const user = { id: 'agent', name: 'Synthetic agent', role: 'agent', states: ['CT'] };
    const terms = agreement({ business: 'SYNTHETIC', cancellation: 'Synthetic only.', approved: true });
    const revenue = revenueSummary(user, [], [], terms);
    view.render({ user, offices: [], agents: [], revenue });
    const host = d.querySelector('#sales-revenue'); assert(host.closest('.sdr-topbar')); assert.equal(host.hidden, false);
    assert.equal(host.querySelector('.sdr-earnings-label').textContent, 'Your earnings');
    assert.equal(host.querySelector('.sdr-earnings-total').textContent, '$0');
    assert.match(host.textContent, /\$100 per paid signup \+ \$50 per collected month from month 2/);
    assert.equal(host.querySelector('progress').value, 0); assert.equal(host.querySelector('progress').max, 10);
    host.querySelector('details').open = true; view.render({ user, offices: [], agents: [], revenue });
    assert.equal(host.querySelector('details').open, true);
    host.querySelector('.sdr-earnings-action').click(); assert.deepEqual(navigated, ['discover']);
    assert.equal(host.querySelector('details').open, false);
    view.render({ user: { role: 'owner' }, offices: [], revenue: { ...revenue, scope: 'team' } });
    assert.equal(host.querySelector('.sdr-earnings-label').textContent, 'Team earnings');
  } finally { w.close(); }
});
