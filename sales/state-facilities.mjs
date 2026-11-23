import { HttpError, officeIdentity, state, text } from './model.mjs';
import { localityAllowed, localityKey, stateAllowed } from './territory-access.mjs';
import { loadStateFacilities } from './state-facility-sources.mjs';

const categories = new Set(['nursing-home', 'senior-center']);
const pageSize = 25;
const alphabetical = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

function sortedFacilities(rows, region) {
  const unique = new Map();
  for (const row of rows) {
    if (row.state !== region) continue;
    const key = row.address && row.city ? officeIdentity(row.name, row.address, row.city, region) : row.sourceURL;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => alphabetical.compare(a.city || '', b.city || '') ||
    alphabetical.compare(a.name, b.name) || alphabetical.compare(a.address || '', b.address || '') ||
    a.sourceURL.localeCompare(b.sourceURL));
}

export function stateFacilityDirectory({ load = loadStateFacilities, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();

  async function reportFor(region, category) {
    const key = region + ':' + category;
    const previous = cache.get(key);
    if (previous?.expires > now()) return previous.report;
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(() => load({ state: region, category })).then(data => {
      const report = { ...data, results: sortedFacilities(data.results, region), issues: data.issues || [] };
      cache.delete(key);
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      cache.set(key, { report, expires: now() + (report.issues.length ? 60000 : 900000) });
      return report;
    }).catch(error => {
      if (error instanceof HttpError && error.status >= 500) throw error;
      throw new HttpError(502, 'The public facility directory is temporarily unavailable. Please try again.');
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  return async function browse(user, input) {
    const region = state(input.state), category = input.category;
    if (!stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
    if (!categories.has(category)) throw new HttpError(400, 'Choose nursing homes or senior community centers.');
    const offset = input.offset === undefined ? 0 : Number(input.offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new HttpError(400, 'Choose a valid facility page.');
    const query = localityKey(text(input.query ?? '', 100));
    const terms = query ? query.split(' ') : [];
    const { results, coverage, sources, issues } = await reportFor(region, category);
    const matches = results.filter(row => {
      if (!localityAllowed(user, region, row.city)) return false;
      const label = localityKey([row.name, row.city, row.zip].join(' '));
      return terms.every(term => label.includes(term));
    });
    return { state: region, category, results: matches.slice(offset, offset + pageSize),
      total: matches.length, offset, limit: pageSize, hasMore: offset + pageSize < matches.length, coverage, sources, issues };
  };
}
