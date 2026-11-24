import { randomUUID } from 'node:crypto';
import { singleEmail } from '../../sales/mail-provider.mjs';
import { localTime, meetingTypes, timeZone } from './booking-times.mjs';

const months = 'january february march april may june july august september october november december'.split(' ');
const weekdays = 'sunday monday tuesday wednesday thursday friday saturday'.split(' ');
const confirmations = {
  create: /^(?:please )?(?:confirm (?:the )?booking|book it)(?: now)?[.!]*$/i,
  cancel: /^(?:please )?confirm (?:the )?cancell?ation(?: now)?[.!]*$/i,
  reschedule: /^(?:please )?(?:confirm (?:the )?reschedul(?:e|ing)|reschedule it)(?: now)?[.!]*$/i,
};
const discard = /^(?:please )?(?:cancel|discard|stop)(?: (?:this|the|my))?(?: booking draft| booking| it)?[.!]*$/i;
const begin = /^(?:(?:can|could) you |please )*(?:(?:book|schedule|arrange|set up)\b.{0,50}\b(?:demo|meeting|appointment)\b|(?:find|check|what are|when).{0,35}\b(?:availability|openings?|free(?: times?)?)\b)/i;
const manage = /^(?:(?:can|could) you |please )*(cancel|reschedule|move)\b.{0,65}\b(demo|meeting|appointment|booking)\b/i;
const numberWords = 'zero one two three four five six seven eight nine ten eleven twelve'.split(' ');
const ordinals = ['zero', 'first', 'second', 'third'];
const workflow = (answer, booking) => ({ mode: 'workflow', answer, sources: [], draft: null, ...(booking ? { booking } : {}) });

function isoDate(year, month, day) {
  const string = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const candidate = new Date(string + 'T12:00:00Z');
  return Number.isFinite(+candidate) && candidate.toISOString().slice(0, 10) === string ? string : undefined;
}

function dateFrom(phrase, today) {
  const date = new Date(today + 'T12:00:00Z');
  const plus = days => new Date(+date + days * 86400000).toISOString().slice(0, 10);
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(phrase);
  if (iso) return isoDate(iso[1], Number(iso[2]), Number(iso[3]));
  const named = new RegExp(`\\b(${months.join('|')}) (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`, 'i').exec(phrase);
  if (named) {
    const month = months.indexOf(named[1].toLowerCase()) + 1;
    const first = isoDate(named[3] || date.getUTCFullYear(), month, Number(named[2]));
    return first && !named[3] && first < today ? isoDate(date.getUTCFullYear() + 1, month, Number(named[2])) : first;
  }
  if (/\btomorrow\b/i.test(phrase)) return plus(1);
  if (/\btoday\b/i.test(phrase)) return today;
  const namedDay = new RegExp(`\\b(next |this )?(${weekdays.join('|')})\\b`, 'i').exec(phrase);
  if (!namedDay) return undefined;
  const offset = (weekdays.indexOf(namedDay[2].toLowerCase()) - date.getUTCDay() + 7) % 7;
  return plus(offset || 7);
}

function clockFrom(phrase) {
  const ampm = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2})| +(fifteen|thirty|forty[- ]five))? *(a\.?\s*m\.?|p\.?\s*m\.?)\b/i.exec(phrase);
  if (ampm) {
    const hour = /^\d+$/.test(ampm[1]) ? Number(ampm[1]) : numberWords.indexOf(ampm[1].toLowerCase());
    const minutes = Number(ampm[2] || ({ fifteen: 15, thirty: 30, 'forty five': 45 })[ampm[3]?.toLowerCase().replace('-', ' ')] || 0);
    if (hour < 1 || hour > 12 || minutes > 59) return;
    return String(hour % 12 + (ampm[4].startsWith('p') || ampm[4].startsWith('P') ? 12 : 0)).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }
  if (/\bnoon\b/i.test(phrase)) return '12:00';
  if (/\bmidnight\b/i.test(phrase)) return '00:00';
  return /\b(?:[01]\d|2[0-3]):[0-5]\d\b/.exec(phrase)?.[0];
}

function optionFrom(phrase) {
  const option = /^(?:(?:choose|use|take) )?(?:(?:the )?(first|second|third)(?: (?:option|time))?|option (1|2|3|one|two|three))[.!]*$/i.exec(phrase);
  if (!option) return;
  if (option[1]) return ordinals.indexOf(option[1].toLowerCase()) - 1;
  return (/^\d+$/.test(option[2]) ? Number(option[2]) : numberWords.indexOf(option[2].toLowerCase())) - 1;
}

