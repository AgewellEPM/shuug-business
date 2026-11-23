import { HttpError, digest, metadata, officeIdentity, state, text } from '../../sales/model.mjs';
import { localityKey } from '../../sales/territory-access.mjs';
import { patchReviewed } from '../../sales/atomic.mjs';
import { searchConnecticutBusinesses } from '../../sales/business-registry.mjs';
import { lookupStateBusiness } from '../../sales/state-registry.mjs';
import { researchOffice } from '../../sales/research.mjs';
import { mailConfig, mailConnection, sendContractMail, singleEmail } from '../../sales/mail-provider.mjs';

export const campaignOwner = { id: 'owner', name: 'Workspace owner', role: 'owner', states: [] };
export const campaignActions = new Set(['campaign-read', 'campaign-save', 'campaign-run', 'campaign-pause']);
const stamp = now => new Date(now).toISOString();
const normalized = value => localityKey(value).replace(/\b(llc|incorporated|inc|corp|corporation|ltd)\b/g, '').replace(/\s+/g, ' ').trim();
const idOf = candidate => candidate.sourceKind === 'profile' ? candidate.sourceURL :
  officeIdentity(candidate.name, candidate.address, candidate.city, candidate.state);
function clamp(value, min, max, label) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new HttpError(400, 'Choose a valid ' + label + '.');
  return result;
}
function emailValue(value) {
  try { return singleEmail(value); } catch { return ''; }
}
function profileInput(input) {
  if (!['directory', 'registry', 'saved'].includes(input.source) || !['draft', 'send'].includes(input.mode)) {
    throw new HttpError(400, 'Choose a campaign source and email mode.');
  }
  const region = state(input.state);
  if (input.source === 'registry' && region !== 'CT') throw new HttpError(400, 'Public keyword discovery is available for Connecticut. Choose your directory or saved prospects for another state.');
  const city = text(input.city, 100, true), keywords = text(input.keywords, 100, true);
  const interval = Number(input.interval || 0);
  if (interval && (!Number.isInteger(interval) || interval < 60 || interval > 10080)) {
    throw new HttpError(400, 'Choose a repeat interval from 60 to 10,080 minutes, or 0 for manual runs.');
  }
  const senderId = text(input.senderId || '', 24), postalAddress = text(input.postalAddress || '', 240);
  if (input.mode === 'send' && (!senderId || !postalAddress)) throw new HttpError(400, 'Choose an approved sender and enter your business mailing address for automatic email.');
  return { campaignName: text(input.campaignName, 120, true), business: text(input.business, 140, true),
    offer: text(input.offer, 650, true), nextStep: text(input.nextStep, 280, true), state: region, city, keywords,
    source: input.source, mode: input.mode, interval, senderId, postalAddress, limit: clamp(input.limit ?? 5, 1, 20, 'run size') };
}

function evidence(candidate, field, value, sourceURL) {
  return { field, value, sourceURL: sourceURL || candidate.sourceURL, checkedAt: stamp(Date.now()) };
}
function makeDraft(profile, company, sender) {
  const business = company.company || company.name;
  const greeting = 'Hello ' + business + ' team,';
  const identity = sender?.name ? `I’m ${sender.name} with ${profile.business}.` : `I’m reaching out from ${profile.business}.`;
  return {
    subject: `${profile.business} — an introduction for ${business}`.slice(0, 180),
    text: [
      greeting, '',
      `${identity} I came across ${business} while looking for ${profile.keywords} businesses in ${profile.city}, ${profile.state}.`,
      '', profile.offer, '', profile.nextStep, '',
      [sender?.name, profile.business, profile.postalAddress].filter(Boolean).join('\n'),
      '', 'Business outreach. Reply “unsubscribe” to stop these emails.',
    ].join('\n'),
  };
}

