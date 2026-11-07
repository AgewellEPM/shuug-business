import { test } from 'node:test';
import assert from 'node:assert/strict';
import { service } from './service.mjs';
import { publicDirectory, listingInput, supportInput } from './directory.mjs';
import { createDirectoryHandler } from './directory-handler.mjs';
import { agreement } from './terms.mjs';

const owner = { id: 'owner', name: 'Owner', role: 'owner', states: [] };
const listing = { enabled: true, name: 'Synthetic Public Office', address: '123 Example Way', city: 'Hartford', state: 'CT', postalCode: '06103',
  latitude: 41.7658, longitude: -72.6734, phone: '+1 203 555 0100', hours: 'Mon–Fri 9–5 Eastern', appointmentURL: 'https://example.test/book',
  available24x7: false, coverageConfirmed: false, publicDetailsConfirmed: true };
function fixture() {
  let id = 0, support = null;
  const rows = { offices: [], enrollments: [], agents: [], events: [] };
  const db = { list: async kind => structuredClone(rows[kind]), get: async (kind, id) => structuredClone(rows[kind].find(r => String(r.id) === String(id))),
    create: async (kind, body) => { const row = { ...structuredClone(body), id: ++id }; rows[kind].push(row); return structuredClone(row); },
    patch: async (kind, id, body) => { const row = rows[kind].find(r => String(r.id) === String(id)); Object.assign(row, structuredClone(body)); return structuredClone(row); },
    terms: async () => agreement({ business: 'Synthetic Test', cancellation: 'Synthetic terms', approved: true }),
    support: async () => structuredClone(support), setSupport: async value => { support = structuredClone(value); } };
  const app = service({ GIGTAX_SALES_SESSION_KEY: 'a'.repeat(64), GIGTAX_SALES_ORIGIN: 'https://gigtax.pro' }, db,
    { configured: () => true, create: async () => ({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }), verify: async () => ({ live: true, checkoutId: 'cs_test' }) });
  return { app, db, rows };
}
async function prepared(f) {
  const { office } = await f.app.dispatch(owner, 'create-office', { ...listing, contact: 'Private Owner', email: 'private-owner@example.test', independence: 'independent' });
  await f.app.dispatch(owner, 'save-office-listing', { id: office.id, ...listing });
  return office;
}
test('approved listing appears only after real-mode enrollment verification; edits and removal are dynamic', async () => {
  const f = fixture(), office = await prepared(f);
  assert.equal((await publicDirectory(f.db)).offices.length, 0);
  const invite = await f.app.dispatch(owner, 'invite', { id: office.id, email: 'private-owner@example.test', ownerName: 'Private Owner' });
  const body = Object.fromEntries(new URLSearchParams(new URL(invite.link).hash.slice(1)));
  const view = await f.app.signup('view', body);
  await f.app.signup('accept', { ...body, signature: 'Private Owner', email: view.email, accepted: true, independent: true, authorized: true, termsHash: view.terms.hash });
  assert.equal((await publicDirectory(f.db)).offices.length, 0, 'Pending payment must not create an office pin.');
  await f.app.signup('confirm', body);
  const directory = await publicDirectory(f.db);
  assert.equal(directory.offices.length, 1); assert.equal(directory.offices[0].name, listing.name);
  assert.deepEqual(Object.keys(directory.offices[0]).sort(), ['id','name','address','city','state','postalCode','latitude','longitude','phone','hours','available24x7','appointmentURL','exteriorImageURL'].sort());
  assert(!JSON.stringify(directory).includes('Private Owner')); assert(!JSON.stringify(directory).includes('private-owner'));
  await f.app.dispatch(owner, 'save-office-listing', { id: office.id, ...listing, name: 'Updated Public Name', phone: '+1 203 555 0101', exteriorImageURL: 'https://example.test/office.jpg' });
  assert.equal((await publicDirectory(f.db)).offices[0].phone, '+1 203 555 0101');
  assert.equal((await publicDirectory(f.db)).offices[0].exteriorImageURL, 'https://example.test/office.jpg');
  await f.app.dispatch(owner, 'save-office-listing', { id: office.id, enabled: false });
  assert.equal((await publicDirectory(f.db)).offices.length, 0);
  assert.equal(JSON.parse((await f.db.get('offices', office.id)).notes).publicListing.name, 'Updated Public Name');
});
test('neither forged active stage nor unapproved listing or sandbox payment exposes a prospect', async () => {
  const f = fixture(), office = await prepared(f);
  await f.db.patch('offices', office.id, { status: 'active' });
  assert.equal((await publicDirectory(f.db)).offices.length, 0);
  await f.db.create('enrollments', { status: 'active', notes: JSON.stringify({ leadId: office.id, acceptedAt: '2026-11-07', signature: 'Synthetic', payment: { live: false } }) });
  assert.equal((await publicDirectory(f.db)).offices.length, 0);
  assert.throws(() => listingInput({ ...listing, publicDetailsConfirmed: false }), /Confirm the public/);
});
test('only workspace owner controls public contacts; 24/7 needs a phone and explicit confirmation', async () => {
  const f = fixture(), office = await prepared(f), agent = { ...owner, id: 'agent', role: 'agent' };
  for (const action of ['directory-settings', 'save-directory-support', 'save-office-listing']) await assert.rejects(f.app.dispatch(agent, action, { id: office.id }), /Only the workspace owner/);
  assert.throws(() => supportInput({ ...listing, available24x7: true }), /Confirm that this phone/);
  assert.throws(() => supportInput({ ...listing, available24x7: true, coverageConfirmed: true, phone: '' }), /Confirm that this phone/);
  await f.app.dispatch(owner, 'save-directory-support', { ...listing, available24x7: true, coverageConfirmed: true });
  assert.equal((await publicDirectory(f.db)).support.available24x7, true);
  await f.app.dispatch(owner, 'save-directory-support', { phone: '', hours: '', appointmentURL: '' });
  assert.equal((await publicDirectory(f.db)).support.phone, '');
});
test('invalid positions, callable values and unsafe appointment URLs cannot be published', () => {
  for (const latitude of [null, '', Infinity, 91, 'nonsense']) assert.throws(() => listingInput({ ...listing, latitude }), /latitude/);
  for (const phone of ['javascript:run()', '+12035550100;123', '123']) assert.throws(() => supportInput({ phone }), /phone number/);
  for (const appointmentURL of ['javascript:alert(1)', 'http://example.test', 'https://user:password@example.test', 'https://127.0.0.1/book']) assert.throws(() => supportInput({ appointmentURL }), /HTTPS appointment/);
  assert.throws(() => listingInput({ ...listing, exteriorImageURL: 'file:///private/photo.jpg' }), /HTTPS link/);
});
test('public HTTP returns only directory data, is read-only and reports backend failure without details', async () => {
  const f = fixture(), headers = {};
  async function request(handler, method = 'GET') {
    let result; await handler({ method, headers: {} }, { statusCode: 200, setHeader(name, value) { headers[name] = value; }, end(value) { result = { status: this.statusCode, body: JSON.parse(value) }; } }); return result;
  }
  const handler = createDirectoryHandler({}, f.db);
  assert.equal((await request(handler)).status, 200); assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal((await request(handler, 'POST')).status, 405);
  const failed = await request(createDirectoryHandler({}, { ...f.db, list: async () => { throw new Error('private backend credential'); } }));
  assert.equal(failed.status, 503); assert(!JSON.stringify(failed).includes('credential'));
});
