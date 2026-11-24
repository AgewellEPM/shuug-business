import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HttpError, metadata } from '../../sales/model.mjs';
import { sqliteStore } from './sqlite.mjs';
import { repEmailWorkspace } from './mail/workspace.mjs';
import { zohoMail } from './mail/zoho-mail.mjs';

const key = 'ab'.repeat(32), owner = { id: 'owner', name: 'Fixture Office', role: 'owner' };
const env = { ZOHO_CLIENT_ID: 'fixture-client', ZOHO_CLIENT_SECRET: 'fixture-secret', ZOHO_REFRESH_TOKEN: 'fixture-grant', SDR_ZOHO_OWNER_ADDRESS: 'office@example.test' };
const sample = () => ({ id: randomUUID(), revision: 0, to: 'contact@example.test', subject: 'Introduction', body: 'Fixture message' });
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sdr-zoho-mail-')), file = join(dir, 'workspace.sqlite');
  let db = sqliteStore(file);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  function agent(address, parentId = 'owner') {
    const row = db.create('agents', { status: 'active', contact_email: address, contact_name: address.split('@')[0],
      notes: JSON.stringify({ parentId, codeHash: 'fixture', states: ['CT'] }) });
    return { id: String(row.id), role: 'agent', name: row.contact_name, email: address, states: ['CT'] };
  }
  return { db, dir, rep: agent('rep@example.test'), peer: agent('peer@example.test'), agent,
    reopen() { db.close(); db = sqliteStore(file); return db; } };
}

test('owner assignments survive restart, keep credentials on the server, and reject self-assigned mailbox access', async t => {
  const { db, dir, rep, peer, agent, reopen } = fixture(t);
  let app = repEmailWorkspace(db, key, {}, { directory: dir });
  assert.equal(app.summary(rep).mailbox.address, rep.email);
  assert.equal(app.summary(rep).mailbox.configured, false);
  const payload = { ...sample(), files: [{ name: 'terms.txt', base64: 'dGVybXM=' }] };
  const { draft } = await app.dispatch(rep, 'rep-email-save', payload);
  assert.equal(draft.files[0].size, 5);
  assert.ok(!JSON.stringify(db.repMail.draft(rep.id, draft.id)).includes(payload.body));
  assert.ok(!db.repMail.file(draft.files[0].id).includes('dGVybXM='));
  await assert.rejects(app.dispatch(peer, 'rep-email-save', { ...sample(), files: draft.files }), { status: 400 });
  await assert.rejects(app.dispatch(peer, 'rep-email-send', draft), { status: 404 });
  await assert.rejects(app.dispatch(rep, 'rep-email-send', draft), { status: 503 });
  const subordinate = agent('other@example.test', rep.id);
  writeFileSync(join(dir, 'zoho-mail.json'), JSON.stringify({ clientId: 'company', clientSecret: 'private-client-value', refreshToken: 'private-grant-value',
    mailboxes: { [peer.id]: { address: 'shared@example.test' } } }), { mode: 0o600 });
  assert.equal(app.summary(rep).mailbox.configured, true);
  assert.equal(app.summary(subordinate).mailbox.configured, false);
  assert.equal(app.summary(peer).mailbox.address, 'shared@example.test');
  assert.ok(!JSON.stringify(app.summary(rep)).includes('private-'));
  assert.equal(app.actions.has('rep-email-connect'), false);
  app = repEmailWorkspace(reopen(), key, env, { directory: dir });
  assert.deepEqual((await app.dispatch(rep, 'rep-email-drafts')).drafts[0], draft);
  await app.dispatch(rep, 'rep-email-discard', draft);
  assert.deepEqual((await app.dispatch(rep, 'rep-email-drafts')).drafts, []);
});

