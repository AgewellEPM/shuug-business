import test from 'node:test';
import assert from 'node:assert/strict';
import { patchReviewed } from './atomic.mjs';
import { backend } from './backend.mjs';

test('competing reviewed changes use the exact notes snapshot and do not fall back after conflict', async () => {
  let row = { id: 1, notes: '{"name":"Original"}', status: 'new' }, unconditional = 0;
  const db = { patch: async () => { unconditional++; }, patchIfUnchanged: async (_kind, _id, expected, patch) => {
    if (row.notes !== expected) return { matched: false };
    row = { ...row, ...patch }; return structuredClone(row);
  } };
  const original = structuredClone(row);
  const results = await Promise.allSettled([
    patchReviewed(db, 'offices', original, { contact_phone: '2035550100' }),
    patchReviewed(db, 'offices', original, { status: 'contacted' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(unconditional, 0);
  assert(JSON.parse(row.notes).revision);
});

test('the real backend adapter requires the conditional-write marker and preserves a server conflict', async () => {
  let options;
  const env = { GIGTAX_SALES_BOARDS: '{"offices":"test_board"}', GIGTAX_TINKY_KEY: 'synthetic' };
  const legacy = backend(env, async (_url, input) => { options = input; return Response.json({ row: { id: 1 } }); });
  await assert.rejects(legacy.patchIfUnchanged('offices', 1, null, { notes: '{}' }), error => error.status === 503);
  assert.equal(JSON.parse(options.body).expected_notes, null);
  const conflict = backend(env, async () => Response.json({ matched: false }, { status: 409 }));
  await assert.rejects(conflict.patchIfUnchanged('offices', 1, '{}', { notes: '{}' }), error => error.status === 409);
  const current = backend(env, async () => Response.json({ matched: true, row: { id: 1, notes: '{}' } }));
  assert.equal((await current.patchIfUnchanged('offices', 1, null, { notes: '{}' })).id, 1);
});
