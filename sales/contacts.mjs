import { CONTACT_ROLES, HttpError, digest, email, https, metadata, text } from './model.mjs';
import { patchReviewed } from './atomic.mjs';

export { CONTACT_ROLES } from './model.mjs';
export const CONTACT_ACTIONS = new Set(['save-contact', 'set-primary-contact', 'archive-contact', 'restore-contact']);
export const contactRevision = office => metadata(office).revision || '';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const ownerRole = contact => ['owner', 'partner'].includes(contact.role);
const suppressedOffice = office => ['do_not_contact', 'not_interested'].includes(office.status);
const matchesPrimary = (contact, office) => contact.name === (office.contact_name || '') && contact.email === (office.contact_email || '') && contact.phone === (office.contact_phone || '');

// Legacy office fields stay usable by discovery, research, drafts and invitations.
// Reading never migrates data. Old records appear immediately in the Rolodex.
export function officeContacts(office) {
  const info = metadata(office), saved = structuredClone(info.contacts || []);
  const primary = saved.find(contact => contact.id === info.primaryContactId && !contact.archived);
  if (primary) {
    const primaryChanged = !matchesPrimary(primary, office) || primary.role !== (info.contactRole || 'unverified');
    if (primaryChanged) {
      Object.assign(primary, { name: office.contact_name || '', email: office.contact_email || '', phone: office.contact_phone || '', role: info.contactRole || 'unverified', verification: null });
    }
    if (info.verificationSource !== undefined) primary.sourceURL = info.verificationSource;
    if (info.verificationNote !== undefined) primary.sourceNote = info.verificationNote;
    if (primaryChanged || info.contactVerified === false) primary.verification = null;
    else if (info.contactVerified && info.verificationSource && info.verificationNote && info.verificationAt &&
      (!primary.verification || primary.verification.at !== info.verificationAt)) primary.verification = { at: info.verificationAt, by: info.verificationBy, legacy: true };
    primary.primary = true;
  } else if (office.contact_name || office.contact_email || office.contact_phone) {
    saved.unshift({ id: 'office-contact', name: office.contact_name || '', email: office.contact_email || '', phone: office.contact_phone || '', mobile: '', extension: '', title: '',
      role: CONTACT_ROLES.includes(info.contactRole) ? info.contactRole : 'unverified', preference: info.primaryContactDoNotContact ? 'do_not_contact' : 'unspecified', notes: '', sourceURL: info.verificationSource || '', sourceNote: info.verificationNote || '', primary: true, legacy: true,
      verification: info.contactVerified && info.verificationSource && info.verificationNote ? { at: info.verificationAt, by: info.verificationBy, legacy: true } : null });
  }
  return saved.map(contact => ({ ...contact, primary: contact.primary === true && !contact.archived,
    suppressed: suppressedOffice(office) || contact.preference === 'do_not_contact' || contact.archived === true }));
}

export function contactBook(office) {
  return { revision: contactRevision(office), contacts: officeContacts(office) };
}

export function contactDirectory(offices) {
  const contacts = [], coverage = { offices: offices.length, contacts: 0, owners: 0, missingOwner: 0, missingEmail: 0, missingPhone: 0 };
  for (const office of offices) {
    const people = officeContacts(office), active = people.filter(contact => !contact.archived);
    coverage.contacts += active.length;
    coverage.owners += active.filter(ownerRole).length;
    if (!active.some(ownerRole)) coverage.missingOwner++;
    if (!active.some(contact => contact.email)) coverage.missingEmail++;
    if (!active.some(contact => contact.phone || contact.mobile)) coverage.missingPhone++;
    for (const contact of people) contacts.push({ ...contact, officeId: String(office.id), officeName: office.town, city: office.locality, state: office.state, stage: office.status,
      address: metadata(office).address || '', postalCode: metadata(office).postalCode || '', website: metadata(office).website || '', assignedTo: String(office.assigned_to) });
  }
  contacts.sort((a, b) => (a.name || a.officeName).localeCompare(b.name || b.officeName) || a.officeName.localeCompare(b.officeName));
  return { contacts, coverage };
}

function phone(value) {
  const clean = text(value || '', 60);
  if (clean && (!/^\+?[\d ().-]+$/.test(clean) || !/^\d{7,15}$/.test(clean.replace(/\D/g, '')))) throw new HttpError(400, 'Enter a business phone with 7 to 15 digits; use the extension field separately.');
  return clean;
}

function contactInput(input, before, user, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Supply the contact details.');
  if (!CONTACT_ROLES.includes(input.role)) throw new HttpError(400, 'Choose this person’s role.');
  if (!['unspecified', 'email', 'phone', 'do_not_contact'].includes(input.preference)) throw new HttpError(400, 'Choose a contact preference.');
  const value = { name: text(input.name || '', 140), role: input.role, title: text(input.title || '', 140), email: input.email ? email(input.email) : '', phone: phone(input.phone), mobile: phone(input.mobile),
    extension: text(input.extension || '', 12), preference: input.preference, notes: text(input.notes || '', 1500), sourceURL: input.sourceURL ? https(input.sourceURL) : '', sourceNote: text(input.sourceNote || '', 900) };
  if (!value.name && !value.email && !value.phone && !value.mobile) throw new HttpError(400, 'Add a name, business email or phone.');
  if (ownerRole(value) && !value.name) throw new HttpError(400, 'Add the owner or partner’s name.');
  if (value.extension && !/^\d{1,12}$/.test(value.extension)) throw new HttpError(400, 'Use digits for the phone extension.');
  const proofFields = ['name', 'role', 'email', 'phone', 'mobile', 'title', 'sourceURL', 'sourceNote'];
  const unchanged = before && proofFields.every(key => (before[key] || '') === (value[key] || ''));
  value.verification = unchanged ? before.verification || null : null;
  if (input.reviewed === true) {
    if (!value.name || value.role === 'unverified' || !value.sourceURL || !value.sourceNote) throw new HttpError(400, 'Record the named person’s role, source URL and what you checked before confirming the details.');
    value.verification = { at: new Date(now).toISOString(), by: String(user.id) };
  }
  return value;
}

