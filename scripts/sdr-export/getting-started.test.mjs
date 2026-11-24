import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { service } from '../../sales/service.mjs';
import { sqliteStore } from './sqlite.mjs';

test('walkthrough progress follows the signed-in rep, survives a restart and is never reset by replay', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'sdr-tour-'));
  const file = join(dir, 'workspace.sqlite');
  let db = sqliteStore(file);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const rep = { id: '21', role: 'agent' }, teammate = { id: '22', role: 'agent' };
  const read = (user, data) => service({}, db).dispatch(user, 'getting-started-read', data);
  const save = (user, data) => service({}, db).dispatch(user, 'getting-started-save', data);
  assert.deepEqual(await read(rep, {}), { progress: null });
  await assert.rejects(save(rep, { step: 'today', state: 'broken', revision: 0 }), { status: 400 });
  await save(rep, { step: 'pipeline', state: 'active', revision: 0, memberId: teammate.id });
  await assert.rejects(save(rep, { step: 'today', state: 'active', revision: 0 }), { status: 409 });
  await save(rep, { step: 'pipeline', state: 'paused', revision: 1 });
  db.close(); db = sqliteStore(file);
  assert.deepEqual(await read(rep, {}), { progress: { step: 'pipeline', state: 'paused', revision: 2 } });
  assert.deepEqual(await read(teammate, { memberId: rep.id }), { progress: null });
  const finished = await save(rep, { step: 'finish', state: 'complete', revision: 2 });
  assert.deepEqual(await save(rep, { step: 'welcome', state: 'active', revision: 0 }), finished);
  await assert.rejects(read({ id: '31', role: 'location' }, {}), { status: 403 });
});
