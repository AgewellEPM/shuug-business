import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../../public/rideshare-tax-pros/territory-ownership.js', import.meta.url), 'utf8');

async function until(check) {
  for (let i = 0; i < 120 && !check(); i++) await delay(10);
  assert.ok(check(), 'The territory ownership result did not render');
}

test('territory lookup shows current county leads, other reps’ facility assignments, and empty results', async t => {
  const { window } = new JSDOM('<section><input type="search" data-territory-lookup><div data-territory-matches hidden></div></section>',
    { runScripts: 'outside-only' });
  t.after(() => window.close());
  window.eval(script);
  const panel = window.document.querySelector('section');
  const field = panel.querySelector('input'), results = panel.querySelector('[data-territory-matches]');
  const county = { id:'45027', label:'Clarendon County', lead:{ name:'Former Lead', revision:1 } };
  const second = { id:'45029', label:'Colleton County', lead:{ name:'', revision:1 } };
  let picked, refreshed = 0;
  const api = async (action, params) => {
    assert.equal(action, 'territory-ownership');
    assert.equal(params.state, 'SC');
    if (params.query === 'Manning') {
      assert.deepEqual(Array.from(params.countyIds), [county.id]);
      return { counties:[{ id:county.id, lead:{name:'Current Lead', revision:2}, canEdit:true }], matches:[
        {name:'Manning Residence', address:'16 Main Street', city:'Manning', state:'SC', assignee:'Facility Rep', status:'assigned'},
        {name:'Manning Care', city:'Manning', state:'SC', assignee:'', status:'unassigned'}
      ], hasMore:false };
    }
    return { counties:[], matches:[], hasMore:false };
  };
  const ui = window.SdrTerritoryOwnership.mount(panel, {state:'SC', counties:[county,second], features:[
    { name:'Manning', id:'4544350', counties:[county.id] }
  ]}, api, place => { picked = place; }, () => { refreshed++; });
  const search = value => {
    field.value = value;
    field.dispatchEvent(new window.Event('input'));
  };
  search('Manning');
  await until(() => results.textContent.includes('Facility Rep'));
  assert.match(results.textContent, /Clarendon CountyAssigned to Current Lead/);
  assert.match(results.textContent, /Manning Residence16 Main Street · Manning, SCAssigned to Facility Rep/);
  assert.match(results.textContent, /Manning CareManning, SCUnassigned facility/);
  assert.doesNotMatch(results.textContent, /Former Lead/);
  assert.equal(refreshed, 1);
  results.querySelector('button').click();
  assert.equal(picked.feature.id, '4544350');
  search('Colleton');
  await until(() => results.textContent.includes('Available'));
  assert.match(results.textContent, /Available · no county lead/);
  search('missing name');
  await until(() => results.textContent.includes('No matching town, county, or saved facility'));
  assert.doesNotMatch(results.textContent, /Available/);
  search('');
  assert.ok(results.hidden);
  ui.dispose();
});
