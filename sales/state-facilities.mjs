import { HttpError, email, metadata, officeIdentity, state, text, visible } from './model.mjs';
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

export function stateFacilityDirectory({ db, load = loadStateFacilities, now = Date.now } = {}) {
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

  return async function directory(user, input, saveOffice) {
    const region = state(input.state), category = input.category;
    if (!stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
    if (!categories.has(category)) throw new HttpError(400, 'Choose nursing homes or senior community centers.');
    if (saveOffice) {
      const source = text(input.sourceURL, 1200, true);
      const { results } = await reportFor(region, category);
      const row = results.find(item => item.sourceURL === source && localityAllowed(user, region, item.city));
      if (!row) throw new HttpError(404, 'This facility is unavailable in your territory. Refresh the directory.');
      // Some public maps omit a street or city. Use reviewed inputs only for the missing fields.
      let addressEmail = '';
      if (row.email) {
        try { addressEmail = email(row.email); } catch { /* Keep unstructured source text in the directory. */ }
      }
      return saveOffice({ ...row, source, email: addressEmail,
        address: row.address || text(input.address, 300, true), city: row.city || text(input.city, 100, true) },
        { facilityType: category, facilitySource: source });
    }
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
    const page = matches.slice(offset, offset + pageSize);
    if (db && page.length) {
      const saved = new Map();
      for (const office of await db.list('offices')) {
        if (office.state !== region || !visible(user, office)) continue;
        const info = metadata(office);
        if (info.facilityType !== category) continue;
        if (info.facilitySource || info.source) saved.set(info.facilitySource || info.source, office.id);
        saved.set(officeIdentity(office.town, info.address, office.locality, region), office.id);
      }
      for (const [index, row] of page.entries()) {
        const id = saved.get(row.sourceURL) || saved.get(officeIdentity(row.name, row.address, row.city, region));
        if (id) page[index] = { ...row, savedOfficeId: id };
      }
    }
    return { state: region, category, results: page,
      total: matches.length, offset, limit: pageSize, hasMore: offset + pageSize < matches.length, coverage, sources, issues };
  };
}
