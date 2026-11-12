import { CONTACT_ROLES, HttpError, digest, email, https, metadata, seal, secret, text, unseal } from './model.mjs';
import { researchOffice } from './research.mjs';
import { patchReviewed } from './atomic.mjs';

export const PROSPECT_ACTIONS = new Set(['research-office', 'apply-research', 'verify-office', 'save-outreach-draft']);
const blocked = row => ['do_not_contact', 'not_interested'].includes(row.status) || metadata(row).primaryContactDoNotContact === true;
const fingerprint = row => { const info = metadata(row); return digest(JSON.stringify([row.town, row.locality, row.state, row.contact_name, row.contact_email, row.contact_phone, info.address, info.postalCode, info.website, info.independence, info.contactVerified, info.emailVerified, info.contactRole, info.verificationSource, info.verificationNote])); };
const source = value => {
  const url = https(value);
  if (!url) throw new HttpError(400, 'Add the public source URL you checked.');
  return url;
};
export { independenceVerified } from './model.mjs';

export function verificationUpdate(body, before, user, now = Date.now()) {
  const prior = metadata(before), info = { ...prior };
  let changed = false;
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  if (has('contact') && body.contact.trim() !== before.contact_name) { info.contactVerified = false; info.contactRole = 'unverified'; changed = true; }
  if (has('email') && body.email.trim().toLowerCase() !== before.contact_email) { info.emailVerified = false; info.contactVerified = false; changed = true; }
  if (has('phone') && body.phone.trim() !== before.contact_phone) { info.contactVerified = false; changed = true; }
  if (has('website')) { info.website = https(body.website); changed = true; }
  if (has('postalCode')) {
    info.postalCode = text(body.postalCode || '', 10);
    if (info.postalCode && !/^\d{5}(?:-\d{4})?$/.test(info.postalCode)) throw new HttpError(400, 'Enter a valid US ZIP code.');
    changed = true;
  }
  for (const key of ['contactVerified', 'emailVerified']) if (has(key)) {
    if (typeof body[key] !== 'boolean') throw new HttpError(400, 'Choose whether the contact details were checked.');
    info[key] = body[key]; changed = true;
  }
  if (has('contactRole')) {
    if (!CONTACT_ROLES.includes(body.contactRole)) throw new HttpError(400, 'Choose the contact’s role.');
    if (body.contactRole !== prior.contactRole && body.contactVerified !== true) info.contactVerified = false;
    info.contactRole = body.contactRole; changed = true;
  }
  if (has('verificationSource')) { info.verificationSource = body.verificationSource ? source(body.verificationSource) : ''; changed = true; }
  if (has('verificationNote')) { info.verificationNote = text(body.verificationNote || '', 900); changed = true; }
  if (info.verificationSource !== prior.verificationSource || info.verificationNote !== prior.verificationNote || !info.verificationSource || !info.verificationNote) {
    if (body.contactVerified !== true) info.contactVerified = false;
    if (body.emailVerified !== true) info.emailVerified = false;
  }
  if (info.contactRole === 'unverified' && body.contactVerified !== true) info.contactVerified = false;
  if ((body.contactVerified === true || body.emailVerified === true) && (!info.verificationSource || !info.verificationNote)) throw new HttpError(400, 'Record the source and what you checked before confirming contact details.');
  if (body.contactVerified === true && (!(body.contact ?? before.contact_name) || !info.contactRole || info.contactRole === 'unverified')) throw new HttpError(400, 'Add the contact name and verified role first.');
  if (body.emailVerified === true && !(body.email ?? before.contact_email)) throw new HttpError(400, 'Add the published business email first.');
  if (changed) { info.verificationAt = new Date(now).toISOString(); info.verificationBy = user.id; }
  return changed ? info : null;
}

