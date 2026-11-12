import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { contactFixture } from '../scripts/sales/contact-fixture.mjs';
import { contactBook, contactDirectory } from './contacts.mjs';
import { metadata } from './model.mjs';

const person = (input = {}) => ({ name: 'Synthetic Owner', role: 'owner', title: '', email: 'owner@example.test', phone: '+1 860 555 0100', mobile: '', extension: '', preference: 'email', notes: '', sourceURL: '', sourceNote: '', ...input });
const command = (office, contactId = randomUUID(), extra = {}) => ({ id: office.id, contactId, expectedRevision: contactBook(office).revision, requestId: randomUUID(), ...extra });

test('old office contacts appear without writes; two contacts and a primary survive fresh reads', async () => {
  const f = contactFixture(), office = await f.createOffice({ contact: 'Directory Contact', email: 'office@example.test' });
  assert.equal(contactBook(office).contacts[0].role, 'unverified'); assert.equal(metadata(office).contacts, undefined);
  const input = command(office, undefined, { contact: person() });
  const saved = await f.app.dispatch(f.owner, 'save-contact', input);
  assert.equal(saved.book.contacts.length, 2); assert.equal(saved.book.contacts.find(c => c.name === 'Directory Contact').primary, true);
  const current = await f.db.get('offices', office.id), primary = saved.book.contacts.find(c => c.name === 'Synthetic Owner');
  await f.app.dispatch(f.owner, 'set-primary-contact', command(current, primary.id));
  const read = await f.app.dispatch(f.owner, 'office', { id: office.id });
  assert.equal(read.office.contact_name, primary.name); assert.equal(read.contacts.contacts.length, 2);
  assert.equal(read.contacts.contacts.find(c => c.id === primary.id).primary, true);
  assert.equal((await f.app.dispatch(f.owner, 'rolodex')).coverage.owners, 1);
});

test('explicit source checks are retained and invalidated when the checked person changes', async () => {
  const f = contactFixture(), office = await f.createOffice(), id = randomUUID();
  await assert.rejects(f.app.dispatch(f.owner, 'save-contact', command(office, id, { contact: person({ reviewed: true }) })), /source URL/);
  const input = person({ reviewed: true, sourceURL: 'https://example.test/team', sourceNote: 'Synthetic named owner evidence.' });
  const first = await f.app.dispatch(f.owner, 'save-contact', command(office, id, { contact: input }));
  assert(first.book.contacts[0].verification); assert.equal(metadata(await f.db.get('offices', office.id)).independence, 'unverified');
  const changed = await f.app.dispatch(f.owner, 'save-contact', command(await f.db.get('offices', office.id), id, { contact: { ...input, name: 'Different Person', reviewed: false } }));
  assert.equal(changed.book.contacts[0].verification, null);
  const row = await f.db.get('offices', office.id);
  await f.app.dispatch(f.owner, 'update-office', { id: row.id, contact: 'Edited in office form' });
  assert.equal((await f.app.dispatch(f.owner, 'office', { id: row.id })).contacts.contacts[0].name, 'Edited in office form');
});

test('stale requests, concurrent writers and mismatched retry IDs never overwrite another change', async () => {
  const f = contactFixture(), office = await f.createOffice();
  const a = command(office, undefined, { contact: person() }), b = command(office, undefined, { contact: person({ name: 'Other Contact' }) });
  const attempts = await Promise.allSettled([a, b].map(body => f.app.dispatch(f.owner, 'save-contact', body)));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(r => r.status === 'rejected' && r.reason.status === 409).length, 1);
  const winner = attempts[0].status === 'fulfilled' ? a : b;
  assert.equal((await f.app.dispatch(f.owner, 'save-contact', winner)).duplicate, true);
  await assert.rejects(f.app.dispatch(f.owner, 'save-contact', { ...winner, contact: person({ name: 'Reused ID changed' }) }), /request ID/);
  assert.equal(contactBook(await f.db.get('offices', office.id)).contacts.length, 1);
});

test('agent assignments and territory protect every contact action and the directory', async () => {
  const f = contactFixture(), office = await f.createOffice();
  const agent = { id: '42', role: 'agent', name: 'Synthetic Agent', states: ['CT'] };
  assert.equal((await f.app.dispatch(agent, 'rolodex')).coverage.offices, 0);
  for (const action of ['save-contact', 'archive-contact', 'restore-contact', 'set-primary-contact']) await assert.rejects(f.app.dispatch(agent, action, command(office)), /not found/);
  await f.db.patch('offices', office.id, { assigned_to: '42' });
  await f.app.dispatch(agent, 'save-contact', command(office, undefined, { contact: person() }));
  assert.equal((await f.app.dispatch(agent, 'rolodex')).contacts.length, 1);
  assert.equal((await f.app.dispatch({ ...agent, states: ['MA'] }, 'rolodex')).contacts.length, 0);
});

test('archive and restore preserve history and clear a primary safely; DNC suppresses conversation tools', async () => {
  const f = contactFixture(), office = await f.createOffice(), id = randomUUID();
  await f.app.dispatch(f.owner, 'save-contact', command(office, id, { contact: person({ preference: 'do_not_contact' }) }));
  let current = await f.db.get('offices', office.id);
  assert.equal(metadata(current).primaryContactDoNotContact, true);
  for (const action of ['research-office', 'save-outreach-draft']) await assert.rejects(f.app.dispatch(f.owner, action, { id: office.id }), /do not contact/);
  assert.equal((await f.app.dispatch(f.owner, 'rolodex')).contacts[0].suppressed, true);
  await f.app.dispatch(f.owner, 'archive-contact', command(current, id));
  current = await f.db.get('offices', office.id);
  assert.equal(current.contact_email, ''); assert.equal(contactBook(current).contacts[0].archived, true);
  assert.equal(contactDirectory([current]).coverage.contacts, 0);
  await f.app.dispatch(f.owner, 'restore-contact', command(current, id));
  assert.equal((await f.app.dispatch(f.owner, 'rolodex')).coverage.contacts, 1);
  assert.equal(contactBook(await f.db.get('offices', office.id)).contacts[0].primary, false);
});

