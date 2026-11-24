import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sqliteStore } from '../scripts/sdr-export/sqlite.mjs';
import { createHandler } from './handler.mjs';
import { digest } from './model.mjs';
import { trainingCourseExercises } from './training-content.mjs';
import { trainingScenarios } from './training-scenarios.mjs';

const origin = 'http://127.0.0.1:8740';
const ownerCode = 'test-workspace-owner';
const empty = { completed: {}, sections: {}, visitedSections: {}, assessments: {}, practice: {}, scenarios: {}, currentCourseId: null, plan: [] };
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
    seedLegacy(progress) { db.updateTrainingProgress('owner', () => progress); },
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
  assert.ok(catalog.playbooks.length);
  for (const { id } of catalog.courses) {
    const exercise = catalog.exercises[id];
    assert.ok(exercise.questions.length && exercise.practice.length, `Missing exercises for ${id}`);
    for (const question of exercise.questions) {
      assert.equal(Object.hasOwn(question, 'correct'), false);
      assert.equal(Object.hasOwn(question, 'explanation'), false);
    }
  }
  assert.deepEqual(catalog.sessions, []);
  assert.deepEqual((await rep('training-update', {
    userId: 'owner', courseId: course.id, sectionId,
    planChanges: { add: [course.id, another.id] },
  })).progress, {
    ...empty, currentCourseId: course.id, sections: { [course.id]: sectionId },
    visitedSections: { [course.id]: [sectionId] }, plan: [course.id, another.id],
  });
  await rep('training-update', { courseId: course.id }, 409);
  for (const section of course.sections) await rep('training-update', { courseId: course.id, sectionId: section.id });
  await rep('training-update', { courseId: course.id }, 409);

  const exercise = trainingCourseExercises[course.id];
  const assessment = answer => ({ answers: Object.fromEntries(exercise.questions.map(question => [question.id, answer(question)])) });
  const wrong = assessment(question => (question.correct + 1) % question.options.length);
  const failed = await rep('training-update', { courseId: course.id, assessment: wrong });
  assert.equal(failed.result.assessment.score, 0);
  assert.equal(failed.result.assessment.passed, false);
  assert.ok(failed.result.assessment.answers.every(answer => answer.correct === false && answer.explanation));
  await rep('training-update', { courseId: course.id }, 409);
  const passedAt = f.advance();
  const mastered = await rep('training-update', { courseId: course.id, assessment: assessment(question => question.correct) });
  assert.equal(mastered.result.assessment.score, exercise.questions.length);
  assert.equal(mastered.progress.assessments[course.id].passedAt, passedAt);
  f.advance();
  const retried = await rep('training-update', { courseId: course.id, assessment: wrong });
  assert.equal(retried.progress.assessments[course.id].passed, false);
  assert.equal(retried.progress.assessments[course.id].passedAt, passedAt);
  await rep('training-update', { courseId: course.id }, 409);

  for (const task of exercise.practice) {
    const checked = task.checklist.map((_, index) => index);
    const practice = { id: task.id, checked: checked.slice(1) };
    const partial = await rep('training-update', { courseId: course.id, practice });
    assert.equal(partial.progress.practice[course.id][task.id].completedAt, null);
    await rep('training-update', { courseId: course.id }, 409);
    await rep('training-update', { courseId: course.id, practice: { ...practice, checked } });
  }
  const completedAt = f.advance();
  const { progress: completed } = await rep('training-update', { courseId: course.id });
  assert.equal(completed.completed[course.id], completedAt);
  f.advance();
  assert.deepEqual((await rep('training-update', { courseId: course.id })).progress, completed);

  f.reopen();
  assert.deepEqual((await rep('training-progress')).progress, completed);
  assert.deepEqual((await owner('training-progress', { userId: 'any-rep' })).progress, empty);
});

test('training updates reject invalid evidence and apply plan deltas without losing lesson visits', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('login', { code: ownerCode });
  const { catalog } = await owner('training-progress');
  const [firstCourse, secondCourse, thirdCourse] = catalog.courses;
  const { id: first, sections: [firstLesson] } = firstCourse;
  const { id: second, sections: [secondLesson] } = secondCourse;
  const { id: third } = thirdCourse;
  await owner('training-update', { courseId: '__proto__' }, 400);
  await owner('training-update', { courseId: first, sectionId: 'unknown' }, 400);
  await owner('training-update', { planChanges: { add: ['unknown'] } }, 400);
  await owner('training-update', { planChanges: { add: [first], remove: [first] } }, 400);
  await owner('training-update', { courseId: first, assessment: { answers: {} } }, 400);
  const task = catalog.exercises[first].practice[0];
  await owner('training-update', { courseId: first, practice: { id: task.id, checked: [0, 0] } }, 400);
  await owner('training-update', { courseId: first, practice: { id: task.id, checked: [task.checklist.length] } }, 400);
  await owner('training-update', { planChanges: { add: [first, second] } });
  await Promise.all([
    owner('training-update', { courseId: first, sectionId: firstLesson.id, planChanges: { remove: [first] } }),
    owner('training-update', { courseId: second, sectionId: secondLesson.id, planChanges: { add: [third, second] } }),
  ]);
  const { progress } = await owner('training-progress');
  assert.deepEqual(progress.plan, [second, third]);
  assert.deepEqual(progress.completed, {});
  assert.deepEqual(progress.visitedSections, { [first]: [firstLesson.id], [second]: [secondLesson.id] });
});