export function campaigns(env, db, {
  catalogue = null, findRegistry = searchConnecticutBusinesses, registryDetails = lookupStateBusiness,
  websiteResearch = researchOffice, senderRequest = sendContractMail, now = Date.now,
} = {}) {
  const running = new Set();
  const connection = () => mailConnection(env);
  const campaignRows = id => db.list('campaign-leads').filter(row => row.campaignId === String(id));
  const campaignView = row => ({ id: String(row.id), ...metadata(row), running: running.has(String(row.id)) });
  const getCampaign = id => {
    const row = db.get('campaigns', id);
    if (!row) throw new HttpError(404, 'Campaign not found.');
    return row;
  };
  function availableSenders() {
    return db.list('agents').flatMap(row => {
      const info = metadata(row);
      if (row.status !== 'mailbox' || info.kind !== 'shared' || info.mode !== 'provider' || !info.approvedAt) return [];
      return [{ id: String(row.id), name: row.contact_name, email: row.contact_email, replyTo: info.replyTo }];
    });
  }
  function senderFor(profile) {
    return availableSenders().find(sender => sender.id === profile.senderId);
  }
  function maySend(profile, sender) {
    const config = mailConfig(env);
    return profile.mode === 'send' && config.ready && sender && emailValue(sender.email).endsWith('@' + config.domain) &&
      emailValue(sender.replyTo || sender.email) &&
      (config.mode === 'test' || (env.GIGTAX_SALES_ORIGIN?.startsWith('https://') && Boolean(env.GIGTAX_MAILGUN_WEBHOOK_KEY)));
  }
  function blocked(address, officeId) {
    const office = officeId && db.get('offices', officeId);
    if (office && (['not_interested', 'do_not_contact'].includes(office.status) || metadata(office).primaryContactDoNotContact)) return true;
    return db.suppressedEmail(address) || db.list('offices').some(row => {
      const info = metadata(row);
      return (info.emailOptOuts || []).includes(address) ||
        (row.contact_email === address && (['not_interested', 'do_not_contact'].includes(row.status) || info.primaryContactDoNotContact)) ||
        (info.contacts || []).some(person => person.email === address && person.preference === 'do_not_contact');
    });
  }
  async function discover(profile) {
    if (profile.source === 'registry') return findRegistry(profile.city, profile.keywords, { limit: profile.limit * 3 });
    if (profile.source === 'directory') {
      if (!catalogue) throw new HttpError(503, 'Select a project directory profile with business records.');
      return catalogue(profile.state, profile.city, profile.keywords).slice(0, profile.limit * 3);
    }
    const terms = localityKey(profile.keywords).split(' ');
    const city = localityKey(profile.city);
    return db.list('prospects').filter(row => !row.archived &&
      terms.every(term => localityKey([row.name, row.title, row.company].join(' ')).includes(term)) &&
      (!row.locality || localityKey(row.locality).includes(city)))
      .slice(0, profile.limit).map(row => ({
        sourceKind: 'profile', sourceURL: row.sourceURL, name: row.name, company: row.company || (row.type === 'company' ? row.name : ''),
        city: profile.city, state: profile.state,
        people: row.type === 'person' ? [{ name: row.name, role: row.title, sourceURL: row.sourceURL }] : [],
      }));
  }
  async function enrich(input, profile) {
    let company = input;
    if (input.sourceKind === 'profile' && input.company) {
      const owned = catalogue ? catalogue(profile.state, profile.city, input.company) : [];
      const rows = owned.length ? owned : profile.state === 'CT' ? await findRegistry(profile.city, input.company, { limit: 8 }) : [];
      const exact = rows.filter(row => normalized(row.name) === normalized(input.company) && localityKey(row.city) === localityKey(profile.city));
      if (exact.length === 1) company = { ...exact[0], company: input.company };
    }
    const evidenceFields = [];
    const source = company.sourceURL || company.url;
    for (const field of ['email', 'phone']) if (company[field] && source) evidenceFields.push(evidence(company, field, company[field], source));
    const people = [...(input.people || [])];
    if (input.contact && input.sourceURL) people.push({ name: input.contact, role: input.contactRole || 'Directory contact', sourceURL: input.sourceURL });
    const warnings = [];
    if (company.address && company.state && company.city) {
      try {
        const details = await registryDetails(company);
        const exact = (details.matches || []).find(row => ['registry_record', 'name_and_address'].includes(row.match));
        if (exact) for (const person of (exact.principals || []).slice(0, 12)) {
          if (person.name && person.sourceURL) people.push({ name: person.name, role: person.role, sourceURL: person.sourceURL });
        }
      } catch { warnings.push('Business roles could not be checked.'); }
    }
    if (company.website) {
      try {
        const result = await websiteResearch({ town: company.name, locality: company.city, state: company.state,
          notes: JSON.stringify({ website: company.website }) });
        for (const item of result.evidence || []) {
          if (['email', 'phone'].includes(item.field) && item.sourceURL) evidenceFields.push(evidence(company, item.field, item.value, item.sourceURL));
          if (item.field === 'contact' && item.sourceURL && item.role) people.push({ name: item.value, role: item.role, sourceURL: item.sourceURL });
        }
      } catch { warnings.push('The business website could not be checked.'); }
    }
    return {
      name: company.company || company.name, business: company, sourceURL: input.sourceURL || source || '',
      email: evidenceFields.find(item => item.field === 'email' && emailValue(item.value))?.value?.toLowerCase() || '',
      people: [...new Map(people.map(person => [person.name.toLowerCase() + '|' + person.role, person])).values()].slice(0, 16),
      evidence: evidenceFields.slice(0, 20), warnings,
    };
  }
  async function send(row, profile, sender) {
    if (!maySend(profile, sender)) return false;
    const info = metadata(row), to = row.email;
    if (blocked(to, info.officeId)) return false;
    if (campaignRows(row.campaignId).some(other => other.id !== row.id && other.email === to && metadata(other).attempt)) return false;
    const config = mailConfig(env);
    const attempt = { mode: config.mode, status: 'sending', from: sender.email, replyTo: sender.replyTo || sender.email, to, at: stamp(now()) };
    const reserved = await patchReviewed(db, 'campaign-leads', row, { status: 'sending', notes: JSON.stringify({ ...info, attempt }) });
    if (blocked(to, info.officeId)) {
      await patchReviewed(db, 'campaign-leads', reserved, { status: 'suppressed', notes: JSON.stringify({ ...metadata(reserved), attempt: { ...attempt, status: 'suppressed' } }) });
      return false;
    }
    let result;
    try { result = await senderRequest(config, { ...info.draft, from: attempt.from, fromName: sender.name, replyTo: attempt.replyTo, to }, String(reserved.id)); }
    catch { result = { status: 'uncertain', providerId: null }; }
    const current = db.get('campaign-leads', reserved.id), saved = metadata(current);
    if (current.status === 'sending') {
      const status = result.status === 'accepted' && config.mode === 'test' ? 'test_accepted' : result.status;
      await patchReviewed(db, 'campaign-leads', current, { status, notes: JSON.stringify({ ...saved, attempt: { ...saved.attempt, status, providerId: result.providerId } }) });
    }
    return true;
  }
  async function run(id, user, sales) {
    const row = getCampaign(id), key = String(row.id);
    if (running.has(key)) throw new HttpError(409, 'This campaign is already running.');
    running.add(key);
    try {
      const profile = metadata(row), sender = senderFor(profile);
      const started = now();
      await patchReviewed(db, 'campaigns', row, { notes: JSON.stringify({ ...profile, nextAt: profile.interval ? started + profile.interval * 60000 : null, lastRun: stamp(started), lastError: null }) });
      const candidates = await discover(profile);
      let saved = 0, submitted = 0;
      for (const candidate of candidates) {
        if (saved >= profile.limit) break;
        const leadKey = digest(idOf(candidate));
        const existing = campaignRows(key).find(lead => lead.leadKey === leadKey);
        if (existing && (metadata(existing).attempt || (profile.mode === 'draft' && existing.email))) continue;
        const found = await enrich(candidate, profile);
        let officeId = existing ? metadata(existing).officeId : null;
        const company = found.business;
        if (!officeId && company.address && company.city) {
          const zip = /^\d{5}(?:-\d{4})?$/.test(company.zip || '') ? company.zip : '';
          try {
            const savedOffice = await sales(user, 'create-office', { name: company.name, address: company.address, city: company.city, state: company.state, postalCode: zip,
              website: company.website || '', source: company.sourceURL || company.url || '', email: found.email });
            officeId = String(savedOffice.office.id);
          } catch (error) {
            if (error.status === 409) {
              found.warnings.push('An existing pipeline assignment needs owner review.');
            } else if (error.status === 400) {
              found.warnings.push('Review the published address before adding this company to Pipeline.');
            } else throw error;
          }
        }
        const status = found.email ? blocked(found.email, officeId) ? 'suppressed' : 'ready' : 'needs_contact';
        const notes = JSON.stringify({ sourceURL: found.sourceURL, officeId, evidence: found.evidence, people: found.people, warnings: found.warnings,
          draft: makeDraft(profile, found, sender) });
        const lead = existing
          ? await patchReviewed(db, 'campaign-leads', existing, { email: found.email, status, notes })
          : db.saveCampaignLead({ campaignId: key, leadKey, name: found.name, email: found.email, status, notes });
        saved++;
        if (lead.status === 'ready' && !metadata(lead).attempt && (!company.address || officeId) && await send(lead, profile, sender)) submitted++;
      }
      return { found: candidates.length, saved, submitted, senderReady: Boolean(maySend(profile, sender)) };
    } finally { running.delete(key); }
  }

  async function dispatch(user, action, body, sales) {
    if (user.role !== 'owner') throw new HttpError(403, 'Only the workspace owner can manage campaigns.');
    if (action === 'campaign-read') return {
      campaigns: db.list('campaigns').reverse().map(campaignView), connection: connection(), senders: availableSenders(),
      leads: body.id ? campaignRows(getCampaign(body.id).id).reverse().slice(0, 100).map(row => ({ id: String(row.id), name: row.name, email: row.email, status: row.status, ...metadata(row) })) : [],
    };
    if (action === 'campaign-save') {
      const profile = profileInput(body);
      const current = body.id ? getCampaign(body.id) : null;
      if (current && running.has(String(current.id))) throw new HttpError(409, 'Wait for this campaign to finish before changing it.');
      if (current && metadata(current).revision !== body.revision) throw new HttpError(409, 'This campaign changed. Reload before saving.');
      const notes = JSON.stringify({ ...profile, nextAt: profile.interval ? now() + profile.interval * 60000 : null,
        lastRun: current ? metadata(current).lastRun : null, revision: current ? metadata(current).revision : digest(JSON.stringify(profile) + now()) });
      const row = current ? await patchReviewed(db, 'campaigns', current, { notes }) : db.create('campaigns', { notes });
      return { campaign: campaignView(row) };
    }
    if (action === 'campaign-pause') {
      const row = getCampaign(body.id);
      if (running.has(String(row.id))) throw new HttpError(409, 'This campaign is completing its current run.');
      const updated = await patchReviewed(db, 'campaigns', row, { notes: JSON.stringify({ ...metadata(row), interval: 0, nextAt: null }) });
      return { campaign: campaignView(updated) };
    }
    return run(body.id, user, sales);
  }
  async function tick(sales) {
    for (const row of db.list('campaigns')) {
      const profile = metadata(row);
      if (profile.interval && profile.nextAt && profile.nextAt <= now() && !running.has(String(row.id))) {
        try { await run(row.id, campaignOwner, sales); }
        catch (error) {
          const current = getCampaign(row.id);
          await patchReviewed(db, 'campaigns', current, { notes: JSON.stringify({ ...metadata(current), lastError: error instanceof HttpError ? error.message : 'The scheduled research run did not finish.' }) }).catch(() => {});
        }
      }
    }
  }
  return { dispatch, tick };
}
