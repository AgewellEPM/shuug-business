import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sqliteStore } from '../scripts/sdr-export/sqlite.mjs';
import { metadata } from './model.mjs';
import { service } from './service.mjs';
import { stateFacilityDirectory } from './state-facilities.mjs';

const owner = { id: 'owner', role: 'owner', name: 'Fixture owner' };
const agent = { id: '12', role: 'agent', name: 'Fixture agent',
  territory: { version: 1, areas: [{ state: 'CT', cities: ['hartford'] }] } };
const center = { state: 'CT', name: 'Fixture Senior Center', city: 'Hartford', address: '', zip: '06103',
  email: '', phone: '860-555-0100', sourceURL: 'https://www.openstreetmap.org/node/1234' };
const home = { ...center, name: 'Fixture Nursing Home', address: '12 Fixture Street', sourceURL: 'https://example.org/provider/1234' };

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'sdr-facility-save-'));
  const db = sqliteStore(join(folder, 'sdr.sqlite'));
  t.after(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });
  const facilities = stateFacilityDirectory({ db, load: async ({ category }) => ({
    results: category === 'nursing-home' ? [home] : [center, { ...center, city: '', sourceURL: 'https://www.openstreetmap.org/node/5678' }],
  }) });
  return service({}, db, undefined, { facilities });
}

test('facility directory saves reviewed missing fields, deduplicates simultaneous saves, and honors territory and assignment', async t => {
  const app = fixture(t);
  const input = { state: 'CT', category: 'senior-center', sourceURL: center.sourceURL, address: '10 Fixture Lane', city: 'Other City', name: 'Override attempt' };
  await assert.rejects(app.dispatch(agent, 'territory-facility-save', { ...input, sourceURL: 'https://www.openstreetmap.org/node/5678' }), { status: 404 });
  await assert.rejects(app.dispatch(agent, 'territory-facility-save', { ...input, state: 'MA' }), { status: 403 });
  await assert.rejects(app.dispatch(agent, 'territory-facility-save', { ...input, address: '' }), { status: 400 });
  const [a, b] = await Promise.all([app.dispatch(agent, 'territory-facility-save', input), app.dispatch(agent, 'territory-facility-save', input)]);
  assert.equal(a.office.id, b.office.id);
  assert.equal(Number(Boolean(a.duplicate)) + Number(Boolean(b.duplicate)), 1);
  assert.equal(a.office.town, center.name);
  assert.equal(a.office.locality, center.city);
  assert.equal(a.office.assigned_to, agent.id);
  assert.deepEqual([metadata(a.office).facilityType, metadata(a.office).address, metadata(a.office).facilitySource],
    ['senior-center', '10 Fixture Lane', center.sourceURL]);
  const browse = user => app.dispatch(user, 'territory-facilities', { state: 'CT', category: 'senior-center' });
  assert.equal((await browse(agent)).results[0].savedOfficeId, a.office.id);
  const colleague = { ...agent, id: '13' };
  assert.equal((await browse(colleague)).results[0].savedOfficeId, undefined);
  await assert.rejects(app.dispatch(colleague, 'territory-facility-save', { ...input, address: 'Different transcription' }), { status: 409 });
  assert.equal((await app.dispatch(owner, 'pipeline')).offices.length, 1);
});

test('saving an existing office from the directory classifies it and keeps its contact history and assignment', async t => {
  const app = fixture(t);
  const existing = await app.dispatch(owner, 'create-office', { ...home, contact: 'Existing director' });
  await app.dispatch(owner, 'activity', { id: existing.office.id, kind: 'call', note: 'Follow up next week.' });
  const result = await app.dispatch(owner, 'territory-facility-save', { category: 'nursing-home', state: 'CT', sourceURL: home.sourceURL });
  assert.equal(result.duplicate, true);
  assert.equal(result.office.id, existing.office.id);
  assert.equal(result.office.contact_name, 'Existing director');
  assert.equal(metadata(result.office).facilityType, 'nursing-home');
  const { office } = await app.dispatch(owner, 'update-office', { id: result.office.id, nextFollowup: '2027-01-10' });
  assert.equal(metadata(office).facilityType, 'nursing-home');
  const detail = await app.dispatch(owner, 'office', { id: office.id });
  assert.ok(detail.events.some(event => metadata(event).action === 'call'));
  await assert.rejects(app.dispatch(owner, 'update-office', { id: office.id, facilityType: 'anything' }), { status: 400 });
  const cleared = await app.dispatch(owner, 'update-office', { id: office.id, facilityType: '' });
  assert.equal(metadata(cleared.office).facilityType, '');
});
