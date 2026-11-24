import { digest, HttpError, metadata, STATES, text, visible } from './model.mjs';
import { progressProjection } from './pipeline.mjs';
import { stateAllowed } from './territory-access.mjs';

const actions = new Set(['sales-daily-plan', 'set-sales-daily-plan-task']);
const closed = new Set(['active', 'not_interested', 'do_not_contact']);
const agreementWaits = new Set(['delivery', 'signature', 'payment']);
const priorities = new Map([['follow-up', 0], ['meeting', 1], ['reply', 2], ['agreement', 3], ['outreach', 4]]);
const calendarDay = 86400000;
const calendarHorizon = 181 * calendarDay;

function dateFormatter(value) {
  const timeZone = text(value ?? '', 128);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    throw new HttpError(400, 'Choose a valid calendar time zone.');
  }
}

function planDate(formatter, timestamp) {
  const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dueDate(value) {
  const date = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const timestamp = Date.parse(date + 'T12:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : '';
}

function grouped(rows, keyFor) {
  const byOffice = new Map();
  for (const row of rows) {
    const key = String(keyFor(row));
    if (!byOffice.has(key)) byOffice.set(key, []);
    byOffice.get(key).push(row);
  }
  return byOffice;
}

function activeRecords(user, db, now) {
  const offices = db.list('offices').filter(row => visible(user, row));
  const events = grouped(db.list('events'), row => row.assigned_to);
  const enrollments = grouped(db.list('enrollments'), row => metadata(row).leadId);
  return offices.map(office => {
    const id = String(office.id);
    return { office, id, dueOn: dueDate(office.meeting_date),
      progress: progressProjection(office, events.get(id), enrollments.get(id), now) };
  });
}

function officeTask({ office, id, progress, dueOn }, date) {
  if (closed.has(progress.stage) || (dueOn && dueOn > date)) return null;
  let kind, title;
  if (dueOn) { kind = 'follow-up'; title = 'Follow up with ' + office.town; }
  else if (progress.lastReply && progress.waitingOn === 'us') { kind = 'reply'; title = 'Respond to ' + office.town; }
  else if (progress.contract.prepared && agreementWaits.has(progress.waitingOn)) { kind = 'agreement'; title = 'Review agreement for ' + office.town; }
  else if (!progress.lastContact && ['new', 'researching'].includes(progress.stage)) {
    kind = 'outreach';
    title = 'Prepare an introduction for ' + office.town;
  } else return null;
  const fingerprint = digest(JSON.stringify([kind, dueOn, progress.context, progress.nextAction])).slice(0, 16);
  return { id: `office:${id}:${kind}:${fingerprint}`, title, detail: progress.nextAction,
    kind, view: kind === 'agreement' ? 'contracts' : 'pipeline', officeId: id, ...(dueOn ? { dueOn } : {}) };
}

function workflowTasks(user, hasAccounts) {
  const tasks = [
    { id: 'workflow:prospects', kind: 'prospecting', title: hasAccounts ? 'Review saved prospects' : 'Add a prospect',
      detail: 'Open your prospects to review organizations or save a new lead.', view: 'prospects' },
    { id: 'workflow:pipeline', kind: 'review', title: 'Review your pipeline',
      detail: 'Check assignments, account stages, and follow-up dates.', view: 'pipeline' },
  ];
  if (STATES.some(region => stateAllowed(user, region))) {
    tasks.unshift({ id: 'workflow:research', kind: 'research', title: 'Find new opportunities',
      detail: 'Look for businesses by town or ZIP code in your territory.', view: 'discover' });
    tasks.push({ id: 'workflow:territories', kind: 'territory', title: 'Check territory coverage',
      detail: 'Review county leads and saved facility assignments before outreach.', view: 'territories' });
  }
  return tasks;
}

function calendarSnapshot(user, store, date, now, formatter) {
  if (!store) return { hasCalendar: false, meetingsSet: 0, schedule: [], tasks: [] };
  // The displayed day may begin before or after UTC midnight. Filter on the same
  // local day used for follow-ups, and keep upcoming confirmed meetings for the count.
  const utcMidnight = Date.parse(date + 'T00:00:00Z');
  const confirmed = store.range(user.id, utcMidnight - calendarDay, now + calendarHorizon).filter(row =>
    row.host === user.id && row.status === 'confirmed' && Number.isSafeInteger(row.start) && Number.isSafeInteger(row.end) &&
    row.end > row.start);
  const timeZone = formatter.resolvedOptions().timeZone;
  const schedule = confirmed.filter(row => planDate(formatter, row.start) === date).map(row => {
    const company = row.client?.company?.trim();
    return { type: 'appointment', view: 'calendar', appointmentId: row.id, title: company || row.title, detail: company ? row.title : '',
      start: new Date(row.start).toISOString(), end: new Date(row.end).toISOString(), dueOn: date, timeZone };
  }).sort((a, b) => a.start.localeCompare(b.start));
  const tasks = schedule.map(({ appointmentId, title, detail, start, end, dueOn, view }) => ({
    id: `appointment:${appointmentId}:${digest(start + '/' + end).slice(0, 16)}`, kind: 'meeting', view, appointmentId, start, dueOn,
    title: (detail ? 'Review appointment with ' : 'Review ') + title, detail,
  }));
  return { hasCalendar: true, meetingsSet: confirmed.filter(row => row.end > now).length, schedule, tasks };
}

function snapshot(user, db, date, now, formatter) {
  const calendar = calendarSnapshot(user, db.booking, date, now, formatter);
  const records = activeRecords(user, db, now);
  const open = records.filter(({ progress }) => !closed.has(progress.stage));
  const planned = [...open.map(row => officeTask(row, date)).filter(Boolean), ...calendar.tasks];
  planned.sort((a, b) => priorities.get(a.kind) - priorities.get(b.kind) ||
    (a.dueOn || date).localeCompare(b.dueOn || date) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title));
  if (planned.length < 3) planned.push(...workflowTasks(user, records.length > 0));
  const completed = db.dailyPlanCompletions(user.id, date);
  const tasks = planned.map(task => ({ ...task, completed: completed.has(task.id) }));

  const dated = open.filter(row => row.dueOn && row.dueOn >= date);
  const followUps = dated.filter(row => row.dueOn === date).map(({ office, id, dueOn, progress }) => ({
    type: 'follow-up', officeId: id, title: office.town, detail: progress.nextAction, dueOn, view: 'pipeline',
  })).sort((a, b) => a.title.localeCompare(b.title));
  const counts = {
    totalProspects: records.length,
    inOutreach: open.filter(({ progress }) => !progress.contract.prepared && (progress.lastContact || progress.lastReply)).length,
    meetingsSet: calendar.meetingsSet,
    followUpsScheduled: dated.length,
    contractsPending: open.filter(({ progress }) => progress.contract.prepared && agreementWaits.has(progress.waitingOn)).length,
  };
  const recommendations = tasks.filter(task => !task.completed).slice(0, 3).map(({ title, detail, view, officeId, appointmentId }) =>
    ({ title, detail, view, ...(officeId ? { officeId } : {}), ...(appointmentId ? { appointmentId } : {}) }));
  return { date, tasks, schedule: [...calendar.schedule, ...followUps], counts, recommendations, hasCalendar: calendar.hasCalendar };
}

export function salesDailyPlan(db, clock = Date.now) {
  function dispatch(user, action, input) {
    if (!['owner', 'agent'].includes(user.role)) throw new HttpError(403, 'Use a sales workspace account to view your daily plan.');
    const now = clock(), formatter = dateFormatter(input.timeZone), date = planDate(formatter, now);
    if (action === 'sales-daily-plan') return snapshot(user, db, date, now, formatter);
    if (input.date !== date) throw new HttpError(409, 'The date changed. Reload today’s action plan.');
    const taskId = text(input.taskId, 120, true);
    if (typeof input.completed !== 'boolean') throw new HttpError(400, 'Set whether this plan task is complete.');
    let plan = snapshot(user, db, date, now, formatter);
    const task = plan.tasks.find(item => item.id === taskId);
    if (!task) throw new HttpError(409, 'The task changed. Reload today’s action plan.');
    if (task.completed !== input.completed) {
      db.setDailyPlanCompletion(user.id, date, taskId, input.completed);
      plan = snapshot(user, db, date, now, formatter);
    }
    return plan;
  }
  return { actions, dispatch };
}
