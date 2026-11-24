import { createHmac, timingSafeEqual } from 'node:crypto';

export const signedKey = (key, purpose, id) => createHmac('sha256', Buffer.from(key, 'hex')).update(purpose + ':' + id).digest('base64url');
export function keyMatches(actual, expected) {
  return typeof actual === 'string' && Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
export const manageURL = (origin, key, id) => origin + '/book#manage=' + id + '.' + signedKey(key, 'manage', id);

const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = value => String(value || '').replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n')
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/[,;]/g, char => '\\' + char);
function fold(line) {
  let width = 0, result = '';
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (width + bytes > 75) { result += '\r\n '; width = 1; }
    result += char;
    width += bytes;
  }
  return result;
}
export function calendarFile(rows, { method = 'PUBLISH', organizer = '', attendee = '' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TinkyTown//Sales Bookings//EN', 'CALSCALE:GREGORIAN', 'METHOD:' + method];
  for (const row of rows) {
    lines.push('BEGIN:VEVENT', 'UID:' + row.id + '@bookings.tinkytown', 'SEQUENCE:' + (row.revision - 1),
      'DTSTAMP:' + stamp(row.changed), 'DTSTART:' + stamp(row.start), 'DTEND:' + stamp(row.end),
      'SUMMARY:' + escape(row.title + ' · ' + row.hostName + ' · ' + row.client.name),
      'DESCRIPTION:' + escape([row.client.company, row.client.notes, row.answer && row.question + ' ' + row.answer].filter(Boolean).join('\n')),
      'LOCATION:' + escape(row.location), 'STATUS:' + (row.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'));
    if (organizer) lines.push('ORGANIZER:mailto:' + encodeURI(organizer));
    if (attendee) lines.push('ATTENDEE;RSVP=TRUE:mailto:' + encodeURI(attendee));
    lines.push('END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR', ''].map(fold).join('\r\n');
}
