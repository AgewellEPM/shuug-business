import { HttpError, digest, officeIdentity, seal, state, text, unseal } from './model.mjs';
import { discoverOffices, nationalChain } from './discovery.mjs';
import { stateTaxBusinesses, lookupStateBusiness } from './state-registry.mjs';
import { allRegistryCoverage, registryCoverage } from './registry-catalog.mjs';
import { geocodeCandidates } from './geocoding.mjs';
import { researchLocalContacts } from './local-contacts.mjs';

export function localDiscovery(env, { fetcher = fetch, discoverer = discoverOffices, registry = stateTaxBusinesses, lookup = lookupStateBusiness, geocoder = geocodeCandidates, search, researcher, checkCandidate = async () => {}, now = Date.now } = {}) {
  const permitted = (user, region) => { if (user.role !== 'owner' && user.states?.length && !user.states.includes(region)) throw new HttpError(403, 'This state is outside your territory.'); };
  const tokenFor = (user, candidate, detailed = false) => {
    const { candidateId, name, address, city, state, zip, registryId, registryState, contact, phone, email, sourceURL, url, contactRole, contactSourceURL } = candidate;
    return seal({ purpose: 'local-business-candidate', actorId: String(user.id), candidate: { candidateId, name, address, city, state, zip, registryId, registryState, ...(detailed ? { contact, phone, email, sourceURL, url, contactRole, contactSourceURL } : {}) }, exp: now() + 3600000 }, env.GIGTAX_SALES_SESSION_KEY);
  };
  const read = (user, token) => { const value = unseal(token || '', env.GIGTAX_SALES_SESSION_KEY); if (!value || value.purpose !== 'local-business-candidate' || value.actorId !== String(user.id) || value.exp <= now()) throw new HttpError(409, 'This search result expired or belongs to another agent. Search again.'); permitted(user, value.candidate.state); return value.candidate; };
  return async (user, action, body) => {
    if(action==='state-coverage')return {states:allRegistryCoverage().filter(row=>user.role==='owner'||!user.states?.length||user.states.includes(row.state))};
    if (action === 'map-geocode') {
      if (!Array.isArray(body.candidateTokens) || body.candidateTokens.length < 1 || body.candidateTokens.length > 25) throw new HttpError(400, 'Choose up to 25 search results to map.');
      return { results: await geocoder(body.candidateTokens.map(token => read(user, token)), fetcher) };
    }
    if (action === 'research-local-contacts') {
      const candidate = read(user, body.candidateToken); await checkCandidate(user,candidate);
      return researchLocalContacts(candidate, body, { search, researcher, now });
    }
    if (action === 'lookup-business') {
      const report = await lookup(read(user, body.candidateToken), fetcher);
      return { ...report, matches:(report.matches || []).map(record => ({ ...record,
        researchToken:tokenFor(user,record,true), principals:(record.principals || []).map(person => ({ ...person,
          researchToken:tokenFor(user,{ ...record, contact:person.name, contactRole:person.role, contactSourceURL:person.sourceURL },true) })) })) };
    }
    if (action !== 'search-local') throw new HttpError(404, 'Unknown local search action.');
    const region = state(body.state), query = text(body.city, 100, true); permitted(user, region);
    const first = await discoverer(region, query, fetcher, { includeChains: true, exactCity: true, offset: 0, limit: 50 });
    const candidates = first.results.map(row => ({ ...row, sourceKind: 'irs', sourceURL: row.url }));
    for (let offset = 50; offset < Math.min(first.total, 500); offset += 50) {
      const page = await discoverer(region, first.locality || query, fetcher, { includeChains: true, exactCity: true, offset, limit: 50 }); candidates.push(...page.results.map(row => ({ ...row, sourceKind: 'irs', sourceURL: row.url })));
    }
    const issues = [];
    let registration = { supported: registryCoverage(region).automaticRecords, results: [], truncated: false }, registryAvailable=true;
    try { registration = await registry(region, first.locality || query, fetcher); }
    catch { registryAvailable=false; issues.push('The state registry search is temporarily unavailable. IRS results are shown; retry to include registered businesses.'); }
    const merged = new Map(candidates.map(row => [officeIdentity(row.name, row.address, row.city, row.state), row]));
    for (const row of registration.results) {
      const identity = officeIdentity(row.name, row.address, row.city, row.state), existing = merged.get(identity);
      if (existing) Object.assign(existing, { registryId: row.registryId, registryState:row.registryState || region, registrySource: row.sourceURL, registryStatus: row.status, ...(row.location ? { location: row.location } : {}) });
      else merged.set(identity, { ...row, candidateId: digest(identity).slice(0, 24), chain: nationalChain(row.name), contact: '', phone: '', url: row.sourceURL, title: row.name, independence: 'unverified', contactRole: 'unverified' });
    }
    const results = [...merged.values()].slice(0, 700).map(candidate => ({ ...candidate, candidateToken: tokenFor(user, candidate), researchToken:tokenFor(user,candidate,true) }));
    return { results, city: first.locality || query, query, correction: first.correction || null, state: region, total: results.length, irsTotal: first.total,
      registryTotal: registration.results.length, registrySupported: registration.supported, registryAvailable, registryCoverage:registryCoverage(region), truncated: first.total > 500 || registration.truncated || merged.size > 700,
      checkedAt: new Date(now()).toISOString(), issues, message: `${first.correction ? `Showing ${first.locality} for “${query}”. ` : ''}${results.length} public tax/accounting candidates found. Chains included. Select a location to compare business records and listed principals.`,
      coverage: 'IRS e-file providers plus published tax/accounting business records where connected. Check record status: registrations, service addresses and tax accounts do not prove an operating storefront. Public records can be incomplete or outdated. Unmatched addresses stay in the list without a guessed pin.' };
  };
}
