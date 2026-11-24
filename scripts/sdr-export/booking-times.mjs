import { HttpError, text } from '../../sales/model.mjs';
import { singleEmail } from '../../sales/mail-provider.mjs';

export const minute = 60_000;
export const day = 1440 * minute;
export const meetingTypes = { appointment: 'Sales appointment', demo: 'Product demo' };
const formatters = new Map();

export function timeZone(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_+/-]{1,80}$/.test(value)) throw new HttpError(400, 'Choose a valid time zone.');
  if (!formatters.has(value)) {
    try {
      formatters.set(value, new Intl.DateTimeFormat('sv-SE', { timeZone: value, year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
    } catch { throw new HttpError(400, 'Choose a valid time zone.'); }
  }
  return value;
}

export function localTime(ms, zone) {
  return formatters.get(timeZone(zone)).format(ms);
}
function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(value + 'T');
}
function bounded(value, min, max, step, label) {
  if (!Number.isInteger(value) || value < min || value > max || value % step) throw new HttpError(400, 'Check ' + label + '.');
  return value;
}
function timeValue(clock) {
  if (typeof clock !== 'string' || !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(clock)) throw new HttpError(400, 'Set hours in 15-minute increments.');
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
}
export function defaultPolicy(member, defaultZone) {
  return { revision: 0, published: member.id === 'owner', name: member.id === 'owner' ? 'Tinky Team' : member.name,
    email: member.email || '', zone: defaultZone, hours: Array.from({ length: 7 }, (_, i) => i > 0 && i < 6 ? ['09:00', '17:00'] : null),
    durations: { appointment: 30, demo: 45 }, buffer: 0, notice: 2, horizon: 60, daysOff: [], question: '', location: '' };
}
export function policyInput(value) {
  if (typeof value.published !== 'boolean' || !Array.isArray(value.hours) || value.hours.length !== 7 ||
      !Array.isArray(value.daysOff) || value.daysOff.length > 366 || !value.daysOff.every(dateKey)) {
    throw new HttpError(400, 'Check your scheduling hours and dates off.');
  }
  const hours = value.hours.map(range => {
    if (range === null) return null;
    if (!Array.isArray(range) || range.length !== 2 || timeValue(range[0]) >= timeValue(range[1])) {
      throw new HttpError(400, 'Each working day needs an opening time before its closing time.');
    }
    return range;
  });
  const durations = Object.fromEntries(Object.keys(meetingTypes).map(type => [type,
    bounded(value.durations?.[type], 0, 180, 15, 'the meeting duration')]));
  if (value.published && (!hours.some(Boolean) || !Object.values(durations).some(Boolean))) throw new HttpError(400, 'Choose working hours and a meeting type to accept bookings.');
  return { published: value.published, name: text(value.name, 120, true), email: value.email ? singleEmail(value.email) : '',
    zone: timeZone(value.zone), hours, durations, buffer: bounded(value.buffer, 0, 120, 5, 'the time between meetings'),
    notice: bounded(value.notice, 0, 168, 1, 'the minimum notice'), horizon: bounded(value.horizon, 1, 180, 1, 'the booking window'),
    daysOff: [...new Set(value.daysOff)].sort(), question: text(value.question || '', 180), location: text(value.location || '', 600) };
}

export function monthWindow(month, now, horizon) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Choose a calendar month.');
  const start = Date.parse(month + '-01T00:00:00Z'), next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return [Math.max(start - day, now), Math.min(+next + day, now + horizon * day)];
}

export function openSlot(policy, type, start, now, conflicts) {
  const length = Object.hasOwn(meetingTypes, type) && policy.durations[type];
  if (!length || !Number.isSafeInteger(start) || start % (15 * minute) || start <= now ||
      start < now + policy.notice * 60 * minute || start > now + policy.horizon * day) return false;
  const end = start + length * minute;
  const local = localTime(start, policy.zone), date = local.slice(0, 10), clock = local.slice(11, 16);
  const hours = policy.hours[new Date(date + 'T12:00:00Z').getUTCDay()];
  if (!hours || policy.daysOff.includes(date) || clock < hours[0]) return false;
  const finish = localTime(end, policy.zone);
  if (!finish.startsWith(date) || finish.slice(11, 16) > hours[1] ||
      Date.parse(finish.replace(' ', 'T') + ':00Z') - Date.parse(local.replace(' ', 'T') + ':00Z') !== length * minute) return false;
  return !conflicts.some(event => {
    const gap = Math.max(policy.buffer, event.buffer || 0) * minute;
    return start < event.end + gap && end > event.start - gap;
  });
}

export function monthSlots(policy, type, month, zone, now, conflicts) {
  const [start, end] = monthWindow(month, now, policy.horizon), step = 15 * minute, days = {};
  for (let instant = Math.ceil(start / step) * step; instant <= end; instant += step) {
    if (!openSlot(policy, type, instant, now, conflicts)) continue;
    const key = localTime(instant, zone).slice(0, 10);
    if (key.startsWith(month)) (days[key] ??= []).push(instant);
  }
  return days;
}
