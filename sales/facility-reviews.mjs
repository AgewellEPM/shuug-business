import { publicText } from './public-data.mjs';
import { localityKey } from './territory-access.mjs';

const places = 'https://places.googleapis.com/v1/places';
const searchFields = 'places.id,places.displayName,places.addressComponents,places.businessStatus';
const detailsFields = 'id,googleMapsUri,googleMapsLinks.reviewsUri,rating,userRatingCount,reviews,reviewSummary,attributions';
const mapHosts = new Set(['www.google.com', 'google.com', 'maps.google.com', 'maps.app.goo.gl', 'g.page', 'goo.gl',
  'search.google.com', 'support.google.com', 'contributions.google.com']);
const streetTerms = {
  avenue: 'ave', boulevard: 'blvd', circle: 'cir', court: 'ct', drive: 'dr', highway: 'hwy', lane: 'ln',
  parkway: 'pkwy', place: 'pl', road: 'rd', street: 'st', terrace: 'ter', trail: 'trl',
  north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};
const genericNameTerms = new Set(['a', 'and', 'at', 'the', 'of', 'health', 'healthcare', 'care', 'rehabilitation', 'rehab',
  'nursing', 'senior', 'home', 'center', 'centre', 'skilled', 'living', 'community', 'facility', 'hospital', 'group',
  'services', 'llc', 'llp', 'lp', 'inc', 'ltd', 'corporation', 'corp']);
const labels = value => localityKey(String(value || ''));
const zip5 = value => /^\d{5}/.exec(String(value || ''))?.[0] || '';
const words = value => labels(value).split(' ').filter(word => word.length > 2 && !genericNameTerms.has(word));

function streetKey(value) {
  const address = String(value || '').split(/\s+(?:suite|ste|unit|apt)\b|\s*#/i)[0].normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/\b(north|south)[ -]+(east|west)\b/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim();
  return address.split(' ').map(word => Object.hasOwn(streetTerms, word) ? streetTerms[word] : word).join(' ');
}

function isGoogleListing(facility, candidate) {
  if (!/^[a-z0-9_-]{8,256}$/i.test(candidate?.id ?? '') || candidate.businessStatus === 'CLOSED_PERMANENTLY') return false;
  const parts = Array.isArray(candidate.addressComponents) ? candidate.addressComponents : [];
  const part = type => parts.find(component => component?.types?.includes(type));
  const short = type => part(type)?.shortText;
  const long = type => part(type)?.longText;
  if (short('country') !== 'US' || short('administrative_area_level_1') !== facility.state) return false;
  const sameCity = Boolean(facility.city) && ['locality', 'postal_town', 'sublocality_level_1'].some(type => labels(long(type)) === labels(facility.city));
  const zip = zip5(facility.zip);
  const sameZip = zip && zip === zip5(long('postal_code'));
  const name = candidate.displayName?.text;
  const exactName = labels(facility.name) === labels(name);
  if (!facility.address) return sameCity && exactName;
  const number = long('street_number'), route = long('route');
  if (!number || !route || !(sameCity || sameZip) || streetKey(facility.address) !== streetKey(number + ' ' + route)) return false;
  const candidateWords = new Set(words(name));
  return exactName || words(facility.name).some(word => candidateWords.has(word));
}

function choosePlace(facility, rows) {
  const matches = [...new Map(rows.filter(row => isGoogleListing(facility, row)).map(row => [row.id, row])).values()];
  if (matches.length === 1) return matches[0];
  const exact = matches.filter(row => labels(row.displayName?.text) === labels(facility.name));
  return exact.length === 1 ? exact[0] : null;
}

function safeURL(value, allowed = () => true) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && allowed(url.hostname)) return url.href;
  } catch { /* Omit malformed upstream links. */ }
  return '';
}

const googleURL = value => safeURL(value, host => mapHosts.has(host));
const localText = value => typeof value?.text === 'string' ? value.text : '';
const ratingValue = value => typeof value === 'number' && value >= 1 && value <= 5 ? value : null;

function reviewResult(row) {
  const { displayName, uri, photoUri } = row?.authorAttribution || {};
  const rating = ratingValue(row?.rating);
  const url = googleURL(row?.googleMapsUri);
  if (!Number.isInteger(rating) || typeof displayName !== 'string' || !displayName || !url) return null;
  return {
    rating, url, text: localText(row.text), originalText: localText(row.originalText),
    relativeTime: typeof row.relativePublishTimeDescription === 'string' ? row.relativePublishTimeDescription : '',
    author: { name: displayName, url: googleURL(uri), photo: safeURL(photoUri, host => /^lh\d+\.googleusercontent\.com$/.test(host)) },
  };
}

function projectDetails(detail) {
  const summary = detail.reviewSummary;
  const summaryText = localText(summary?.text);
  const disclosure = localText(summary?.disclosureText);
  const reportURL = googleURL(summary?.flagContentUri), reviewsURL = googleURL(summary?.reviewsUri);
  return {
    status: 'ready',
    url: googleURL(detail.googleMapsLinks?.reviewsUri) || googleURL(detail.googleMapsUri),
    rating: ratingValue(detail.rating),
    count: Number.isSafeInteger(detail.userRatingCount) && detail.userRatingCount >= 0 ? detail.userRatingCount : null,
    reviews: Array.isArray(detail.reviews) ? detail.reviews.slice(0, 5).map(reviewResult).filter(Boolean) : [],
    summary: summaryText && disclosure && reportURL && reviewsURL ? { text: summaryText, disclosure, reportURL, reviewsURL } : null,
    attributions: Array.isArray(detail.attributions) ? detail.attributions.filter(item => typeof item?.provider === 'string')
      .map(item => ({ name: item.provider, url: safeURL(item.providerUri) })) : [],
  };
}

export function googleFacilityReviews({ key, fetcher = fetch } = {}) {
  async function request(url, apiKey, fields, body) {
    const result = await fetcher(url, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fields, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return JSON.parse(await publicText(result, 250000));
  }

  return async facility => {
    const apiKey = typeof key === 'function' ? key() : key;
    if (!apiKey) return { status: 'unconfigured' };
    if (!facility.name || !facility.state || !(facility.city || facility.zip)) return { status: 'unmatched' };
    const query = [facility.name, facility.address, facility.city, facility.state, facility.zip, 'USA'].filter(Boolean).join(', ');
    try {
      const found = await request(places + ':searchText', apiKey, searchFields,
        { textQuery: query, regionCode: 'US', languageCode: 'en', pageSize: 6 });
      const match = choosePlace(facility, Array.isArray(found.places) ? found.places : []);
      if (!match) return { status: 'unmatched' };
      const detail = await request(places + '/' + match.id + '?languageCode=en&regionCode=US', apiKey, detailsFields);
      if (detail.id !== match.id) return { status: 'unmatched' };
      return projectDetails(detail);
    } catch {
      return { status: 'unavailable' };
    }
  };
}