test('Zoho mailbox uses its exact primary address, preserves long IDs, reads, replies, moves and sends attachments', async t => {
  const { db, rep, peer } = fixture(t);
  const id = '1709876190693100009', folder = '9000000002014', contact = 'contact@example.test';
  const details = { messageId: id, folderId: folder, status: '0', fromAddress: contact, toAddress: 'Fixture &lt;rep@example.test&gt;', subject: 'Hello', hasAttachment: '1' };
  const calls = [], ok = data => Response.json({ status: { code: 200 }, data });
  let sent, granted = 0;
  const fetcher = async (url, options) => {
    const { hostname, pathname, searchParams } = new URL(url);
    if (hostname === 'accounts.zoho.com') {
      granted++;
      assert.equal(options.body.get('refresh_token'), env.ZOHO_REFRESH_TOKEN);
      return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    }
    assert.equal(hostname, 'mail.zoho.com');
    assert.equal(options.headers.Authorization, 'Zoho-oauthtoken fixture-access');
    if (pathname === '/api/accounts') return ok([{ primaryEmailAddress: rep.email, accountId: '10001' }]);
    assert.ok(pathname.startsWith('/api/accounts/10001/'));
    const path = pathname.slice('/api/accounts/10001/'.length);
    calls.push({ path, options });
    if (path === 'folders') return ok(['Inbox', 'Sent', 'Drafts', 'Trash'].map((name, index) => ({ folderName: name, folderType: name, path: '/' + name, folderId: index ? String(index + 100) : folder })));
    if (path === 'messages/view' || path === 'messages/search') {
      if (path.endsWith('search')) assert.equal(searchParams.get('searchKey'), 'in:Inbox::sender:' + contact);
      return ok([details]);
    }
    if (path.endsWith('/details')) return new Response(JSON.stringify({ data: details }).replace('"' + id + '"', id));
    if (path.endsWith('/header')) return ok({ headerContent: 'Reply-To: reply@example.test\r\n' });
    if (path.endsWith('/content')) return ok({ content: '<div>Hello<br>team &amp; friends</div><script>ignore-this()</script>' });
    if (path.endsWith('/attachmentinfo')) return ok({ attachments: [{ attachmentName: 'terms.txt', attachmentSize: 5, attachmentId: '123' }] });
    if (path.endsWith('/attachments/123')) return new Response('terms');
    if (path === 'updatemessage') {
      assert.ok(options.body.includes(id));
      return ok(undefined);
    }
    if (path === 'messages/attachments') {
      assert.equal(options.body.toString(), 'terms');
      assert.equal(searchParams.get('fileName'), 'terms.txt');
      return ok({ attachmentName: 'terms.txt', attachmentPath: '/compose/terms', storeName: '1234' });
    }
    if (path === 'messages/' + id) { sent = JSON.parse(options.body); return ok({ messageId: '22000' }); }
    assert.fail('Unexpected Zoho resource ' + path);
  };
  const app = repEmailWorkspace(db, key, env, { transport: zohoMail(fetcher) });
  await assert.rejects(app.dispatch(peer, 'rep-email-list', { folder: 'inbox', accountId: '10001' }), { status: 503 });
  assert.equal(calls.length, 0);
  const { messages } = await app.dispatch(rep, 'rep-email-list', { folder: 'inbox', contact });
  assert.equal(messages[0].id, id);
  const { message, reply } = await app.dispatch(rep, 'rep-email-read', { folder: 'inbox', id });
  assert.equal(message.body, 'Hello\nteam & friends');
  assert.equal(message.unread, false);
  assert.equal(reply.to, 'reply@example.test');
  assert.equal(granted, 1);
  const file = await app.dispatch(rep, 'rep-email-download', { folder: 'inbox', id, index: 0 });
  assert.equal(Buffer.from(file.base64, 'base64').toString(), 'terms');
  await app.dispatch(rep, 'rep-email-change', { folder: 'inbox', id, operation: 'trash' });
  assert.ok(calls.some(call => call.options.body?.toString().includes('"destfolderId":103')));
  const payload = { ...sample(), ...reply, cc: 'second@example.test', bcc: 'third@example.test', files: [file] };
  await assert.rejects(app.dispatch(peer, 'rep-email-save', payload), { status: 409 });
  const { draft } = await app.dispatch(rep, 'rep-email-save', payload);
  assert.equal((await app.dispatch(rep, 'rep-email-send', draft)).status, 'accepted');
  assert.equal((await app.dispatch(rep, 'rep-email-send', draft)).status, 'accepted');
  assert.equal(calls.filter(call => call.path === 'messages/' + id).length, 1);
  assert.equal(sent.fromAddress, rep.email);
  assert.equal(sent.action, 'reply');
  assert.equal(sent.ccAddress, payload.cc);
  assert.equal(sent.bccAddress, payload.bcc);
  assert.equal(sent.attachments[0].storeName, '1234');
});

test('outreach checks all recipients, records one accepted send, and retains unconfirmed submissions without automatic retry', async t => {
  const { db, rep } = fixture(t);
  const office = db.create('offices', { town: 'Fixture Care', contact_email: 'contact@example.test', contact_name: 'Fixture',
    state: 'CT', locality: 'Hartford', assigned_to: rep.id, status: 'new', notes: '{}' });
  let attempt, queued = 0, failure;
  const app = repEmailWorkspace(db, key, env, { transport: { async prepare() { return async () => {
    queued++; if (failure) throw failure; await attempt?.promise; return { messageId: '202' };
  }; } } });
  const link = { officeId: String(office.id), contactId: 'office-contact' };
  const { draft } = await app.dispatch(rep, 'rep-email-save', { ...sample(), link });
  db.patch('offices', office.id, { status: 'do_not_contact' });
  await assert.rejects(app.dispatch(rep, 'rep-email-send', draft), { status: 409 });
  db.patch('offices', office.id, { status: 'new' });
  attempt = Promise.withResolvers();
  const first = app.dispatch(rep, 'rep-email-send', draft);
  await Promise.resolve();
  assert.equal((await app.dispatch(rep, 'rep-email-send', draft)).status, 'uncertain');
  attempt.resolve();
  assert.equal((await first).status, 'accepted');
  assert.equal(queued, 1);
  assert.equal(metadata(db.list('events')[0]).detail, 'Zoho Mail accepted the email.');
  db.suppressEmail('blocked@example.test');
  const { draft: blocked } = await app.dispatch(rep, 'rep-email-save', { ...sample(), bcc: 'blocked@example.test' });
  await assert.rejects(app.dispatch(rep, 'rep-email-send', blocked), { status: 409 });
  const { draft: next } = await app.dispatch(rep, 'rep-email-save', sample());
  failure = new HttpError(422, 'refused');
  const rejected = await app.dispatch(rep, 'rep-email-send', next);
  assert.equal(rejected.status, 'rejected');
  failure = new Error('lost response');
  const retry = { id: next.id, revision: rejected.revision };
  assert.equal((await app.dispatch(rep, 'rep-email-send', retry)).status, 'uncertain');
  assert.equal((await app.dispatch(rep, 'rep-email-send', retry)).status, 'uncertain');
  assert.equal(queued, 3);
  assert.equal(db.list('events').length, 1);
});
