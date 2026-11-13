import { HttpError } from './model.mjs';
import { publicText } from './public-data.mjs';
import { validLocation } from './geocoding.mjs';
import { isTaxBusiness, matchBusiness } from './registry-matching.mjs';
export { normalizedBusiness } from './registry-matching.mjs';

// Official CT Secretary of the State datasets. Select only professional fields;
// principal residence addresses and demographic survey fields are never read.
export const CT_BUSINESSES = 'https://data.ct.gov/resource/n7gp-d28j.json';
export const CT_PRINCIPALS = 'https://data.ct.gov/resource/ka36-64k6.json';
const SELECT = 'id,name,status,business_type,accountnumber,billingstreet,billing_unit,billingcity,billingstate,billingpostalcode,business_email_address,naics_code,naics_sub_code,create_dt,geo_location';
const cache = new Map();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
export function registryMatch(candidate, row) {
  return matchBusiness(candidate,businessRecord(row));
}
async function query(endpoint, where, select, limit, fetcher) {
  const url = new URL(endpoint); url.searchParams.set('$where', where); url.searchParams.set('$select', select); url.searchParams.set('$limit', String(limit)); url.searchParams.set('$order', endpoint === CT_BUSINESSES ? 'name,id' : 'name__c');
  const cached = cache.get(url.href); if (cached?.expires > Date.now()) return structuredClone(cached.value);
  const response = await fetcher(url, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)' } });
  const rows = JSON.parse(await publicText(response)); if (!Array.isArray(rows)) throw new HttpError(502, 'The business registry returned an unsupported response.');
  if (cache.size >= 250) cache.delete(cache.keys().next().value);
  cache.set(url.href, { value: rows, expires: Date.now() + 3600000 }); return rows;
}
export function businessSource(id) { const url = new URL(CT_BUSINESSES); url.searchParams.set('$where', `id=${literal(id)}`); url.searchParams.set('$select', SELECT); return url.href; }
export function businessRecord(row) {
  const coordinates = row.geo_location?.coordinates, valid = Array.isArray(coordinates) && coordinates.length === 2 && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]));
  return { registryId: String(row.id), name: String(row.name || ''), legalName: String(row.name || ''), address: [row.billingstreet, row.billing_unit].filter(Boolean).join(', '),
    city: row.billingcity || '', state: row.billingstate || 'CT', zip: row.billingpostalcode || '', businessId: row.accountnumber || '', status: row.status || '', businessType: row.business_type || '',
    email: /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(row.business_email_address || '') ? row.business_email_address : '', industry: [row.naics_code, row.naics_sub_code].filter(Boolean).join(' · '),
    extractedAt: row.create_dt || null, sourceURL: businessSource(row.id), sourceKind: 'ct_registry', registryState:'CT', sourceName:'Connecticut business registry',
    ...(valid && validLocation(row.billingstate || 'CT', Number(coordinates[1]), Number(coordinates[0])) ? { location: { lat: Number(coordinates[1]), lng: Number(coordinates[0]), source: 'Connecticut registry', precision: 'Registered business address' } } : {}) };
}
export async function taxBusinesses(region, locality, fetcher = fetch) {
  if (region !== 'CT') return { supported: false, results: [], truncated: false };
  const place = String(locality).trim(), condition = /^\d{3,5}$/.test(place) ? `billingpostalcode like ${literal(place + '%')}` : `upper(billingcity)=${literal(place.toUpperCase())}`;
  const rows = await query(CT_BUSINESSES, `upper(billingstate)='CT' and upper(status)='ACTIVE' and ${condition} and (upper(name) like '%TAX%' or upper(name) like '%ACCOUNT%' or upper(name) like '%BOOKKEEP%' or naics_code like '%54121%' or naics_sub_code like '54121%')`, SELECT, 501, fetcher);
  return { supported: true, results: rows.slice(0, 500).filter(isTaxBusiness).map(businessRecord), truncated: rows.length > 500, source: 'https://data.ct.gov/d/n7gp-d28j' };
}
export async function lookupBusiness(candidate, fetcher = fetch) {
  if (candidate.state !== 'CT') return { supported: false, matches: [], message: 'Automatic registry cross-reference currently supports Connecticut. Use the office website and its state business registry to review ownership.' };
  let rows;
  if (candidate.registryId) rows = await query(CT_BUSINESSES, `id=${literal(candidate.registryId)}`, SELECT, 1, fetcher);
  else {
    const words = String(candidate.name).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 1 && !['LLC','INC','CORP','AND','THE'].includes(word)).slice(0, 4);
    const nameCondition = words.length ? words.map(word => `upper(name) like ${literal('%' + word + '%')}`).join(' and ') : 'false';
    const streetParts = String(candidate.address || '').toUpperCase().match(/^[\s]*(\d+[A-Z]?)\s+([A-Z0-9]+)/);
    const addressCondition = streetParts ? `upper(billingcity)=${literal(String(candidate.city).toUpperCase())} and upper(billingstreet) like ${literal(streetParts[1] + ' %' + streetParts[2] + '%')}` : 'false';
    const queries = await Promise.all([nameCondition, addressCondition].map(condition => query(CT_BUSINESSES, `upper(billingstate)='CT' and (${condition})`, SELECT, 20, fetcher)));
    rows = [...new Map(queries.flat().map(row => [row.id, row])).values()];
  }
  const scored = rows.map(row => registryMatch(candidate, row)).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6);
  const matches = await Promise.all(scored.map(async record => {
    const source = new URL(CT_PRINCIPALS); source.searchParams.set('$where', `business_id=${literal(record.registryId)}`); source.searchParams.set('$select', 'business_id,name__c,designation,type,create_dt');
    try {
      const people = await query(CT_PRINCIPALS, `business_id=${literal(record.registryId)}`, 'business_id,name__c,firstname,middlename,lastname,suffix,designation,type,create_dt', 101, fetcher);
      return { ...record, principals: people.slice(0, 100).map(person => ({ name: person.name__c || [person.firstname, person.middlename, person.lastname, person.suffix].filter(Boolean).join(' '), role: person.designation || 'Principal · role not supplied', type: person.type || '', sourceURL: source.href, extractedAt: person.create_dt || null })), principalsTruncated: people.length > 100 };
    } catch { return { ...record, principals: [], principalIssue: 'Principal records could not be loaded. Open the registry source or retry.' }; }
  }));
  return { supported: true, checkedAt: new Date().toISOString(), matches, message: matches.length ? 'Compare the legal name and address before linking a business. Listed principals, officers and managers are not automatically confirmed owners. A registered agent is not an owner finding.' : 'No matching CT entity was found. A sole proprietor or local trade name may not appear in this entity registry. Review the office website and municipal trade-name records.' };
}
