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
const emptyStoredProfile = { bio: '', photo: '', revision: 0 };
const startingProgress = { level: 1, xp: 0, xpIntoLevel: 0, xpPerLevel: 100 };
const emptyProfile = { name: '', email: '', phone: '', ...emptyStoredProfile };
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

test('profile edits preserve account credentials and expose contacts only to the reporting team', async t => {
  const f = fixture(t), owner = f.session(), manager = f.session(), rep = f.session(), peer = f.session();
  await rep('sales-team-profile', {}, 401);
  await rep('sales-team-member-profile', { id: 'owner' }, 401);
  await owner('login', { code: ownerCode });
  const managerEmail = 'lead@example.test', accountEmail = 'rep@example.test', peerEmail = 'peer@example.test';
  const lead = await owner('sales-team-invite', { name: 'Team Lead', email: managerEmail, states: ['MA'] });
  const colleague = await owner('sales-team-invite', { name: 'Other Team', email: peerEmail, states: ['MA'] });
  await manager('login', { email: managerEmail, code: lead.code });
  await peer('login', { email: peerEmail, code: colleague.code });
  const { agent, code } = await manager('sales-team-invite', { name: 'Test Rep', email: accountEmail, states: ['MA'] });
  await rep('login', { email: accountEmail, code });
  const repDefaults = { ...emptyProfile, name: 'Test Rep', email: accountEmail };
  assert.deepEqual((await rep('sales-team-profile')).profile, { ...repDefaults, progress: startingProgress });

  const details = {
    name: 'Test Rep Display', email: 'contact@example.test', phone: '+1 (617) 555-0150 ext. 23',
    bio: 'I help care teams in Massachusetts.', photo: portrait,
  };
  const changes = { ...details, revision: 0 };
  await owner('set-sales-team-profile', { ...changes, memberId: agent.id }, 400);
  await rep('set-sales-team-profile', { ...changes, id: 'owner' }, 400);
  await rep('set-sales-team-profile', { ...changes, email: 'invalid-address' }, 400);
  await rep('set-sales-team-profile', { ...changes, phone: 'bad number' }, 400);
  await rep('set-sales-team-profile', { ...changes, bio: 'a'.repeat(801) }, 400);
  await rep('set-sales-team-profile', { ...changes, photo: 'data:image/svg+xml;base64,PD4=' }, 400);
  const profile = { ...details, revision: 1 };
  assert.deepEqual((await rep('set-sales-team-profile', changes)).profile, { ...profile, progress: startingProgress });
  await rep('set-sales-team-profile', changes, 409);
  await rep('login', { email: details.email, code }, 401);
  await rep('login', { email: accountEmail, code });

  const memberView = { id: agent.id, ...details, progress: startingProgress };
  for (const viewer of [owner, manager, rep]) {
    assert.deepEqual((await viewer('sales-team-member-profile', { id: agent.id })).profile, memberView);
  }
  await peer('sales-team-member-profile', { id: agent.id }, 404);
  await rep('sales-team-member-profile', { id: lead.agent.id }, 404);
  await rep('sales-team-member-profile', { id: 'owner' }, 404);
  await owner('sales-team-member-profile', { id: '99999' }, 404);
  assert.deepEqual((await owner('sales-team-profile', { memberId: agent.id })).profile, { ...emptyProfile, progress: startingProgress });
  const member = (await owner('sales-team-read')).members.find(row => row.id === agent.id);
  assert.deepEqual(member.states, ['MA']);
  assert.equal(member.name, details.name);
  assert.equal(member.photo, portrait);
  assert.equal(member.bio, undefined);
  assert.equal(member.phone, undefined);

  const reopened = sqliteStore(f.database);
  try {
    assert.deepEqual(reopened.salesRepProfile(agent.id), profile);
    assert.deepEqual(reopened.salesRepProfile('owner'), emptyStoredProfile);
  } finally { reopened.close(); }
  // Older pages still submit only bio and photo.
  assert.deepEqual((await rep('set-sales-team-profile', { bio: '', photo: '', revision: 1 })).profile,
    { ...profile, bio: '', photo: '', revision: 2, progress: startingProgress });
  const ownerProfile = (await owner('set-sales-team-profile', changes)).profile;
  assert.deepEqual(ownerProfile, { ...profile, progress: startingProgress });
  const ownerRow = (await owner('sales-team-read')).members.find(row => row.id === 'owner');
  assert.equal(ownerRow.name, details.name);
  assert.equal(ownerRow.photo, portrait);
  await owner('sales-team-revoke', { id: agent.id });
  await owner('sales-team-member-profile', { id: agent.id }, 404);
  await rep('sales-team-profile', {}, 401);
  await rep('set-sales-team-profile', { ...changes, revision: 2 }, 401);
});