test('editing secondary contacts retains primary verification; mobile-only contacts keep their source check', async () => {
  const f = contactFixture(), office = await f.createOffice({ contact: 'Original Person', email: 'original@example.test' });
  await f.app.dispatch(f.owner, 'update-office', { id: office.id, contactRole: 'owner', contactVerified: true, emailVerified: true, verificationSource: 'https://example.test/team', verificationNote: 'Synthetic source checked.' });
  let current = await f.db.get('offices', office.id);
  await f.app.dispatch(f.owner, 'save-contact', command(current, undefined, { contact: person() }));
  current = await f.db.get('offices', office.id); assert.equal(metadata(current).emailVerified, true);
  const mobileOffice = await f.createOffice({ name: 'Mobile-only Synthetic Office' });
  const saved = await f.app.dispatch(f.owner, 'save-contact', command(mobileOffice, undefined, { contact: person({ phone: '', mobile: '+1 860 555 0199', reviewed: true, sourceURL: 'https://example.test/team', sourceNote: 'Synthetic owner source.' }) }));
  assert(saved.book.contacts[0].verification); assert.equal(saved.book.contacts[0].phone, '');
});

test('invalid contact details and empty owner identities fail before saving', async () => {
  const f = contactFixture(), office = await f.createOffice();
  for (const input of [person({ name: '' }), person({ email: 'bad' }), person({ phone: 'call me' }), person({ extension: 'a' }), person({ sourceURL: 'javascript:alert(1)' }), person({ preference: 'sms' })]) await assert.rejects(f.app.dispatch(f.owner, 'save-contact', command(office, undefined, { contact: input })));
  assert.equal(contactBook(await f.db.get('offices', office.id)).contacts.length, 0);
});

test('the existing contact-check form and Rolodex agree after source confirmation or source removal', async () => {
  const f = contactFixture(), office = await f.createOffice(), id = randomUUID();
  await f.app.dispatch(f.owner, 'save-contact', command(office, id, { contact: person({ role: 'partner' }) }));
  await f.app.dispatch(f.owner, 'update-office', { id: office.id, contactRole: 'partner', contactVerified: true, verificationSource: 'https://example.test/team', verificationNote: 'Synthetic partner source checked.' });
  let book = (await f.app.dispatch(f.owner, 'office', { id: office.id })).contacts;
  assert(book.contacts[0].verification); assert.equal(book.contacts[0].role, 'partner');
  await f.app.dispatch(f.owner, 'update-office', { id: office.id, verificationSource: '', verificationNote: '' });
  book = (await f.app.dispatch(f.owner, 'office', { id: office.id })).contacts;
  assert.equal(book.contacts[0].verification, null); assert.equal(book.contacts[0].sourceURL, '');
});

test('the actual backend metadata ceiling returns a useful error before a contact write', async () => {
  const f = contactFixture(), office = await f.createOffice();
  await f.db.patch('offices', office.id, { notes: JSON.stringify({ ...metadata(office), retainedEvidence: 'x'.repeat(48000) }) });
  const current = await f.db.get('offices', office.id);
  await assert.rejects(f.app.dispatch(f.owner, 'save-contact', command(current, undefined, { contact: person() })), /storage limit/);
  assert.equal(contactBook(await f.db.get('offices', office.id)).contacts.length, 0);
});

test('a phone edit in the existing office form cannot retain or resurrect a Rolodex source check', async () => {
  const f = contactFixture(), office = await f.createOffice(), id = randomUUID();
  await f.app.dispatch(f.owner, 'save-contact', command(office, id, { contact: person({ reviewed: true, sourceURL: 'https://example.test/team', sourceNote: 'Synthetic identity checked.' }) }));
  await f.app.dispatch(f.owner, 'update-office', { id: office.id, phone: '+1 860 555 0188' });
  let current = await f.db.get('offices', office.id);
  assert.equal(contactBook(current).contacts[0].verification, null);
  await f.app.dispatch(f.owner, 'save-contact', command(current, undefined, { contact: person({ name: 'Another Contact', role: 'manager' }) }));
  current = await f.db.get('offices', office.id);
  assert.equal(contactBook(current).contacts.find(c => c.id === id).verification, null);
});

test('re-entering an office contact after archival cannot reuse or overwrite the archived identity', async () => {
  const f = contactFixture(), office = await f.createOffice({ contact: 'Original Directory Person' });
  await f.app.dispatch(f.owner, 'save-contact', command(office, undefined, { contact: person() }));
  let current = await f.db.get('offices', office.id);
  await f.app.dispatch(f.owner, 'archive-contact', command(current, 'office-contact'));
  await f.app.dispatch(f.owner, 'update-office', { id: office.id, contact: 'New Directory Person', email: 'new@example.test' });
  current = await f.db.get('offices', office.id);
  const book = contactBook(current), active = book.contacts.find(c => c.primary);
  assert.equal(new Set(book.contacts.map(c => c.id)).size, 3); assert.notEqual(active.id, 'office-contact');
  await f.app.dispatch(f.owner, 'save-contact', command(current, active.id, { contact: person({ name: 'New Directory Person', email: 'new@example.test' }) }));
  const saved = contactBook(await f.db.get('offices', office.id));
  assert.equal(saved.contacts.find(c => c.id === 'office-contact').name, 'Original Directory Person');
  assert(saved.contacts.find(c => c.id === 'office-contact').archived);
});
