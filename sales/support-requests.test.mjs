import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sqliteStore } from '../scripts/sdr-export/sqlite.mjs';
import { createHandler } from './handler.mjs';
import { digest } from './model.mjs';

const origin = 'http://127.0.0.1:8740';
const ownerCode = 'test-workspace-owner';
const env = {
  GIGTAX_SALES_ORIGIN: origin,
  GIGTAX_SALES_OWNER_HASH: digest(ownerCode),
  GIGTAX_SALES_SESSION_KEY: digest('test-support-session-key'),
};
const input = {
  subject: 'How do I share a contract?',
  category: 'contracts',
  message: 'A facility asked for a copy of its contract.',
};

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'sdr-support-requests-'));
  const filename = join(folder, 'sdr.sqlite');
  let db = sqliteStore(filename);
  let now = Date.UTC(2026, 10, 23);
  let app = createHandler(env, db, { localHttp: true, now: () => now });
  t.after(() => {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  });

  function session() {
    let cookie;
    return async (action, body = {}, expected = 200) => {
      const response = {
        setHeader(name, value) {
          if (name === 'Set-Cookie') cookie = value.split(';')[0];
        },
        end(body) { this.json = JSON.parse(body); },
      };
      await app({ method: 'POST', headers: { origin, 'content-type': 'application/json', cookie },
        body: { action, ...body } }, response);
      assert.equal(response.statusCode, expected, response.json?.error);
      return response.json;
    };
  }

  async function createRep(owner, name, email) {
    const agent = await owner('create-agent', { name, email, states: ['CT'] });
    const api = session();
    const { user } = await api('login', { email, code: agent.code });
    return { api, id: user.id };
  }

  return {
    session, createRep,
    publicSupport: value => db.setSupport(value),
    advance: () => { now += 3600000; return new Date(now).toISOString(); },
    reopen() {
      db.close();
      db = sqliteStore(filename);
      app = createHandler(env, db, { localHttp: true, now: () => now });
    },
  };
}

test('support requests require authentication, isolate reps, and retain a conversation after reopening SQLite', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('support-requests', {}, 401);
  await owner('support-request-create', input, 401);
  await owner('login', { code: ownerCode });
  const rep = await f.createRep(owner, 'Sales Rep', 'rep@example.test');
  const peer = await f.createRep(owner, 'Other Rep', 'peer@example.test');
  const publicSupport = { email: 'public-help@example.test' };
  f.publicSupport(publicSupport);

  const createdAt = f.advance();
  const { request } = await rep.api('support-request-create', { ...input, requester: { id: 'owner' }, status: 'resolved' });
  assert.equal(request.status, 'open');
  assert.equal(request.createdAt, createdAt);
  assert.equal(request.updatedAt, createdAt);
  assert.equal(request.resolvedAt, null);
  assert.deepEqual(request.requester, { id: rep.id, name: 'Sales Rep' });
  assert.deepEqual(request.messages, [
    { id: request.messages[0].id, author: request.requester, message: input.message, createdAt },
  ]);
  assert.deepEqual(await rep.api('support-requests'), { requests: [request], canManage: false });
  assert.deepEqual(await peer.api('support-requests'), { requests: [], canManage: false });
  assert.deepEqual(await owner('support-requests'), { requests: [request], canManage: true });
  await peer.api('support-request-update', { id: request.id, message: 'Attempt to read' }, 404);
  await rep.api('support-request-update', { id: request.id, status: 'resolved' }, 403);

  const updatedAt = f.advance();
  const { request: active } = await owner('support-request-update', {
    id: request.id, status: 'in_progress', message: 'Open the office’s contract tab.',
  });
  assert.equal(active.status, 'in_progress');
  assert.equal(active.updatedAt, updatedAt);
  assert.deepEqual(active.messages[1], {
    id: active.messages[1].id,
    author: { id: 'owner', name: 'Workspace owner' },
    message: 'Open the office’s contract tab.',
    createdAt: updatedAt,
  });
  const resolvedAt = f.advance();
  const { request: resolved } = await owner('support-request-update', { id: request.id, status: 'resolved' });
  assert.equal(resolved.resolvedAt, resolvedAt);
  assert.deepEqual(resolved.messages, active.messages);

  f.reopen();
  assert.deepEqual((await rep.api('support-requests')).requests, [resolved]);
  assert.deepEqual((await owner('directory-settings')).support, publicSupport);
});

test('support requests validate input and preserve concurrent replies', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('login', { code: ownerCode });
  const rep = await f.createRep(owner, 'Sales Rep', 'rep@example.test');

  await rep.api('support-request-create', { ...input, subject: '   ' }, 400);
  await rep.api('support-request-create', { ...input, category: 'undefined' }, 400);
  await rep.api('support-request-create', { ...input, message: 'x'.repeat(5001) }, 400);
  const { request } = await rep.api('support-request-create', input);
  await owner('support-request-update', { id: request.id, status: 'archived' }, 400);
  await owner('support-request-update', { id: request.id, message: ' ' }, 400);
  await owner('support-request-update', { id: '../../bad', message: 'Hello' }, 404);

  await Promise.all([
    owner('support-request-update', { id: request.id, message: 'Reply from owner' }),
    rep.api('support-request-update', { id: request.id, message: 'Reply from rep' }),
  ]);
  const [current] = (await owner('support-requests')).requests;
  assert.deepEqual(new Set(current.messages.map(item => item.message)),
    new Set([input.message, 'Reply from owner', 'Reply from rep']));
  assert.equal(new Set(current.messages.map(item => item.id)).size, 3);
});
