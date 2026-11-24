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
const emptyProfile = { bio: '', photo: '', revision: 0 };
const portrait = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCoBqK//9k=';

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'sdr-sales-profile-'));
  const database = join(folder, 'sdr.sqlite');
  const db = sqliteStore(database);
  t.after(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });
  const app = createHandler({ GIGTAX_SALES_ORIGIN: origin, GIGTAX_SALES_OWNER_HASH: digest(ownerCode),
    GIGTAX_SALES_SESSION_KEY: digest('test-workspace-session-key') }, db, { localHttp: true, salesTeam: true });

  function session() {
    let cookie;
    return async (action, body = {}, expected = 200) => {
      const response = { statusCode: 200, setHeader(name, value) {
        if (name === 'Set-Cookie') cookie = value.split(';')[0];
      }, end(body) { this.json = JSON.parse(body); } };
      const headers = { origin, 'content-type': 'application/json', cookie };
      await app({ method: 'POST', headers, body: { action, ...body } }, response);
      assert.equal(response.statusCode, expected, response.json?.error);
      return response.json;
    };
  }
  return { database, session };
}

test('a rep can save and remove their own sales bio and headshot without editing another account', async t => {
  const f = fixture(t), owner = f.session(), rep = f.session();
  await rep('sales-team-profile', {}, 401);
  await owner('login', { code: ownerCode });
  const email = 'rep@example.test';
  const { agent, code } = await owner('sales-team-invite', { name: 'Test Rep', email, states: ['MA'] });
  await rep('login', { email, code });
  assert.deepEqual((await rep('sales-team-profile')).profile, emptyProfile);
  const bio = 'I help care teams in Massachusetts.';
  const changes = { bio, photo: portrait, revision: 0 };
  await owner('set-sales-team-profile', { ...changes, memberId: agent.id }, 400);
  await rep('set-sales-team-profile', { ...changes, id: 'owner' }, 400);
  await rep('set-sales-team-profile', { ...changes, bio: 'a'.repeat(801) }, 400);
  await rep('set-sales-team-profile', { ...changes, photo: 'data:image/svg+xml;base64,PD4=' }, 400);
  await rep('set-sales-team-profile', { ...changes, photo: 'data:image/jpeg;base64,AAAA' }, 400);
  const profile = { bio, photo: portrait, revision: 1 };
  assert.deepEqual((await rep('set-sales-team-profile', changes)).profile, profile);
  await rep('set-sales-team-profile', changes, 409);
  assert.deepEqual((await rep('sales-team-profile')).profile, profile);
  assert.deepEqual((await owner('sales-team-profile', { memberId: agent.id })).profile, emptyProfile);

  const reopened = sqliteStore(f.database);
  try {
    assert.deepEqual(reopened.salesRepProfile(agent.id), profile);
    assert.deepEqual(reopened.salesRepProfile('owner'), emptyProfile);
  } finally { reopened.close(); }
  const member = (await owner('sales-team-read')).members.find(row => row.id === agent.id);
  assert.deepEqual(member.states, ['MA']);
  assert.equal(member.bio, undefined);
  assert.equal(member.photo, undefined);

  assert.deepEqual((await rep('set-sales-team-profile', { bio: '', photo: '', revision: 1 })).profile,
    { ...emptyProfile, revision: 2 });
  await owner('sales-team-revoke', { id: agent.id });
  await rep('sales-team-profile', {}, 401);
  await rep('set-sales-team-profile', { ...changes, revision: 2 }, 401);
  assert.deepEqual((await owner('set-sales-team-profile', changes)).profile, profile);
});