function zoneFrom(phrase) {
  const named = /\b(eastern|central|mountain|pacific|alaska|hawaii) (?:time|standard time|daylight time)\b/i.exec(phrase)?.[1];
  if (named) return ({ eastern: 'America/New_York', central: 'America/Chicago', mountain: 'America/Denver', pacific: 'America/Los_Angeles', alaska: 'America/Anchorage', hawaii: 'Pacific/Honolulu' })[named.toLowerCase()];
  const explicit = /\b(?:in|zone)\s+((?:[A-Za-z_]+\/)+[A-Za-z_]+|UTC)\b/i.exec(phrase)?.[1];
  return explicit ? timeZone(explicit) : undefined;
}

function attendeeEmail(phrase) {
  const email = phrase.trim().replace(/^(?:the )?(?:attendee |client )?email(?: address)?(?: is| to|:)?\s+/i, '')
    .replace(/[.!?]+$/, '').replace(/\s+at\s+(?:sign\s+)?/gi, '@').replace(/\s+(?:dot|period)\s+/gi, '.')
    .replace(/\s+(?:dash|hyphen)\s+/gi, '-').replace(/\s+underscore\s+/gi, '_').replace(/\s+plus\s+/gi, '+');
  try { return singleEmail(email); } catch { return undefined; }
}

const timeParts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'long' };
const dateLabel = (date, zone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', ...timeParts }).format(date);
const timeLabel = (date, zone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, ...timeParts }).format(date);
const dayLabel = date => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'full' }).format(new Date(date + 'T12:00:00Z'));

function preview(booking) {
  if (booking.operation === 'cancel') return workflow(`Cancel the ${meetingTypes[booking.type].toLowerCase()} with ${booking.name} on ${dateLabel(booking.originalStart, booking.originalZone)}? Say confirm cancellation or discard booking draft.`, { ...booking, step: 'confirm' });
  if (!booking.start) return workflow('Choose a date or say next available.', { ...booking, step: 'date' });
  if (booking.operation === 'reschedule') return workflow(`Move the ${meetingTypes[booking.type].toLowerCase()} with ${booking.name} from ${dateLabel(booking.originalStart, booking.originalZone)} to ${dateLabel(booking.start, booking.zone)}, lasting ${booking.duration} minutes? Say confirm reschedule or discard booking draft.`, { ...booking, step: 'confirm' });
  if (!booking.name) return workflow(`What is the attendee’s full name for ${dateLabel(booking.start, booking.zone)}?`, { ...booking, step: 'name' });
  if (!booking.email) return workflow(`What email address should I use for ${booking.name}?`, { ...booking, step: 'email' });
  const details = [booking.company && 'Company: ' + booking.company, booking.phone && 'Phone: ' + booking.phone,
    booking.location && 'Location: ' + booking.location, booking.notes && 'Notes: ' + booking.notes,
    booking.answer && booking.question && booking.question + ' ' + booking.answer].filter(Boolean);
  return workflow(`Review ${meetingTypes[booking.type].toLowerCase()} for ${booking.name}, ${booking.email}, on ${dateLabel(booking.start, booking.zone)}, lasting ${booking.duration} minutes. ${details.join('. ')}${details.length ? '. ' : ''}Say confirm booking to schedule it, or cancel booking draft.`,
    { ...booking, step: 'confirm' });
}