test('saved completions, lesson checkpoints and plan from the previous course player still work', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('login', { code: ownerCode });
  const { catalog } = await owner('training-progress');
  const [first, second] = catalog.courses;
  const sectionId = second.sections[0].id;
  const legacy = {
    completed: { [first.id]: f.advance() }, sections: { [second.id]: sectionId },
    currentCourseId: second.id, plan: [first.id, second.id],
  };
  f.seedLegacy(legacy);
  assert.deepEqual((await owner('training-progress')).progress, { ...empty, ...legacy, visitedSections: { [second.id]: [sectionId] } });
  f.advance();
  const { progress } = await owner('training-update', { courseId: first.id });
  assert.deepEqual(progress.completed, legacy.completed);
  assert.deepEqual(progress.sections, legacy.sections);
  assert.deepEqual(progress.plan, legacy.plan);
});

test('rehearsals grade private answers and retain best and latest scores separately', async t => {
  const f = fixture(t);
  const owner = f.session();
  await owner('login', { code: ownerCode });
  const { catalog } = await owner('training-progress');
  assert.ok(catalog.scenarios.length >= 2);
  for (const scenario of catalog.scenarios) {
    assert.ok(scenario.stages.length);
    for (const stage of scenario.stages) {
      assert.equal(Object.hasOwn(stage, 'correct'), false);
      assert.ok(stage.options.every(option => typeof option.label === 'string' && !Object.hasOwn(option, 'feedback')));
    }
  }
  const scenario = trainingScenarios[0];
  const scenarioAttempt = option => ({
    scenarioId: scenario.id,
    answers: Object.fromEntries(scenario.stages.map(stage => [stage.id, option(stage)])),
  });
  await owner('training-update', { scenarioAttempt: { scenarioId: scenario.id, answers: {} } }, 400);
  const win = scenarioAttempt(stage => stage.correct);
  await owner('training-update', { scenarioAttempt: win, courseId: catalog.featuredCourseId }, 400);
  const bestAt = f.advance();
  const { progress, scenarioResult } = await owner('training-update', { scenarioAttempt: win });
  const total = scenario.stages.length;
  assert.deepEqual(scenarioResult, {
    scenarioId: scenario.id, correct: total, total, percent: 100, passed: true,
    feedback: scenario.stages.map(stage => ({
      stageId: stage.id, correct: true, feedback: stage.options[stage.correct].feedback,
    })),
  });
  const best = { correct: total, total, percent: 100, passed: true, attemptedAt: bestAt };
  assert.deepEqual(progress, { ...empty, scenarios: { [scenario.id]: { latest: best, best } } });
  const latestAt = f.advance();
  const loss = scenarioAttempt(stage => (stage.correct + 1) % stage.options.length);
  const result = await owner('training-update', { scenarioAttempt: loss });
  assert.ok(result.scenarioResult.feedback.every(stage => stage.correct === false && Boolean(stage.feedback)));
  assert.deepEqual(result.progress.scenarios[scenario.id], {
    best, latest: { correct: 0, total, percent: 0, passed: false, attemptedAt: latestAt },
  });
  f.reopen();
  assert.deepEqual((await owner('training-progress')).progress, result.progress);
});

test('the practical requires an active rep, coursework, a passed scenario and an owner-observed visit', async t => {
  const f = fixture(t), owner = f.session(), rep = f.session();
  await owner('login', { code: ownerCode });
  const email = 'field@example.test';
  const { code, agent } = await owner('create-agent', { name: 'Field Rep', email, states: ['CT'] });
  await rep('login', { code, email });
  const { catalog, field } = await rep('training-progress');
  const checked = catalog.fieldRubric.map(row => row.id);
  const attempt = { repId: String(agent.id), revision: 0, checked, note: 'Observed a fictional shop visit.' };
  assert.equal(field.canReview, false);
  await rep('training-field-candidates', {}, 403);
  await rep('training-field-review', attempt, 403);
  await owner('training-field-review', { ...attempt, repId: 'owner' }, 404);
  await owner('training-field-review', attempt, 409);
  for (const id of field.remaining) {
    const course = catalog.courses.find(course => course.id === id);
    for (const section of course.sections) await rep('training-update', { courseId: id, sectionId: section.id });
    const exercise = trainingCourseExercises[id];
    const answers = Object.fromEntries(exercise.questions.map(q => [q.id, q.correct]));
    await rep('training-update', { courseId: id, assessment: { answers } });
    for (const task of exercise.practice) await rep('training-update', { courseId: id, practice: { id: task.id, checked: task.checklist.map((_, i) => i) } });
    await rep('training-update', { courseId: id });
  }
  await owner('training-field-review', attempt, 409);
  const scenario = trainingScenarios.find(s => s.id === 'shop-counter');
  const answers = Object.fromEntries(scenario.stages.map(s => [s.id, s.correct]));
  await rep('training-update', { scenarioAttempt: { scenarioId: scenario.id, answers } });
  const { candidates } = await owner('training-field-candidates');
  assert.equal(candidates.find(row => row.id === attempt.repId).ready, true);
  await owner('training-field-review', { ...attempt, checked: ['invented'] }, 400);
  await owner('training-field-review', { ...attempt, note: ' ' }, 400);
  const first = await owner('training-field-review', { ...attempt, checked: checked.slice(0, 4) });
  assert.equal(first.review.passed, false);
  assert.equal(first.review.revision, 1);
  await owner('training-field-review', attempt, 409);
  const second = await owner('training-field-review', { ...attempt, revision: 1, note: 'Asked the buyer to review and sign. Recorded the decision and handoff.' });
  assert.equal(second.review.passed, true);
  f.reopen();
  assert.deepEqual((await rep('training-progress')).progress.fieldReview, second.review);
  assert.equal((await owner('training-progress')).field.review, null);
});
