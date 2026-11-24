import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sqliteStore } from '../scripts/sdr-export/sqlite.mjs';
import { createHandler } from './handler.mjs';
import { digest } from './model.mjs';
import { territoryOwnership } from './territory-facility-ownership.mjs';

const origin = 'http://127.0.0.1:8740';
const ownerCode = 'fixture-owner-code';
const agentCode = 'fixture-agent-code';
const agentEmail = 'searching-rep@example.test';

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'sdr-facility-ownership-'));
  const db = sqliteStore(join(folder, 'sdr.sqlite'));
  t.after(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });
  const otherRep = db.create('agents', { status: 'active', contact_name: 'Another Rep',
    contact_email: 'other-rep@example.test', notes: JSON.stringify({ states: ['CT'], codeHash: digest('other-code') }) });
  db.create('agents', { status: 'active', contact_name: 'Searching Rep', contact_email: agentEmail,
    notes: JSON.stringify({ codeHash: digest(agentCode), territory: { version: 1, areas: [{ state: 'CT', cities: ['hartford'] }] } }) });
  const app = createHandler({ GIGTAX_SALES_ORIGIN: origin, GIGTAX_SALES_OWNER_HASH: digest(ownerCode),
    GIGTAX_SALES_SESSION_KEY: digest('fixture-secret') }, db,
  { localHttp: true, salesTeam: true, territoryOwnership: (user, input, team) => territoryOwnership(user, input, db, team) });

  function session() {
    let cookie;
    return async (action, body = {}, expected = 200) => {
      const headers = { origin, 'content-type': 'application/json', cookie };
      const response = { statusCode: 200, setHeader(name, value) {
        if (name === 'Set-Cookie') cookie = value.split(';')[0];
      }, end(body) { this.json = JSON.parse(body); } };
      await app({ method: 'POST', headers, body: { action, ...body } }, response);
      assert.equal(response.statusCode, expected, response.json?.error);
      return response.json;
    };
  }
  function office({ name = 'Cedar Nursing Home', city = 'Hartford', state = 'CT', address = '10 Main St',
    assignedTo = String(otherRep.id), info = { facilityType: 'nursing-home' } } = {}) {
    return db.create('offices', { town: name, locality: city, state, assigned_to: assignedTo, status: 'new',
      contact_name: 'Private contact', contact_email: 'private@example.test', contact_phone: '555-0100',
      notes: JSON.stringify({ address, postalCode: '06103', secretNote: 'private notes', ...info }) });
  }
  return { db, session, office };
}

test('facility lookup shows other reps in scope while full CRM access stays scoped to the assignee', async t => {
  const f = fixture(t);
  const assigned = f.office();
  f.office({ city: 'New Haven', address: '22 Main St' });
  f.office({ city: 'Springfield', state: 'MA', address: '31 Main St' });
  f.office({ address: '42 Main St', assignedTo: null });
  f.office({ address: '53 Main St', assignedTo: 'owner' });
  f.office({ address: '64 Main St', assignedTo: '999999' });
  f.office({ name: 'Cedar Gifts', address: '75 Main St', info: {} });
  const agent = f.session(), owner = f.session();
  const input = { state: 'CT', query: 'Cedar' };
  await agent('territory-ownership', input, 401);
  await agent('login', { email: agentEmail, code: agentCode });
  const found = await agent('territory-ownership', input);
  assert.deepEqual(found, { matches: [
    { name: 'Cedar Nursing Home', city: 'Hartford', address: '10 Main St', state: 'CT', assignee: 'Another Rep', status: 'assigned' },
    { name: 'Cedar Nursing Home', city: 'Hartford', address: '42 Main St', state: 'CT', assignee: '', status: 'unassigned' },
    { name: 'Cedar Nursing Home', city: 'Hartford', address: '53 Main St', state: 'CT', assignee: 'Workspace owner', status: 'assigned' },
    { name: 'Cedar Nursing Home', city: 'Hartford', address: '64 Main St', state: 'CT', assignee: 'Unknown rep', status: 'assigned' },
  ], hasMore: false, counties: [] });
  await agent('office', { id: assigned.id }, 404);
  await agent('territory-ownership', { state: 'MA', query: 'Cedar' }, 403);
  assert.deepEqual(await agent('territory-ownership', { query: 'Cedar' }), found);
  assert.deepEqual(await agent('territory-ownership', { state: 'CT', query: '10 Main Street Hartford' }),
    { matches: [found.matches[0]], hasMore: false, counties: [] });
  assert.deepEqual(await agent('territory-ownership', { state: 'CT', query: '33 Main Street' }), { matches: [], hasMore: false, counties: [] });
  await owner('login', { code: ownerCode });
  assert.equal((await owner('territory-ownership', input)).matches.length, 5);
  assert.equal((await owner('territory-ownership', { query: 'Cedar' })).matches.length, 6);
});

test('facility lookup recognizes older saved facility metadata and caps broad searches', async t => {
  const f = fixture(t);
  for (let n = 1; n <= 14; n++) f.office({ name: 'Older Skilled Nursing', address: n + ' Plaza', info: {} });
  f.office({ name: 'Maple Campus', info: { source: 'https://data.cms.gov/provider-data/dataset/4pq5-n9py?conditions%5B0%5D=example' } });
  f.office({ name: 'Greenwood Hall', info: { facilitySource: 'https://www.openstreetmap.org/way/123' } });
  const owner = f.session();
  await owner('login', { code: ownerCode });
  const reports = await owner('territory-ownership', { state: 'CT', query: 'skilled nursing' });
  assert.equal(reports.matches.length, 12);
  assert.equal(reports.hasMore, true);
  assert.equal((await owner('territory-ownership', { state: 'CT', query: 'Maple Campus' })).matches.length, 1);
  assert.equal((await owner('territory-ownership', { state: 'CT', query: 'Greenwood Hall' })).matches.length, 1);
  await owner('territory-ownership', { state: 'XX', query: 'Cedar' }, 400);
  await owner('territory-ownership', { state: 'CT', query: 'x'.repeat(181) }, 400);
  assert.deepEqual(await owner('territory-ownership', { state: 'CT', query: ' ' }), { matches: [], hasMore: false, counties: [] });
});

test('combined ownership lookup returns saved county leads and validates the county list', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('login', { code: ownerCode });
  const lead = f.db.saveCountyLead('09110', 0, { name: 'County Lead', photo: '' });
  const county = { id: '09110', lead, canEdit: true };
  assert.deepEqual(await owner('territory-ownership', { state: 'CT', countyIds: ['09110'] }),
    { matches: [], hasMore: false, counties: [county] });
  await owner('territory-ownership', { state: 'CT', countyIds: '09110' }, 400);
  await owner('territory-ownership', { state: 'CT', countyIds: null }, 400);
  await owner('territory-ownership', { state: 'CT', countyIds: Array(17).fill('09110') }, 400);
});
