import { metadata } from './model.mjs';

export function officeOutreachBlocked(office) {
  return ['not_interested', 'do_not_contact'].includes(office.status) || Boolean(metadata(office).primaryContactDoNotContact);
}

export function emailOutreachBlocked(db, address, offices) {
  return db.suppressedEmail(address) || offices.some(row => {
    const info = metadata(row);
    return (info.emailOptOuts || []).includes(address) ||
      (row.contact_email === address && officeOutreachBlocked(row)) ||
      (info.contacts || []).some(person => person.email === address && person.preference === 'do_not_contact');
  });
}
