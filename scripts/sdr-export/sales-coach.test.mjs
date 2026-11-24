import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { salesDailyPlan } from '../../sales/sales-daily-plan.mjs';
import { knowledgeFor } from './coach-knowledge.mjs';
import { salesCoach } from './sales-coach.mjs';
import { sqliteStore } from './sqlite.mjs';

const rep = { id: '11', role: 'agent', name: 'Rep One', states: ['CT'] };
const teammate = { ...rep, id: '12', name: 'Rep Two' };
const timeZone = 'America/New_York';
const clock = () => Date.parse('2026-11-23T16:00:00Z');
const response = data => ({ ok: true, json: async () => ({ message: { content: JSON.stringify(data) } }) });
const prompt = (question, lastId = 0) => ({ question, lastId, requestId: randomUUID(), timeZone });

function setup(t, fetcher) {
  const directory = mkdtempSync(join(tmpdir(), 'sales-coach-'));
  const db = sqliteStore(join(directory, 'sales.sqlite'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const staff = salesCoach(db, salesDailyPlan(db, clock), { fetcher, demo: true });
  const office = (town, assigned_to, state = 'CT', status = 'new') =>
    db.create('offices', { town, assigned_to, locality: 'Hartford', state, status, notes: '{}' });
  return { db, office, call: (user, action, input) => staff.dispatch(user, action, { timeZone, ...input }) };
}

test('model receives only permitted accounts and authored lessons, and a question cannot mutate records', async t => {
  let context, schema;
  const { call, office, db } = setup(t, async (_url, init) => {
    const body = JSON.parse(init.body);
    context = JSON.parse(body.messages[1].content); schema = body.format;
    return response({ action: 'activity', recordId: '300', fields: { note: 'Invented' }, answer: 'Open the TinkyStroke bedside lesson.', sources: [] });
  });
  office('Harbor View', rep.id); office('Private Juniper', teammate.id); office('Outside territory', rep.id, 'NY');
  const { turn } = await call(rep, 'coach-ask', { ...prompt('How do I practice the TinkyStroke bedside walkthrough with Harbor View?'), memberId: teammate.id });
  assert.deepEqual(context.workspaceContext.accounts.map(a => a.name), ['Harbor View']);
  assert.ok(context.sourceGuides.some(s => s.id === 'learn-tinkystroke-demo-choose-setting' && /select a relevant tile/i.test(s.content)));
  assert.doesNotMatch(JSON.stringify(context), /Private Juniper|Outside territory/);
  assert.equal(schema.properties.action, undefined);
  assert.equal(turn.draft, null);
  assert.equal(db.list('events').length, 0);
  assert.equal((await call(teammate, 'coach-state', { memberId: rep.id })).turns.length, 0);
  await assert.rejects(call({ ...rep, role: 'location' }, 'coach-state'), { status: 403 });
});

test('activity stays a draft, wrong account IDs cannot bind, and blocked outreach yields no review action', async t => {
  let model;
  const { call, office, db } = setup(t, async () => response(model));
  const selected = office('Harbor View', rep.id);
  const hidden = office('Juniper Center', teammate.id);
  office('Dormant Center', rep.id, 'CT', 'do_not_contact');
  model = { action: 'activity', recordId: String(hidden.id), fields: { kind: 'call', note: 'Paraphrase.' }, answer: 'I logged it.', sources: [] };
  const first = (await call(rep, 'coach-ask', prompt('Log a call on Harbor View. My exact note is: Spoke with reception.'))).turn;
  assert.equal(first.draft.recordId, String(selected.id));
  assert.equal(first.draft.fields.note, 'Spoke with reception.');
  assert.doesNotMatch(first.answer, /I logged/i);
  assert.equal(db.list('events').length, 0);
  const second = (await call(rep, 'coach-ask', prompt('Log a call on Juniper Center.', first.id))).turn;
  assert.equal(second.draft, null);
  model = { action: 'followup', recordId: String(selected.id), fields: { nextFollowup: '2026-12-04' }, answer: 'Scheduled!', sources: [] };
  const third = (await call(rep, 'coach-ask', prompt('Schedule a follow-up with Dormant Center tomorrow', second.id))).turn;
  assert.equal(third.draft, null);
  const fourth = (await call(rep, 'coach-ask', prompt('Schedule a follow-up with Harbor View tomorrow', third.id))).turn;
  assert.equal(fourth.draft.fields.nextFollowup, '2026-11-24');
  assert.equal(db.get('offices', selected.id).meeting_date, undefined);
});

test('personal goal counts its owner’s saved activity in the selected time zone and rejects stale edits', async t => {
  const { db, call } = setup(t, async () => { throw new Error('Offline'); });
  for (const [actorId, at] of [[rep.id, '2026-11-24T01:00:00Z'], [rep.id, '2026-11-23T02:00:00Z'], [teammate.id, '2026-11-24T01:00:00Z']]) {
    db.create('events', { notes: JSON.stringify({ action: 'call', actorId, at }) });
  }
  const goal = { metric: 'calls', target: 3, start: '2026-11-23', end: '2026-11-23', focus: 'Discovery', revision: 0 };
  const saved = (await call(rep, 'coach-goal', goal)).goal;
  assert.equal(saved.count, 1); assert.equal(saved.revision, 1);
  await assert.rejects(call(rep, 'coach-goal', goal), { status: 409 });
  await assert.rejects(call(rep, 'coach-goal', { ...goal, timeZone: 'invalid', revision: 1 }), { status: 400 });
  await assert.rejects(call(rep, 'coach-goal', { ...goal, end: '2026-02-30', revision: 1 }), { status: 400 });
  assert.equal((await call(teammate, 'coach-state', { memberId: rep.id })).goal, null);
  const { turn } = await call(rep, 'coach-ask', prompt('How am I doing on my goal?'));
  assert.equal(turn.mode, 'guide'); assert.equal(turn.draft, null);
  assert.match(turn.answer, /1 of 3/); assert.ok(turn.sources.length);
});

test('simultaneous and retried requests produce a single private turn', async t => {
  let resolveResponse, invocations = 0;
  const { call } = setup(t, () => { invocations++; return new Promise(resolve => { resolveResponse = resolve; }); });
  const input = prompt('How should I start today?');
  const pending = call(rep, 'coach-ask', input), retry = call(rep, 'coach-ask', input);
  await assert.rejects(call(rep, 'coach-ask', prompt('Which demo?')), { status: 409 });
  resolveResponse(response({ answer: 'Open Today’s Plan.', sources: ['today'] }));
  const [one, two] = await Promise.all([pending, retry]);
  assert.deepEqual(one, two); assert.deepEqual(await call(rep, 'coach-ask', input), one);
  assert.equal(invocations, 1);
  await assert.rejects(call(rep, 'coach-ask', prompt('What next?')), { status: 409 });
  const next = await call(rep, 'coach-ask', prompt('Send my email draft now', one.turn.id));
  assert.equal(next.turn.mode, 'workflow'); assert.equal(next.turn.sources[0].href, '#view=email');
  assert.equal(invocations, 1);
  assert.deepEqual((await call(rep, 'coach-state', { before: next.turn.id })).turns, [one.turn]);
});

test('curriculum links reference the selected lesson and only supplied prospect details are proposed', async t => {
  const lessons = knowledgeFor('Present the TinkyStroke Demo run a bedside walkthrough', [], rep, true);
  assert.ok(lessons.some(item => item.href === '#view=training&course=tinkystroke-demo&lesson=choose-setting'));
  const { call, db } = setup(t, async () => response({ action: 'prospect', answer: 'Saved it.', sources: [], fields: {
    name: 'Meadow Library', address: '10 Fictional Rd', city: 'Hartford', state: 'CT', contact: 'Invented Person', email: 'unsupplied@example.test' } }));
  const { turn } = await call(rep, 'coach-ask', prompt('Add prospect Meadow Library in Hartford, CT.'));
  assert.deepEqual(turn.draft.fields, { name: 'Meadow Library', city: 'Hartford', state: 'CT' });
  assert.equal(db.list('offices').length, 0);
});

test('chat goal proposals keep spoken quantities and calendar weeks while requiring a review', async t => {
  const { call } = setup(t, async () => response({ answer: 'Done', sources: [], action: 'goal', fields: {
    metric: 'prospects', target: 0, start: '2026-12-01', end: '2026-12-15' } }));
  const { turn } = await call(rep, 'coach-ask', prompt('Set my goal to add six prospects this week.'));
  assert.deepEqual(turn.draft.fields, { metric: 'prospects', target: '6', start: '2026-11-23', end: '2026-11-29' });
  assert.equal((await call(rep, 'coach-state')).goal, null);
});

test('meeting and agreement goals count confirmed, credited records within the goal period', async t => {
  const { db, call } = setup(t);
  const when = clock();
  for (const [host, status, start] of [[rep.id, 'confirmed', when], [rep.id, 'cancelled', when], [teammate.id, 'confirmed', when], [rep.id, 'confirmed', when + 86400000]]) {
    db.booking.put({ id: randomUUID(), requestKey: randomUUID(), host, status, start, end: start + 1200000 });
  }
  const base = { target: 3, start: '2026-11-23', end: '2026-11-23' };
  const first = await call(rep, 'coach-goal', { ...base, metric: 'meetings', revision: 0 });
  assert.equal(first.goal.count, 1);
  for (const [agentId, signature, acceptedAt] of [[rep.id, 'Buyer', when], [rep.id, '', when], [teammate.id, 'Buyer', when], [rep.id, 'Buyer', when + 86400000]]) {
    db.create('enrollments', { notes: JSON.stringify({ agentId, signature, acceptedAt: new Date(acceptedAt).toISOString() }) });
  }
  const second = await call(rep, 'coach-goal', { ...base, metric: 'agreements', revision: 1 });
  assert.equal(second.goal.count, 1);
});
