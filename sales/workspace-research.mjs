import { randomUUID } from 'node:crypto';
import { HttpError, email, officeIdentity, state, text } from './model.mjs';
import { localityAllowed, localityKey } from './territory-access.mjs';
import { researchOffice } from './research.mjs';
import { lookupStateBusiness } from './state-registry.mjs';
import { businessCategory, mappedBusinesses, nursingHomes } from './business-category-sources.mjs';

const actions = new Set(['business-research', 'business-research-last', 'business-research-save']);
const recordKey = company => officeIdentity(company.name, company.address, company.city, company.state);
const emailOf = value => { try { return email(value); } catch { return ''; } };

export function workspaceResearch(db, {
  catalogue, searchMap = mappedBusinesses, searchNursing = nursingHomes,
  checkWebsite = researchOffice, checkRegistry = lookupStateBusiness,
} = {}) {
  const cache = new Map();
  let running = false;

  async function enrich(company) {
    const warnings = [];
    const [website, registry] = await Promise.allSettled([
      company.website ? checkWebsite({ website: company.website }, { maxPages: 2, totalTimeoutMs: 7500 }) : null,
      company.address ? checkRegistry(company) : null,
    ]);
    const site = website.value, registration = registry.value;
    const facts = (site?.evidence || []).filter(item => item.sourceURL && ['email', 'phone', 'contact'].includes(item.field));
    const exact = registration?.matches?.find(match => ['registry_record', 'name_and_address'].includes(match.match));
    const roles = (exact?.principals || []).filter(item => item.name && item.sourceURL).slice(0, 8);
    if (website.status === 'rejected' || (company.website && !site?.pages?.length)) warnings.push('The listed website could not be checked.');
    if (registry.status === 'rejected' || registration?.available === false) warnings.push('The business registry could not be checked.');
    if (!company.address) warnings.push('The directory did not publish a street address.');
    return { ...company, email: emailOf(company.email) || emailOf(facts.find(item => item.field === 'email')?.value),
      phone: company.phone || facts.find(item => item.field === 'phone')?.value || '',
      roles, facts: facts.slice(0, 8), warnings };
  }

  async function discover(query) {
    const key = JSON.stringify([query.state, localityKey(query.locality), query.category]);
    const existing = cache.get(key);
    if (existing?.expires > Date.now()) return existing.result;
    const sources = [['OpenStreetMap', searchMap(query)]];
    if (query.category === 'nursing home') sources.unshift(['CMS Care Compare', searchNursing(query)]);
    const outcomes = await Promise.allSettled(sources.map(([, work]) => work));
    const issues = outcomes.flatMap((outcome, index) => outcome.status === 'rejected' ? [sources[index][0] + ' is temporarily unavailable.'] : []);
    const project = catalogue?.(query.state, query.locality, query.category).map(row => ({ ...row, sourceName: 'Project directory' })) || [];
    const candidates = [...outcomes.flatMap(outcome => outcome.value || []), ...project];
    const merged = new Map();
    for (const candidate of candidates) {
      const key = recordKey(candidate);
      const found = merged.get(key);
      if (found) {
        for (const field of ['website', 'email', 'phone']) if (!found[field] && candidate[field]) found[field] = candidate[field];
      } else merged.set(key, { ...candidate });
    }
    const result = { companies: [...merged.values()], issues };
    if (!issues.length) {
      if (cache.size >= 40) cache.delete(cache.keys().next().value);
      cache.set(key, { expires: Date.now() + 10 * 60000, result });
    }
    return result;
  }

  async function dispatch(user, action, input, sales) {
    if (action === 'business-research-last') {
      const prior = db.lastResearch(user.id);
      if (!prior || !localityAllowed(user, prior.state, prior.locality)) return { research: null };
      return { research: { ...prior, companies: prior.companies.filter(company => localityAllowed(user, company.state, company.city)) } };
    }
    if (action === 'business-research-save') {
      const run = db.lastResearch(user.id);
      const company = run?.id === input.runId && run?.companies.find(item => item.id === input.companyId);
      if (!company || !company.address || !company.city || !localityAllowed(user, company.state, company.city)) {
        throw new HttpError(409, 'Run the search again or choose a result with a published address in your territory.');
      }
      const category = businessCategory(run.type);
      const facility = ['senior center', 'nursing home'].includes(category) ? { facilityType: category.replace(' ', '-') } : undefined;
      return sales(user, 'create-office', { ...company, contact: '', source: company.sourceURL }, facility);
    }
    const region = state(input.state);
    const location = text(input.locality, 100, true);
    const type = text(input.type, 80, true), category = businessCategory(type);
    if (category.length < 2) throw new HttpError(400, 'Enter a business type such as senior center or nursing home.');
    if (!localityAllowed(user, region, location)) throw new HttpError(403, 'Choose a city in your assigned territory.');
    if (running) throw new HttpError(409, 'A research run is already in progress. Try again when it finishes.');
    running = true;
    try {
      const query = { category, state: region, locality: location, zip: /^\d{5}$/.test(location) ? location : '' };
      const { companies, issues } = await discover(query);
      const eligible = companies.filter(company => localityAllowed(user, company.state, company.city));
      const researched = await Promise.all(eligible.slice(0, 8).map(enrich));
      const research = { id: randomUUID(), type, state: region, locality: location, total: eligible.length,
        issues, companies: researched.map(company => ({ ...company, id: randomUUID() })), at: new Date().toISOString() };
      db.setLastResearch(user.id, research);
      return { research };
    } finally {
      running = false;
    }
  }
  return { actions, dispatch };
}