async function findSlots(crm, user, booking, today, date, wanted) {
  let options, slotDate = date || today;
  for (let monthOffset = 0; monthOffset < (date ? 1 : 2); monthOffset++) {
    const month = new Date(slotDate + 'T12:00:00Z');
    if (monthOffset) { month.setUTCDate(1); month.setUTCMonth(month.getUTCMonth() + monthOffset); }
    const result = await crm(user, 'booking-staff-slots', { zone: booking.zone, type: booking.type, month: month.toISOString().slice(0, 7), bookingId: booking.bookingId });
    const times = (date ? (result.days[date] || []) : Object.values(result.days).flat()).filter(start => start !== booking.originalStart);
    const selected = wanted && times.filter(start => localTime(start, booking.zone).slice(11) === wanted);
    booking = { ...booking, question: result.question, duration: result.duration, policyRevision: result.revision, location: result.location };
    if (selected?.length === 1) return preview({ ...booking, date, start: selected[0], options: undefined });
    if (!times.length) continue;
    const later = wanted ? times.filter(start => localTime(start, booking.zone).slice(11) > wanted) : [];
    options = (selected?.length ? selected : later.length ? later : times).slice(0, 3);
    break;
  }
  if (!options) return workflow(`You have no ${meetingTypes[booking.type].toLowerCase()} openings ${date ? 'on ' + dayLabel(date) : 'this month or next'}. Say another date.`, { ...booking, start: undefined, step: 'date', options: undefined });
  const labels = options.map((start, index) => `Option ${index + 1}, ${date ? timeLabel(start, booking.zone) : dateLabel(start, booking.zone)}`).join('. ');
  return workflow(`${date ? dayLabel(date) + '. ' : ''}${wanted ? 'Choose from these available times. ' : ''}${labels}. Say option one${options.length > 1 ? ', option two' : ''}${options.length > 2 ? ', or option three' : ''}, or give another date.`,
    { ...booking, date, start: undefined, step: 'option', options });
}

function confirmationText(result, operation) {
  const row = result.booking;
  const email = ({ pending: 'The confirmation email is queued.', working: 'The confirmation email is being processed.',
    accepted: 'The email provider accepted the confirmation.', delivered: 'The confirmation email was delivered.',
    'test-accepted': 'Email ran in test mode.', rejected: 'The email provider declined the confirmation.',
    uncertain: 'Email delivery is unconfirmed.', unconfigured: 'Booking email is not configured.' })[result.email] || 'Check the calendar for the confirmation email status.';
  const invite = result.calendarInvite === 'pending' || result.calendarInvite === 'working' ? ' Calendar sync is queued.' : '';
  const action = row.status === 'cancelled' ? 'cancelled' : operation === 'reschedule' ? 'rescheduled' : 'confirmed';
  return `${row.title} ${action} for ${row.client.name} on ${dateLabel(row.start, row.zone)}. ${email}${invite}`;
}

function existingDraft(draft, row) {
  return { operation: draft.operation, type: row.type, bookingId: row.id, revision: row.revision, name: row.client.name,
    originalStart: row.start, originalZone: row.zone, zone: draft.zone, step: 'date' };
}

