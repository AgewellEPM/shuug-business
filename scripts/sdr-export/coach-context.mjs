import { HttpError, metadata, text, visible } from '../../sales/model.mjs';
import { officeOutreachBlocked } from '../../sales/outreach-preferences.mjs';
import { progressProjection } from '../../sales/pipeline.mjs';

export const goalMetrics = { prospects: 'Prospects added', meetings: 'Meetings scheduled', calls: 'Calls logged', agreements: 'Agreements signed' };
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(value);
}
function dateIn(zone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    return at => {
      const bits = Object.fromEntries(formatter.formatToParts(at).map(p => [p.type, p.value]));
      return [bits.year, bits.month, bits.day].join('-');
    };
  } catch { throw new HttpError(400, 'Choose a valid time zone.'); }
}
export function readGoalInput(input) {
  if (!Object.hasOwn(goalMetrics, input.metric) || !Number.isSafeInteger(input.target) || input.target < 1 || input.target > 10000) throw new HttpError(400, 'Choose a goal metric and a target from 1 to 10,000.');
  if (!validDate(input.start) || !validDate(input.end) || input.end < input.start) throw new HttpError(400, 'Choose a start date and a deadline on or after it.');
  const timeZone = text(input.timeZone || 'UTC', 100);
  dateIn(timeZone);
  return { metric: input.metric, target: input.target, start: input.start, end: input.end, focus: text(input.focus || '', 240), timeZone };
}
export function goalProgress(db, user, goal) {
  if (!goal) return null;
  const day = dateIn(goal.timeZone);
  const within = value => {
    const timestamp = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(timestamp)) return false;
    const date = day(timestamp);
    return date >= goal.start && date <= goal.end;
  };
  let count;
  if (goal.metric === 'meetings') {
    const from = Date.parse(goal.start) - 86400000, to = Date.parse(goal.end) + 2 * 86400000;
    count = db.booking.range(user.id, from, to).filter(row => row.host === user.id && row.status === 'confirmed' && within(row.start)).length;
  } else if (goal.metric === 'calls') {
    count = db.list('events').filter(row => {
      const facts = metadata(row);
      if (facts.actorId !== user.id) return false;
      if (facts.action === 'call') return within(facts.at || row.created_at);
      return facts.action === 'progress_recorded' && facts.detail?.kind === 'contacted' && facts.detail.channel === 'call' && within(facts.detail.occurredAt || facts.at);
    }).length;
  } else if (goal.metric === 'agreements') {
    count = db.list('enrollments').filter(row => {
      const info = metadata(row);
      return String(info.agentId || row.assigned_to) === user.id && info.signature && within(info.acceptedAt);
    }).length;
  } else {
    count = db.list('offices').filter(row => String(row.assigned_to) === user.id && visible(user, row) && within(row.created_at)).length;
  }
  return { ...goal, label: goalMetrics[goal.metric], count };
}

const norm = v => String(v || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function accountContext(db, user, question, history, recommendations, openOfficeId) {
  const phrase = norm(question), tokens = new Set(phrase.split(' ').filter(t => t.length > 2));
  const recent = norm(history.slice(-2).map(turn => turn.question).join(' '));
  const urgent = new Set(recommendations.map(task => String(task.officeId)));
  const eligible = db.list('offices').filter(row => visible(user, row));
  const score = row => {
    const name = norm(row.town);
    let value = urgent.has(String(row.id)) ? 2 : 0;
    if (String(row.id) === openOfficeId) value += 90;
    if (name && phrase.includes(name)) value += 100;
    if (name && recent.includes(name)) value += 12;
    for (const word of name.split(' ')) if (tokens.has(word)) value += 8;
    if (tokens.has(norm(row.locality))) value += 3;
    return value;
  };
  const rows = eligible.map(row => ({ row, score: score(row) }))
    .sort((a, b) => b.score - a.score || String(b.row.updated_at).localeCompare(String(a.row.updated_at))).slice(0, 10);
  const events = new Map(rows.map(({ row }) => [String(row.id), []]));
  for (const event of db.list('events')) {
    events.get(String(event.assigned_to))?.push(event);
  }
  const contracts = new Map(rows.map(({ row }) => [String(row.id), []]));
  for (const agreement of db.list('enrollments')) contracts.get(String(metadata(agreement).leadId))?.push(agreement);
  return rows.map(({ row }) => {
    const id = String(row.id), history = events.get(id);
    const progress = progressProjection(row, history, contracts.get(id));
    const recentActivity = history.flatMap(event => {
      const info = metadata(event);
      if (!['note','call','meeting','email','progress_recorded','care_pilot'].includes(info.action)) return [];
      const note = typeof info.detail === 'string' ? info.detail : info.detail?.note;
      return note ? [{ type: info.action, date: event.created_at?.slice(0, 10), note: note.slice(0, 220) }] : [];
    }).slice(-3);
    return { id, name: row.town, city: row.locality, state: row.state, stage: progress.stage,
      nextFollowup: progress.nextDue, nextAction: progress.nextAction.slice(0, 260), waitingOn: progress.waitingOn,
      agreement: { prepared: progress.contract.prepared, signed: progress.contract.signed, signedAt: progress.contract.signedAt },
      outreachAllowed: !officeOutreachBlocked(row), recentActivity };
  });
}