function primaryPatch(info, contacts, primaryId) {
  const primary = contacts.find(contact => contact.id === primaryId && !contact.archived);
  info.primaryContactId = primary?.id || null;
  info.primaryContactDoNotContact = primary?.preference === 'do_not_contact';
  info.contactRole = primary?.role || 'unverified';
  // A Rolodex source check does not assert email deliverability or office ownership.
  info.contactVerified = Boolean(primary?.verification);
  info.emailVerified = false;
  info.verificationSource = primary?.sourceURL || '';
  info.verificationNote = primary?.sourceNote || '';
  info.verificationAt = primary?.verification?.at || null;
  info.verificationBy = primary?.verification?.by || null;
  return { contact_name: primary?.name || '', contact_email: primary?.email || '', contact_phone: primary?.phone || '' };
}

export function contactTools(db, audit, now = Date.now) {
  return async (user, office, action, body) => {
    const info = metadata(office);
    if (!uuid(body.requestId)) throw new HttpError(400, 'Supply a unique contact request ID.');
    const fingerprint = digest(JSON.stringify({ action, body }));
    const previous = (info.contactReceipts || []).find(receipt => receipt.id === body.requestId);
    if (previous) {
      if (previous.digest !== fingerprint || previous.actor !== String(user.id)) throw new HttpError(409, 'This request ID was already used for different contact changes.');
      return { book: contactBook(office), duplicate: true };
    }
    if (typeof body.expectedRevision !== 'string' || body.expectedRevision !== contactRevision(office)) throw new HttpError(409, 'The office or contacts changed. Refresh before saving your contact changes.');
    if (body.contactId !== 'office-contact' && !uuid(body.contactId)) throw new HttpError(400, 'Choose a valid contact ID.');
    const contacts = officeContacts(office).map(({ primary, legacy, suppressed, ...contact }) => contact);
    let contact = contacts.find(item => item.id === body.contactId);
    const priorPrimary = officeContacts(office).find(item => item.primary);
    let primaryId = priorPrimary?.id;
    if (action === 'save-contact') {
      if (contact?.archived) throw new HttpError(409, 'Restore this archived contact before editing it.');
      const value = contactInput(body.contact, contact, user, now());
      const duplicate = contacts.find(item => !item.archived && item.id !== body.contactId &&
        (value.name ? value.name.localeCompare(item.name || '', undefined, { sensitivity: 'accent' }) === 0 && value.email === item.email && value.phone === item.phone && value.mobile === item.mobile : value.email === item.email && value.phone === item.phone && value.mobile === item.mobile));
      if (duplicate) throw new HttpError(409, 'This person is already in the office’s contacts. Edit the existing contact.');
      if (!contact) {
        if (contacts.length >= 50) throw new HttpError(400, 'This office has reached its 50-contact limit.');
        contact = { id: body.contactId, createdAt: new Date(now()).toISOString() }; contacts.push(contact);
      }
      Object.assign(contact, value, { updatedAt: new Date(now()).toISOString(), updatedBy: String(user.id) });
      if (!primaryId) primaryId = contact.id;
    } else {
      if (!contact) throw new HttpError(404, 'Contact not found in this office.');
      if (action === 'set-primary-contact') {
        if (contact.archived) throw new HttpError(409, 'Restore this contact before making it primary.');
        primaryId = contact.id;
      } else if (action === 'archive-contact') {
        contact.archived = true; contact.archivedAt = new Date(now()).toISOString();
        if (primaryId === contact.id) primaryId = null;
      } else if (action === 'restore-contact') { contact.archived = false; contact.archivedAt = null; }
    }
    info.contacts = contacts;
    const nextPrimary = contacts.find(item => item.id === primaryId && !item.archived);
    const primaryUnchanged = priorPrimary && nextPrimary && ['id', 'name', 'email', 'phone', 'mobile', 'role', 'preference', 'sourceURL', 'sourceNote'].every(key => priorPrimary[key] === nextPrimary[key]) && JSON.stringify(priorPrimary.verification) === JSON.stringify(nextPrimary.verification);
    const patch = primaryUnchanged ? {} : primaryPatch(info, contacts, primaryId);
    info.primaryContactId = primaryId || null;
    info.contactReceipts = [...(info.contactReceipts || []), { id: body.requestId, digest: fingerprint, actor: String(user.id) }].slice(-30);
    if (JSON.stringify(info).length > 48000) throw new HttpError(400, 'This office’s contact notes have reached the storage limit. Shorten contact notes or source excerpts before saving.');
    const saved = await patchReviewed(db, 'offices', office, { ...patch, notes: JSON.stringify(info) });
    await audit(user, office.id, action.replaceAll('-', '_'), { contactId: contact.id, name: contact.name, role: contact.role });
    return { book: contactBook(saved), duplicate: false };
  };
}
