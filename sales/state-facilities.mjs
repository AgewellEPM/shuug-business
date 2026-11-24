import { HttpError, email, metadata, officeIdentity, state, text, visible } from './model.mjs';
import { localityAllowed, localityKey, stateAllowed } from './territory-access.mjs';
import { publishedFacilityAdministrator, publishedFacilityProfile } from './facility-administrators.mjs';
import { loadStateFacilities } from './state-facility-sources.mjs';

const categories = new Set(['nursing-home', 'senior-center']);
const pageSize = 25;
const alphabetical = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });
const maxCertifiedBeds = 9999;

function searchBound(value, min, max, message) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const count = typeof value === 'string' && /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : value;
  if (!Number.isInteger(count) || count < min || count > max) throw new HttpError(400, message);
  return count;
}

const bedBound = value => searchBound(value, 0, maxCertifiedBeds, 'Enter a whole certified bed count between 0 and 9,999.');

function certifiedBeds(row) {
  const count = row.cms?.beds;
  return Number.isInteger(count) && count >= 0 && count <= maxCertifiedBeds ? count : null;
}

function cmsRating(row) {
  const rating = row.cms?.overallRating;
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

function cmsFacts(row) {
  if (!row.cms) return {};
  return { facilityCertifiedBeds: certifiedBeds(row), facilityBedSource: row.sourceURL,
    facilityBedDate: row.cms.processingDate || '', facilityCmsRating: cmsRating(row), facilityCmsRatingSource: row.sourceURL };
}

export async function directoryFacility(directory, user, input) {
  const sourceURL = text(input.sourceURL, 1200, true);
  const { results } = await directory(user, { state: input.state, category: input.category, sourceURL });
  const facility = results[0];
  if (facility?.sourceURL !== sourceURL) throw new HttpError(404, 'Facility not found in your territory.');
  return facility;
}

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
      const facilityAdministrator = category === 'nursing-home' ? publishedFacilityAdministrator(row) : null;
      return saveOffice({ ...row, source, email: addressEmail,
        address: row.address || text(input.address, 300, true), city: row.city || text(input.city, 100, true) },
        { facilityType: category, facilitySource: source, ...cmsFacts(row), ...(facilityAdministrator ? { facilityAdministrator } : {}) });
    }
    const offset = input.offset === undefined ? 0 : Number(input.offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new HttpError(400, 'Choose a valid facility page.');
    const minBeds = bedBound(input.minBeds), maxBeds = bedBound(input.maxBeds);
    const maxCmsRating = searchBound(input.maxCmsRating, 1, 5, 'Choose a maximum CMS overall rating from 1 to 5 stars.');
    if (minBeds !== null && maxBeds !== null && minBeds > maxBeds) {
      throw new HttpError(400, 'Minimum certified beds must be no greater than maximum certified beds.');
    }
    const sourceURL = text(input.sourceURL ?? '', 1200);
    const query = localityKey(text(input.query ?? '', 100));
    const terms = query ? query.split(' ') : [];
    const { results, coverage, sources, issues } = await reportFor(region, category);
    const scopedMatches = results.filter(row => {
      if ((sourceURL && row.sourceURL !== sourceURL) || !localityAllowed(user, region, row.city)) return false;
      const label = localityKey([row.name, row.city, row.zip].join(' '));
      return terms.every(term => label.includes(term));
    });
    const bedsKnown = scopedMatches.filter(row => certifiedBeds(row) !== null).length;
    const bedMatches = minBeds === null && maxBeds === null ? scopedMatches : scopedMatches.filter(row => {
      const count = certifiedBeds(row);
      return count !== null && count >= (minBeds ?? 0) && count <= (maxBeds ?? maxCertifiedBeds);
    });
    const ratingsKnown = bedMatches.filter(row => cmsRating(row) !== null).length;
    const matches = maxCmsRating === null ? bedMatches : bedMatches.filter(row => {
      const rating = cmsRating(row);
      return rating !== null && rating <= maxCmsRating;
    });
    const administrators = category === 'nursing-home'
      ? new Map(matches.flatMap(row => {
        const person = publishedFacilityAdministrator(row);
        return person ? [[row.sourceURL, person]] : [];
      })) : new Map();
    const page = matches.slice(offset, offset + pageSize).map(row => {
      const administrator = administrators.get(row.sourceURL);
      const profile = category === 'nursing-home' ? publishedFacilityProfile(row) : null;
      return { ...row, certifiedBeds: certifiedBeds(row), cmsRating: cmsRating(row),
        ...(administrator ? { administrator } : {}), ...(profile ? { profile } : {}) };
    });
    const savedFacilityResearch = [];
    if (db && (page.length || category === 'nursing-home')) {
      const saved = new Map();
      for (const office of await db.list('offices')) {
        if (office.state !== region || !visible(user, office)) continue;
        const info = metadata(office);
        if (info.facilityType !== category && !(category === 'nursing-home' && !info.facilityType)) continue;
        if (info.facilitySource || info.source) saved.set(info.facilitySource || info.source, office.id);
        if (info.address && office.locality) saved.set(officeIdentity(office.town, info.address, office.locality, region), office.id);
      }
      const savedId = row => saved.get(row.sourceURL) ||
        (row.address && row.city ? saved.get(officeIdentity(row.name, row.address, row.city, region)) : undefined);
      for (const [index, row] of page.entries()) {
        const id = savedId(row);
        if (id) page[index] = { ...row, savedOfficeId: id };
      }
      if (category === 'nursing-home' && saved.size) {
        for (const row of results) {
          const officeId = row.cms && savedId(row);
          if (!officeId || (sourceURL && row.sourceURL !== sourceURL) || !localityAllowed(user, region, row.city)) continue;
          savedFacilityResearch.push({ officeId, certifiedBeds: certifiedBeds(row), cmsRating: cmsRating(row),
            processingDate: row.cms.processingDate || '', sourceURL: row.sourceURL });
        }
      }
    }
    return { state: region, category, results: page,
      total: matches.length, namedAdministrators: administrators.size,
      bedCoverage: { known: bedsKnown, unknown: scopedMatches.length - bedsKnown },
      cmsRatingCoverage: { known: ratingsKnown, unknown: bedMatches.length - ratingsKnown },
      filters: { minBeds, maxBeds, maxCmsRating }, savedFacilityResearch,
      offset, limit: pageSize, hasMore: offset + pageSize < matches.length, coverage, sources, issues };
  };
}