const normalizedName = name => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export async function handleCoachBooking({ user, input, previous, crm, question, calendar }) {
  const starting = begin.test(question);
  const managing = manage.exec(question);
  let booking = previous?.booking;
  const confirmation = Object.keys(confirmations).find(operation => confirmations[operation].test(question));
  if (!booking && !starting && !managing && !confirmation) return;
  if (!crm) return;
  if (booking && discard.test(question) && !confirmation) return workflow('Booking draft discarded.');
  if (confirmation) {
    if (booking?.step !== 'confirm' || (booking.operation || 'create') !== confirmation) return workflow('Prepare and review the booking action before confirming.', booking);
    try {
      const result = confirmation === 'create' ? await crm(user, 'booking-staff-book', {
        type: booking.type, start: booking.start, zone: booking.zone, requestId: booking.requestId,
        policyRevision: booking.policyRevision, name: booking.name, email: booking.email, company: booking.company,
        phone: booking.phone, notes: booking.notes, answer: booking.answer,
      }) : await crm(user, 'booking-staff-manage', {
        operation: confirmation, bookingId: booking.bookingId, revision: booking.revision,
        start: booking.start, zone: booking.zone, policyRevision: booking.policyRevision,
      });
      return { ...workflow(confirmationText(result, confirmation)), bookingSaved: { id: result.booking.id } };
    } catch (error) {
      if (error.status === 409 && confirmation !== 'create') return workflow(error.message + ` Ask to ${confirmation} this booking again.`);
      if (error.status === 409) return workflow(error.message + ' Say a date to check openings again.', { ...booking, start: undefined, step: 'date' });
      if (error.status >= 400 && error.status < 500) return workflow(error.message, booking);
      const phrase = ({ create: 'confirm booking', cancel: 'confirm cancellation', reschedule: 'confirm reschedule' })[confirmation];
      return workflow(`The workspace did not confirm the request. Say ${phrase} again to check the same request.`, booking);
    }
  }
  if (starting) booking = { type: /\bdemo\b/i.test(question) ? 'demo' : 'appointment', zone: input.timeZone || 'UTC', requestId: randomUUID(), step: 'date' };
  if (managing) {
    const operation = managing[1].toLowerCase() === 'cancel' ? 'cancel' : 'reschedule';
    const meeting = managing[2].toLowerCase(), type = ['demo','appointment'].includes(meeting) ? meeting : undefined;
    const target = /\bwith (.+?)(?= (?:to|on|at|tomorrow|today|next|this)\b|[.!?]*$)/i.exec(question)?.[1];
    const zone = input.timeZone || 'UTC';
    let matches;
    try {
      const dashboard = await crm(user, 'booking-dashboard', {});
      matches = dashboard.entries.filter(row => row.status === 'confirmed' && row.start > dashboard.now && (!type || type === row.type) &&
        (!target || normalizedName(row.client.name) === normalizedName(target)));
    } catch (error) { return workflow(error.status ? error.message : 'The calendar is unavailable. Try again in a moment.'); }
    if (!matches.length) return workflow('No matching upcoming booking on your calendar. Say the attendee’s full name as it appears on the booking.');
    if (matches.length > 1) {
      const choices = matches.slice(0, 3);
      const options = choices.map((row, index) => `Option ${index + 1}, ${row.title} with ${row.client.name} on ${dateLabel(row.start, zone)}`).join('. ');
      return workflow(`Choose the booking to ${operation}. ${options}. Say the option number or name the attendee in a new request.`,
        { step: 'existing', operation, zone, options: choices.map(({ id, type, title, client, start, zone, revision }) => ({ id, type, title, client: { name: client.name }, start, zone, revision })) });
    }
    booking = existingDraft({ operation, zone }, matches[0]);
    if (operation === 'cancel') return preview(booking);
  }
  if (/^(?:open|go to|take me to|show me|navigate to)\b/i.test(question)) return;
  const option = optionFrom(question);
  if (booking.step === 'existing') {
    const row = booking.options?.[option];
    return row ? preview(existingDraft(booking, row)) : workflow('Say one of the booking option numbers.', booking);
  }
  if (option !== undefined && booking.step === 'option') {
    const start = booking.options?.[option];
    return start ? preview({ ...booking, date: localTime(start, booking.zone).slice(0, 10), start, options: undefined }) : workflow('Choose one of the available option numbers.', booking);
  }
  const adjustingTime = /^(?:please )?(?:change|set) (?:the )?(?:date|time|time zone)\b/i.test(question);
  const setter = /^(?:(?:change|set) (?:the )?)?(?:(?:attendee|client) )?(name|email|company|phone|notes?|answer)(?:\s+(?:is|to)|:)?\s+(.+?)\s*$/i.exec(question);
  if (setter || (!starting && !adjustingTime && ['name','email'].includes(booking.step))) {
    if (booking.operation) return workflow('This booking action keeps the current attendee details.', booking);
    const key = setter?.[1].toLowerCase().replace(/^note$/, 'notes') || booking.step;
    const value = setter?.[2] || question;
    const email = key === 'email' ? attendeeEmail(value) : undefined;
    if (key === 'email' && !email) return workflow('Say one email address. For example, Alex at example dot com.', booking);
    const bounds = { name: 120, company: 140, phone: 48, notes: 1600, answer: 800 };
    const field = email || (key === 'name' ? value.trim().replace(/[.!?]+$/, '') : value.trim());
    if (!field || (!email && field.length > bounds[key])) return workflow(`Give a shorter ${key}.`, booking);
    return preview({ ...booking, [key]: field });
  }
  try {
    const zone = zoneFrom(question) || booking.zone;
    const date = dateFrom(question, calendar.today), wanted = clockFrom(question);
    const target = date || ((wanted || zone !== booking.zone) && booking.date);
    if (target || /\b(?:next|first|earliest) (?:available|opening)\b/i.test(question)) {
      return await findSlots(crm, user, { ...booking, zone, requestId: randomUUID() }, calendar.today, target || undefined, wanted);
    }
    if (zone !== booking.zone) booking = { ...booking, zone };
  } catch (error) { return workflow(error.status ? error.message : 'The calendar is unavailable. Try again in a moment.', booking); }
  if (booking.step === 'confirm') return preview(booking);
  if (booking.step === 'option') return workflow('Say one of the option numbers or give another date.', booking);
  return workflow(`What date should I check for a ${meetingTypes[booking.type].toLowerCase()}? Say a date or next available.`, booking);
}
