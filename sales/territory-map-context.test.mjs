import assert from 'node:assert/strict';
import { test } from 'node:test';
import { territoryGeometry, territoryMap } from './territory-map.mjs';

test('Georgia’s surrounding states use the same projection as its clickable map', async () => {
  const user = { role: 'agent', id: '7', territory: { version: 1, areas: [{ state: 'GA', cities: ['atlanta'] }] } };
  const ga = await territoryMap(user, { state: 'GA' });
  for (const code of ['AL', 'TN', 'NC', 'SC', 'FL']) {
    const backdrop = ga.context.find(entry => entry.state === code);
    assert.ok(backdrop.path.startsWith('M') && backdrop.anchors.length);
    assert.deepEqual(Object.keys(backdrop).sort(), ['anchors','name','offset','path','scale','state']);
    const other = await territoryGeometry(code);
    assert.ok(Math.abs(ga.origin[0] + backdrop.offset[0] * ga.metersPerUnit - other.origin[0]) < .1);
    assert.ok(Math.abs(ga.origin[1] - backdrop.offset[1] * ga.metersPerUnit - other.origin[1]) < .1);
    assert.ok(Math.abs(ga.metersPerUnit * backdrop.scale - other.metersPerUnit) < .001);
  }
  assert.ok(!ga.context.some(entry => entry.state === 'GA'));
  assert.ok(ga.features.length && ga.features.every(feature => feature.name === 'Atlanta'));
  await assert.rejects(territoryMap(user, { state: 'AL' }), { status: 403 });
  const owner = { role: 'owner' };
  assert.deepEqual((await territoryMap(owner, { state: 'DC' })).context.map(entry => entry.state), ['MD', 'VA']);
  for (const state of ['AK', 'HI']) assert.deepEqual((await territoryMap(owner, { state })).context, []);
});
