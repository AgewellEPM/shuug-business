import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HttpError, metadata } from '../../sales/model.mjs';
import { sqliteStore } from './sqlite.mjs';
import { repEmailWorkspace } from './mail/workspace.mjs';

const key = 'ab'.repeat(32);
const rep = { id: '1', role: 'agent', email: 'rep@example.test', name: 'Fixture Rep', states: ['CT'] };
const peer = { id: '2', role: 'agent', email: 'peer@example.test', name: 'Fixture Peer', states: ['CT'] };
const owner = { id: 'owner', role: 'owner', name: 'Fixture Owner' };
const recipient = 'contact@example.test';
const connect = { provider: 'gmail', address: rep.email, name: rep.name, password: 'abcdefghijklmnop', revision: '' };
const sample = () => ({ id: randomUUID(), revision: 0, to: recipient, subject: 'Requested introduction', body: 'A private draft for this contact.' });

test('private mail and drafts stay scoped to the rep across restart and reconnect', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'sdr-mail-'));
  const file = join(dir, 'fixture.sqlite');
  let db = sqliteStore(file);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const seen = [];
  const transport = {
    async verify(account) { seen.push(account.address); },
    async read(account) {
      return { subject: 'Hello', replyTo: recipient, messageId: '<draft-parent@example.test>', references: ['<previous@example.test>', 'invalid header'],
        body: 'Mailbox for ' + account.address };
    },
  };
  let app = repEmailWorkspace(db, key, {}, transport);
  await assert.rejects(app.dispatch(peer, 'rep-email-connect', connect), { status: 403 });
  assert.deepEqual(seen, []);
  const connection = await app.dispatch(rep, 'rep-email-connect', connect);
  assert.equal(connection.mailbox.address, rep.email);
  assert.ok(!JSON.stringify(connection).includes(connect.password));
  assert.ok(!JSON.stringify(db.repMail.account(rep.id)).includes(connect.password));
  await assert.rejects(app.dispatch(owner, 'rep-email-connect', connect), { status: 409 });
  for (const viewer of [owner, peer]) {
    assert.equal(app.summary(viewer).mailbox, null);
    await assert.rejects(app.dispatch(viewer, 'rep-email-read', { folder: 'inbox', id: '99:1', userId: rep.id }), { status: 409 });
  }
  const { message, reply } = await app.dispatch(rep, 'rep-email-read', { folder: 'inbox', id: '99:1' });
  assert.equal(message.body, 'Mailbox for ' + rep.email);
  assert.equal(reply.subject, 'Re: Hello');
  assert.equal(message.references, undefined);
  const payload = { ...sample(), ...reply };
  await assert.rejects(app.dispatch(peer, 'rep-email-save', payload), { status: 409 });
  const { draft } = await app.dispatch(rep, 'rep-email-save', payload);
  assert.equal(draft.isReply, true);
  assert.ok(!JSON.stringify(db.repMail.draft(rep.id, draft.id)).includes(draft.body));
  for (const viewer of [owner, peer]) {
    assert.deepEqual((await app.dispatch(viewer, 'rep-email-drafts', {})).drafts, []);
    await assert.rejects(app.dispatch(viewer, 'rep-email-send', { id: draft.id, revision: draft.revision }), { status: 404 });
  }
  db.close();
  db = sqliteStore(file);
  app = repEmailWorkspace(db, key, {}, transport);
  assert.equal(app.summary(rep).mailbox.address, rep.email);
  assert.equal((await app.dispatch(rep, 'rep-email-drafts', {})).drafts[0].subject, 'Re: Hello');
  await app.dispatch(rep, 'rep-email-disconnect', { revision: connection.revision });
  await assert.rejects(app.dispatch(rep, 'rep-email-send', { id: draft.id, revision: draft.revision }), { status: 409 });
  assert.equal((await app.dispatch(rep, 'rep-email-drafts', {})).drafts[0].body, draft.body);
});

test('send checks current outreach preferences and records one accepted submission per draft', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'sdr-mail-send-'));
  const db = sqliteStore(join(dir, 'fixture.sqlite'));
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const office = db.create('offices', { town: 'Fixture Care Center', contact_email: recipient, contact_name: 'Fixture contact',
    state: 'CT', locality: 'Hartford', assigned_to: rep.id, status: 'new', notes: '{}' });
  const { promise, resolve } = Promise.withResolvers();
  const calls = [];
  let failure;
  const transport = {
    async verify() {},
    async send(account, _provider, draft) {
      calls.push({ account: account.address, draft });
      if (failure) throw failure;
      await promise;
      return { saveCopy: async () => true };
    },
  };
  const app = repEmailWorkspace(db, key, {}, transport);
  await app.dispatch(rep, 'rep-email-connect', connect);
  await assert.rejects(app.dispatch(peer, 'rep-email-save', { ...sample(), link: { officeId: String(office.id), contactId: 'office-contact' } }), { status: 404 });
  const { draft } = await app.dispatch(rep, 'rep-email-save', { ...sample(), link: { officeId: String(office.id), contactId: 'office-contact' } });
  const request = { id: draft.id, revision: draft.revision };
  db.patch('offices', office.id, { status: 'do_not_contact' });
  await assert.rejects(app.dispatch(rep, 'rep-email-send', request), { status: 409 });
  assert.equal(calls.length, 0);
  db.patch('offices', office.id, { status: 'new' });
  const forwarded = app.dispatch(rep, 'rep-email-send', request);
  assert.equal((await app.dispatch(rep, 'rep-email-send', request)).status, 'uncertain');
  resolve();
  assert.equal((await forwarded).status, 'accepted');
  assert.equal((await app.dispatch(rep, 'rep-email-send', request)).status, 'accepted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].account, rep.email);
  assert.match(calls[0].draft.messageId, /@example\.test>$/);
  assert.equal(db.list('events').length, 1);
  assert.equal(metadata(db.list('events')[0]).detail, 'Email accepted by the rep’s mail provider.');
  assert.deepEqual((await app.dispatch(rep, 'rep-email-drafts', {})).drafts, []);

  const { draft: another } = await app.dispatch(rep, 'rep-email-save', sample());
  failure = new HttpError(422, 'rejected');
  const rejected = await app.dispatch(rep, 'rep-email-send', { id: another.id, revision: another.revision });
  assert.equal(rejected.status, 'rejected');
  assert.equal((await app.dispatch(rep, 'rep-email-drafts', {})).drafts[0].status, 'draft');
  failure = new Error('connection lost after DATA');
  const retry = { id: another.id, revision: rejected.revision };
  assert.equal((await app.dispatch(rep, 'rep-email-send', retry)).status, 'uncertain');
  assert.equal((await app.dispatch(rep, 'rep-email-send', retry)).status, 'uncertain');
  assert.equal(calls.length, 3);
  assert.equal(db.list('events').length, 1);

  db.suppressEmail(recipient);
  const { draft: manual } = await app.dispatch(rep, 'rep-email-save', sample());
  await assert.rejects(app.dispatch(rep, 'rep-email-send', { id: manual.id, revision: manual.revision }), { status: 409 });
  assert.equal(calls.length, 3);
});
