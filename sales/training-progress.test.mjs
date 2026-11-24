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
const empty = { completed: {}, sections: {}, currentCourseId: null, plan: [] };
const env = {
  GIGTAX_SALES_ORIGIN: origin,
  GIGTAX_SALES_OWNER_HASH: digest(ownerCode),
  GIGTAX_SALES_SESSION_KEY: digest('test-training-session-key'),
};

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'sdr-training-progress-'));
  const filename = join(folder, 'sdr.sqlite');
  let db = sqliteStore(filename);
  let time = Date.UTC(2026, 10, 23);
  let app = createHandler(env, db, { localHttp: true, now: () => time });
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

  return {
    session,
    advance() { time += 1000; return new Date(time).toISOString(); },
    reopen() {
      db.close();
      db = sqliteStore(filename);
      app = createHandler(env, db, { localHttp: true, now: () => time });
    },
  };
}

test('training catalog and learner progress require sign-in and persist privately per account', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('training-progress', {}, 401);
  await owner('training-update', { courseId: 'sales-onboarding' }, 401);
  await owner('login', { code: ownerCode });
  const email = 'rep@example.test';
  const { code } = await owner('create-agent', { name: 'Sales Rep', email, states: ['CT'] });
  const rep = f.session();
  await rep('login', { email, code });

  const { catalog, progress } = await rep('training-progress');
  assert.deepEqual(progress, empty);
  const course = catalog.courses.find(item => item.id === catalog.featuredCourseId);
  const sectionId = course.sections.at(-1).id;
  const another = catalog.courses.find(item => item.id !== course.id);
  assert.ok(catalog.paths.every(path => path.courseIds.every(id => catalog.courses.some(item => item.id === id))));
  assert.deepEqual(catalog.sessions, []);
  assert.deepEqual((await rep('training-update', {
    userId: 'owner', courseId: course.id, sectionId,
    planChanges: { add: [course.id, another.id] },
  })).progress, {
    ...empty, currentCourseId: course.id, sections: { [course.id]: sectionId }, plan: [course.id, another.id],
  });
  const completedAt = f.advance();
  const { progress: completed } = await rep('training-update', { courseId: course.id });
  assert.equal(completed.completed[course.id], completedAt);
  f.advance();
  assert.deepEqual((await rep('training-update', { courseId: course.id })).progress, completed);

  f.reopen();
  assert.deepEqual((await rep('training-progress')).progress, completed);
  assert.deepEqual((await owner('training-progress', { userId: 'any-rep' })).progress, empty);
});

test('training updates reject unknown catalog IDs and apply plan deltas without losing completions', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('login', { code: ownerCode });
  const { catalog } = await owner('training-progress');
  const [first, second, third] = catalog.courses.map(course => course.id);
  await owner('training-update', { courseId: '__proto__' }, 400);
  await owner('training-update', { courseId: first, sectionId: 'unknown' }, 400);
  await owner('training-update', { planChanges: { add: ['unknown'] } }, 400);
  await owner('training-update', { planChanges: { add: [first], remove: [first] } }, 400);
  await owner('training-update', { planChanges: { add: [first, second] } });
  await Promise.all([
    owner('training-update', { courseId: first, planChanges: { remove: [first] } }),
    owner('training-update', { courseId: second, planChanges: { add: [third, second] } }),
  ]);
  const { progress } = await owner('training-progress');
  assert.deepEqual(progress.plan, [second, third]);
  assert.deepEqual(new Set(Object.keys(progress.completed)), new Set([first, second]));
  assert.deepEqual(progress.sections, {});
});
