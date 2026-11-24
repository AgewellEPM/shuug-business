import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sqliteStore } from '../scripts/sdr-export/sqlite.mjs';
import { createHandler } from './handler.mjs';
import { digest } from './model.mjs';
import { salesDailyPlan } from './sales-daily-plan.mjs';

const origin = 'http://127.0.0.1:8740';
const ownerCode = 'test-workspace-owner';
const east = { timeZone: 'America/New_York' };
const day = '2026-11-23';

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'sdr-daily-plan-'));
  const filename = join(folder, 'sdr.sqlite');
  const db = sqliteStore(filename);
  t.after(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });
  let now = Date.parse('2026-11-24T04:30:00Z');
  const clock = () => now;
  const app = createHandler({ GIGTAX_SALES_ORIGIN: origin, GIGTAX_SALES_OWNER_HASH: digest(ownerCode),
    GIGTAX_SALES_SESSION_KEY: digest('test-workspace-session-key') }, db, { localHttp: true, salesTeam: true, dailyPlan: salesDailyPlan(db, clock) });
  function session() {
    let cookie;
    return async (action, body = {}, expected = 200) => {
      const response = { statusCode: 200, setHeader(name, value) {
        if (name === 'Set-Cookie') cookie = value.split(';')[0];
      }, end(body) { this.json = JSON.parse(body); } };
      await app({ method: 'POST', headers: { origin, 'content-type': 'application/json', cookie }, body: { action, ...body } }, response);
      assert.equal(response.statusCode, expected, response.json?.error);
      return response.json;
    };
  }
  function office(name, assignedTo, overrides = {}) {
    return db.create('offices', { town: name, locality: 'Hartford', state: 'CT', assigned_to: assignedTo, status: 'new',
      contact_email: 'private@example.test', ...overrides });
  }
  return { db, filename, session, office, clock, advance: () => { now += 3600000; } };
}

test('the action plan uses authorized due dates, contacts, and real pipeline milestones for a rep', async t => {
  const f = fixture(t), owner = f.session(), rep = f.session();
  await rep('sales-daily-plan', east, 401);
  await owner('login', { code: ownerCode });
  const email = 'rep@example.test';
  const { agent, code } = await owner('sales-team-invite', { name: 'Sales Rep', email, states: ['CT'] });
  await rep('login', { email, code });

  const today = f.office('Scheduled follow-up', agent.id, { meeting_date: day });
  const overdue = f.office('Overdue follow-up', agent.id, { meeting_date: '2026-11-20' });
  f.office('Scheduled later', agent.id, { meeting_date: '2026-11-24' });
  f.office('Other team member', 'owner', { meeting_date: day });
  f.office('Outside rep territory', agent.id, { state: 'MA', meeting_date: day });
  f.office('Do not call', agent.id, { status: 'do_not_contact', meeting_date: day });
  const replied = f.office('Reply received', agent.id, { status: 'replied' });
  f.db.create('events', { assigned_to: String(replied.id), notes: JSON.stringify({
    action: 'progress_recorded', detail: { kind: 'replied', occurredAt: '2026-11-23T15:00:00Z' },
  }) });
  const agreement = f.office('Waiting on signature', agent.id, { status: 'invited' });
  f.db.create('enrollments', { status: 'invited', notes: JSON.stringify({ leadId: String(agreement.id) }) });
  f.db.create('events', { assigned_to: String(agreement.id), notes: JSON.stringify({
    action: 'contract_delivery', delivery: {status: 'manual_sent', sentAt: '2026-11-23T15:00:00Z' },
  }) });
  const outreach = f.office('Needs an introduction', agent.id);

  const plan = await rep('sales-daily-plan', east);
  assert.equal(plan.date, day);
  assert.deepEqual(plan.tasks.map(task => [task.kind, task.officeId]), [
    ['follow-up', String(overdue.id)], ['follow-up', String(today.id)], ['reply', String(replied.id)],
    ['agreement', String(agreement.id)], ['outreach', String(outreach.id)],
  ]);
  assert.deepEqual(plan.schedule.map(entry => [entry.officeId, entry.dueOn, entry.view]), [[String(today.id), day, 'pipeline']]);
  assert.deepEqual(plan.counts, { totalProspects: 7, inOutreach: 1, meetingsSet: 0, followUpsScheduled: 2, contractsPending: 1 });
  assert.deepEqual(plan.recommendations.map(item => item.officeId), [String(overdue.id), String(today.id), String(replied.id)]);
  assert.doesNotMatch(JSON.stringify(plan), /private@example\.test|Other team member|Outside rep territory|Do not call/);
  const ownerPlan = await owner('sales-daily-plan', east);
  assert.equal(ownerPlan.counts.totalProspects, 9);
  assert.equal(ownerPlan.schedule.length, 3);
});

