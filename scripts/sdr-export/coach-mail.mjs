import { randomUUID } from 'node:crypto';
import { contactBook } from '../../sales/contacts.mjs';
import { visible } from '../../sales/model.mjs';
import { emailOutreachBlocked, officeOutreachBlocked } from '../../sales/outreach-preferences.mjs';

const normal = v => String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const mentions = (phrase, name) => name && (' ' + normal(phrase) + ' ').includes(' ' + normal(name) + ' ');
export const asksToEmail = q => /^(?:(?:hey tinky[, ]*|tinky[, ]*|can you |could you |please )\s*)*(?:e-?mail\b|send\b.*\b(?:e-?mail|a message)\b)|\b(?:draft|write|compose|prepare)\b.{0,35}\be-?mail\b|\b(?:and|then) (?:please )?e-?mail\b/i.test(q.trim());
export const confirmsEmail = q => /^(?:yes[, ]+)?(?:please )?(?:send (?:it|them|these|both|the (?:e-?mails?|messages?)|these (?:e-?mails?|messages?)|this (?:e-?mail|message)|all (?:of them|of these))|confirm send)(?: now| please)?[.!]*$/i.test(q.trim());
export const editsEmail = q => /^(?:please )?(?:make (?:it|the email|the message) |(?:change|edit|revise|rewrite|shorten|expand) (?:it|that|this|the (?:subject|body|message|email)|the draft)|add .+ to (?:it|the email)|include |use (?:a |the )?.+tone)/i.test(q.trim());

export function recipientsFor(db, user, question, screenAccount, previous) {
  const offices = db.list('offices'), allowed = offices.filter(o => visible(user, o));
  const allMine = /\b(?:(?:all|each of|every one of) (?:of )?my|(?:e-?mail|e-?mail to) my) (?:assigned )?(?:prospects|accounts|leads)\b/i.test(question);
  let chosen = allMine ? allowed.filter(o => String(o.assigned_to) === String(user.id)) : allowed.filter(o => mentions(question, o.town));
  if (!allMine && chosen.length > 1) {
    chosen = chosen.filter(o => {
      const longer = chosen.filter(other => other.town.length > o.town.length && mentions(other.town, o.town));
      const rest = longer.reduce((q, other) => q.replaceAll(' ' + normal(other.town) + ' ', ' '), ' ' + normal(question) + ' ');
      return mentions(rest, o.town);
    });
  }
  if (!allMine && chosen.length > 1) {
    const same = chosen.filter(o => normal(o.town) === normal(chosen[0].town));
    if (same.length === chosen.length) {
      const byCity = chosen.filter(o => mentions(question, o.locality));
      if (byCity.length !== 1) return { issue: 'Which location should receive this email? Include the business name and city.' };
      chosen = byCity;
    }
  }
  if (!chosen.length && !allMine && screenAccount && /\b(?:this|current|open)\s+(?:prospect|account|office|facility)|\b(?:them|the receptionist|the contact)\b/i.test(question)) chosen = allowed.filter(o => String(o.id) === screenAccount.id);
  if (!chosen.length && !allMine && previous?.draft?.recordId && /\b(?:them|that prospect|that account)\b/i.test(question)) chosen = allowed.filter(o => String(o.id) === previous.draft.recordId);
  if (!chosen.length) return { issue: allMine ? 'There are no saved prospects assigned to you.' : 'Which saved prospect should receive the email? Name one or more accounts, use “this account” on an open record, or say “all my assigned prospects.”' };
  const recipients = [], omitted = [], addresses = new Set();
  for (const office of chosen) {
    const people = contactBook(office).contacts.filter(p => !p.archived && p.email);
    const exact = people.filter(p => mentions(question, p.name) || question.toLowerCase().includes(p.email.toLowerCase()));
    const person = exact.length === 1 ? exact[0] : people.find(p => p.primary) || (people.length === 1 && people[0]);
    const to = person && person.email.trim().toLowerCase();
    if (!to || officeOutreachBlocked(office) || person.suppressed || emailOutreachBlocked(db, to, offices)) {
      omitted.push(office.town + (to ? ' · outreach paused' : ' · choose a saved business email')); continue;
    }
    if (addresses.has(to)) { omitted.push(office.town + ' · same recipient already listed'); continue; }
    addresses.add(to);
    recipients.push({ name: office.town, person: person.name || '', to, link: { officeId: String(office.id), contactId: person.id } });
  }
  return { recipients, omitted, issue: recipients.length ? '' : 'No eligible business email is available for this selection. ' + omitted.join('; ') };
}

export function mailPreview(mailbox, selection, fields, repName) {
  if (!fields.subject?.trim() || !fields.body?.trim()) return null;
  const entries = selection.recipients.map(({ name, person, to, link }) => {
    const expand = text => text.replace(/\{\{(organization|contact|rep)\}\}/gi, (_, k) => ({ organization: name, contact: person || 'there', rep: repName })[k.toLowerCase()]);
    return { id: randomUUID(), name, to, from: mailbox.address, link, subject: expand(fields.subject).trim().slice(0, 180), body: expand(fields.body).trim().slice(0, 3500) };
  });
  return { entries, omitted: selection.omitted, configured: mailbox.configured };
}
export function preparedEmail(mail, user, selection, fields, mode = 'ai') {
  const preview = mailPreview(mail.summary(user).mailbox, selection, fields, user.name);
  if (!preview) return { mode: 'workflow', answer: 'What subject and message should I prepare?', sources: [], draft: null };
  const item = preview.entries.length === 1 ? preview.entries[0] : null;
  return { mode, answer: 'Review the ' + (item ? 'email' : preview.entries.length + ' individual emails') + ' below. Say “send it” to send from your sales mailbox.',
    mail: preview, sources: [], draft: item ? { type: 'email', recordId: item.link.officeId, recordName: item.name, fields: { subject: item.subject, body: item.body } } : null };
}
export async function submitPreview(mail, user, preview) {
  const lines = [];
  for (const item of preview.entries) {
    let outcome;
    try {
      const { status } = await mail.sendReviewed(user, item);
      outcome = { accepted: 'Zoho Mail accepted the message', rejected: 'Zoho Mail declined the message', uncertain: 'Submission unconfirmed. Check Sent before trying again' }[status] || 'Submission unconfirmed';
    } catch (error) { outcome = error.status ? error.message : 'Submission unconfirmed. Check your Sales email.'; }
    lines.push(item.to + ' — ' + outcome);
  }
  return { mode: 'workflow', answer: lines.join('\n'), sources: [{ title: 'Sales email', href: '#view=email' }], draft: null };
}