export function prospectTools(env, db, { researcher = researchOffice, now = Date.now } = {}) {
  const stamp = () => new Date(now()).toISOString();
  async function audit(user, lead, action, detail) {
    return db.create('events', { town: `${action} ${secret().slice(0, 12)}`, contact_name: user.name, assigned_to: String(lead.id), status: action === 'outreach_draft' ? 'draft' : 'recorded', notes: JSON.stringify({ actorId: user.id, action, detail, at: stamp() }) });
  }
  return async (user, lead, action, body) => {
    if (blocked(lead)) throw new HttpError(409, 'This office is marked not interested or do not contact. Review its status before research or outreach.');
    if (action === 'research-office') {
      const website = body.website ? source(body.website) : metadata(lead).website;
      if (!website) {
        const query = [lead.town, metadata(lead).address, lead.locality, lead.state, 'official tax office website'].filter(Boolean).join(' ');
        const found = typeof db.search === 'function' ? await db.search(query) : [];
        const candidates = found.flatMap(item => {
          try { const url = source(item.url); return [{ title: text(String(item.title || url).slice(0, 240), 240), url, snippet: String(item.snippet || '').slice(0, 400) }]; } catch { return []; }
        }).slice(0, 8);
        return { needsWebsiteSelection: true, candidates, message: 'Choose the office’s official website after checking its name and address. Search results do not establish affiliation.' };
      }
      const report = await researcher({ ...lead, notes: JSON.stringify({ ...metadata(lead), website }) });
      const allowed = new Set(['email', 'phone', 'contact']);
      const evidence = (report.evidence || []).flatMap(item => {
        if (!allowed.has(item.field)) return [];
        try {
          const value = item.field === 'email' ? email(item.value) : text(item.value, item.field === 'phone' ? 60 : 140, true);
          if (item.field === 'phone' && (!/^\+?[\d ().-]+$/.test(value) || !/^\d{7,15}$/.test(value.replace(/\D/g, '')))) return [];
          const sourceURL = source(item.sourceURL || item.sourceUrl);
          if (sourceURL.length > 700) return [];
          return [{ field: item.field, value, sourceURL, checkedAt: report.checkedAt || stamp(), excerpt: String(item.excerpt || '').slice(0, 220), confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'published' }];
        } catch { return []; }
      }).slice(0, 8).map((item, index) => ({ ...item, id: `proposal-${index + 1}` }));
      const reportId = secret();
      const token = seal({ reportId, officeId: String(lead.id), userId: String(user.id), fingerprint: fingerprint(lead), evidence, website, exp: now() + 30 * 60000 }, env.GIGTAX_SALES_SESSION_KEY);
      return { research: { ...report, evidence, proposals: evidence, reportId, token, requiresReview: true } };
    }
    if (action === 'apply-research') {
      if (body.reviewed !== true) throw new HttpError(400, 'Review the source evidence and confirm it belongs to this office.');
      const report = unseal(body.token || '', env.GIGTAX_SALES_SESSION_KEY);
      if (!report || report.exp <= now() || report.reportId !== body.reportId || report.officeId !== String(lead.id) || report.userId !== String(user.id)) throw new HttpError(409, 'The research review expired or belongs to another office. Research it again.');
      if (report.fingerprint !== fingerprint(lead)) throw new HttpError(409, 'This office changed after the research. Refresh and research again before applying it.');
      if (!Array.isArray(body.selected) || body.selected.length < 1 || body.selected.length > 8 || new Set(body.selected).size !== body.selected.length) throw new HttpError(400, 'Choose the sourced fields you want to apply.');
      const selected = body.selected.map(id => report.evidence.find(item => item.id === id));
      if (selected.some(item => !item)) throw new HttpError(400, 'Only fields from this research report can be applied.');
      if (new Set(selected.map(item => item.field)).size !== selected.length) throw new HttpError(400, 'Choose one value for each field.');
      const info = { ...metadata(lead), researchSources: { ...metadata(lead).researchSources }, researchReviewedAt: stamp(), researchReviewedBy: user.id };
      const patch = {};
      for (const item of selected) {
        patch[{ email: 'contact_email', phone: 'contact_phone', contact: 'contact_name' }[item.field]] = item.value;
        info.researchSources[item.field] = item;
        info.contactVerified = false;
        if (item.field === 'email') info.emailVerified = false;
        if (item.field === 'contact') { info.contactVerified = false; info.contactRole = 'unverified'; }
      }
      patch.notes = JSON.stringify(info);
      const office = await patchReviewed(db, 'offices', lead, patch);
      await audit(user, lead, 'research_applied', { reportId: body.reportId, fields: selected });
      return { office, applied: selected.map(item => item.field) };
    }
    if (action === 'verify-office') {
      if (body.reviewed !== true || !['independent', 'chain', 'unverified'].includes(body.finding)) throw new HttpError(400, 'Review the ownership finding before saving it.');
      const proof = { finding: body.finding, sourceURL: body.finding === 'unverified' ? (body.sourceURL ? source(body.sourceURL) : '') : source(body.sourceURL), note: text(body.note || '', 900, body.finding !== 'unverified'), checkedAt: stamp(), reviewed: true, by: user.id };
      const office = await patchReviewed(db, 'offices', lead, { notes: JSON.stringify({ ...metadata(lead), independence: body.finding, independenceVerification: proof }) });
      await audit(user, lead, 'ownership_reviewed', proof);
      return { office };
    }
    if (action === 'save-outreach-draft') {
      if (body.reviewed !== true) throw new HttpError(400, 'Review the draft before saving it.');
      const to = email(body.to);
      if (to !== lead.contact_email?.toLowerCase()) throw new HttpError(409, 'Save this office’s verified business email before drafting to another address.');
      const draft = { to, subject: text(body.subject, 180, true), message: text(body.message, 4000, true), status: 'draft', sourceChecked: metadata(lead).emailVerified === true };
      const event = await audit(user, lead, 'outreach_draft', draft);
      return { event, draft, sent: false };
    }
    throw new HttpError(404, 'Unknown prospect action.');
  };
}