test('checkboxes persist per rep and day without changing pipeline stages or accepting stale tasks', async t => {
  const f = fixture(t), owner = f.session(), rep = f.session();
  await owner('login', { code: ownerCode });
  const email = 'first-rep@example.test';
  const { agent, code } = await owner('sales-team-invite', { name: 'First Rep', email });
  await rep('login', { email, code });

  const empty = await rep('sales-daily-plan', east);
  assert.equal(empty.counts.totalProspects, 0);
  assert.ok(empty.tasks.length >= 3);
  assert.ok(empty.tasks.every(task => !task.officeId && !task.completed));
  const taskId = empty.tasks[0].id;
  const change = { ...east, date: day, taskId, completed: true };
  await rep('set-sales-daily-plan-task', { ...change, taskId: 'unknown' }, 409);
  await rep('set-sales-daily-plan-task', { ...change, completed: 'true' }, 400);
  await rep('sales-daily-plan', { timeZone: 'Invalid/Zone' }, 400);
  const completed = await rep('set-sales-daily-plan-task', change);
  assert.equal(completed.tasks.find(task => task.id === taskId).completed, true);
  assert.deepEqual(await rep('set-sales-daily-plan-task', change), completed);
  assert.ok((await owner('sales-daily-plan', east)).tasks.every(task => !task.completed));
  assert.equal(f.db.list('offices').length, 0);

  const reopened = sqliteStore(f.filename);
  try {
    const persisted = salesDailyPlan(reopened, f.clock).dispatch({ ...agent, role: 'agent' }, 'sales-daily-plan', east);
    assert.deepEqual(persisted, completed);
  } finally { reopened.close(); }

  const unchecked = await rep('set-sales-daily-plan-task', { ...change, completed: false });
  assert.equal(unchecked.tasks.find(task => task.id === taskId).completed, false);
  await rep('set-sales-daily-plan-task', change);
  f.advance();
  const tomorrow = await rep('sales-daily-plan', east);
  assert.equal(tomorrow.date, '2026-11-24');
  assert.ok(tomorrow.tasks.every(task => !task.completed));
  await rep('set-sales-daily-plan-task', change, 409);
});

test('booked meetings appear for their own host and today’s local date without private booking details', async t => {
  const f = fixture(t), owner = f.session(), rep = f.session();
  await owner('login', { code: ownerCode });
  const email = 'calendar-rep@example.test';
  const { agent, code } = await owner('sales-team-invite', { name: 'Calendar Rep', email });
  await rep('login', { email, code });
  function appointment(id, host, start, status = 'confirmed') {
    return { id, host, title: 'Product demo', start: Date.parse(start), end: Date.parse(start) + 15 * 60_000, status,
      client: { company: id, name: 'Private Contact', email: 'private@example.test', phone: '555-0100', notes: 'Private notes' },
      answer: 'Private answer', manageURL: 'https://local.test/manage/secret-token', location: 'https://local.test/join/secret-token' };
  }
  const today = appointment('Hartford Recovery', agent.id, '2026-11-24T04:40:00Z');
  const later = appointment('Later Facility', agent.id, '2026-11-24T05:15:00Z');
  const cancelled = appointment('Cancelled Facility', agent.id, '2026-11-24T04:45:00Z', 'cancelled');
  const otherHost = appointment('Other Host Facility', 'owner', '2026-11-24T04:40:00Z');
  const rows = [today, later, cancelled, otherHost], calledHosts = [];
  f.db.booking = { range(host, start, end) {
    calledHosts.push(host);
    return rows.filter(row => row.start < end && row.end > start);
  } };
  const plan = await rep('sales-daily-plan', { ...east, host: 'owner' });
  assert.deepEqual(calledHosts, [agent.id]);
  assert.equal(plan.hasCalendar, true);
  assert.equal(plan.counts.meetingsSet, 2);
  assert.deepEqual(plan.schedule, [{
    type: 'appointment', view: 'calendar', appointmentId: today.id, title: 'Hartford Recovery', detail: 'Product demo',
    start: '2026-11-24T04:40:00.000Z', end: '2026-11-24T04:55:00.000Z', dueOn: day, timeZone: 'America/New_York',
  }]);
  assert.doesNotMatch(JSON.stringify(plan), /Private|private@example\.test|secret-token|Other Host Facility|Later Facility|Cancelled Facility/);
  const meeting = plan.tasks.find(task => task.kind === 'meeting');
  assert.equal(meeting.appointmentId, today.id);
  assert.equal(plan.recommendations[0].appointmentId, today.id);

  const change = { ...east, date: day, taskId: meeting.id, completed: true };
  const checked = await rep('set-sales-daily-plan-task', change);
  assert.equal(checked.tasks.find(task => task.id === meeting.id).completed, true);
  assert.equal(today.status, 'confirmed');
  today.start += 60_000;
  today.end += 60_000;
  const rescheduled = await rep('sales-daily-plan', east);
  assert.equal(rescheduled.tasks.find(task => task.kind === 'meeting').completed, false);
  await rep('set-sales-daily-plan-task', change, 409);

  const ownerPlan = await owner('sales-daily-plan', east);
  assert.deepEqual(ownerPlan.schedule.map(item => item.appointmentId), [otherHost.id]);
  assert.equal(ownerPlan.counts.meetingsSet, 1);
});
