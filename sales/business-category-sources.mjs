import { HttpError, https } from './model.mjs';
import { publicText } from './public-data.mjs';
import { REGISTRIES } from './registry-catalog.mjs';
import { localityKey } from './territory-access.mjs';

const CMS = 'https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0';
const PHOTON = 'https://photon.komoot.io/api/';
const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const zipCode = value => /^\d{5}(?:-\d{4})?$/.test(value) ? value : '';

export function businessCategory(value) {
  const type = normalize(value);
  if (/^(nursing homes?|skilled nursing( facilities| facility)?|snfs?)$/.test(type)) return 'nursing home';
  if (/^(senior (community )?cent(er|re)s?|cent(er|re)s? for seniors)$/.test(type)) return 'senior center';
  return type.replace(/\b(\w+)ies\b/g, '$1y').replace(/\b(shops|restaurants|dentists|florists|plumbers|pharmacies|hospitals)\b/g, word => word.slice(0, -1));
}

function cmsFilter(url, conditions) {
  conditions.forEach(([field, value], index) => {
    url.searchParams.set('conditions[' + index + '][property]', field);
    url.searchParams.set('conditions[' + index + '][value]', value);
  });
}

async function sourceJSON(url, fetcher, timeout = 12000) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(timeout),
    headers: { Accept: 'application/json', 'User-Agent': 'UniversalSDR/1.0 (local business research)' } });
  return JSON.parse(await publicText(response, 2_000_000));
}

export async function nursingHomes({ state, locality, zip }, fetcher = fetch) {
  const url = new URL(CMS);
  cmsFilter(url, [['state', state], zip ? ['zip_code', zip] : ['citytown', locality]]);
  url.searchParams.set('limit', '30');
  const data = await sourceJSON(url, fetcher);
  if (!Array.isArray(data.results)) throw new HttpError(502, 'CMS nursing home data could not be read.');
  return data.results.flatMap(row => {
    const id = clean(row.cms_certification_number_ccn, 6);
    const name = clean(row.provider_name, 180), city = clean(row.citytown, 100);
    if (!/^[0-9A-Z]{6}$/.test(id) || !name || !city || row.state !== state ||
      (zip ? row.zip_code !== zip : normalize(city) !== normalize(locality))) return [];
    const record = new URL('https://data.cms.gov/provider-data/dataset/4pq5-n9py');
    cmsFilter(record, [['cms_certification_number_ccn', id]]);
    return [{ name, city, state, address: clean(row.provider_address, 300), zip: zipCode(row.zip_code),
      phone: clean(row.telephone_number, 60), sourceURL: record.href, sourceName: 'CMS Care Compare' }];
  });
}

export function publicWebsite(value) {
  try { return https(value); } catch { return ''; }
}

const osmKinds = { N: 'node', W: 'way', R: 'relation' };

function matchesCategory(category, name, properties) {
  const label = normalize(name), kind = normalize(properties.osm_value || '');
  if (category === 'senior center') return /\bsenior(?:s| (?:citizens?|activity|community))? cent(?:er|re)s?\b/.test(label);
  if (category === 'nursing home') return kind === category || /\b(nursing home|skilled nursing)\b/.test(label);
  return ['shop', 'office', 'amenity', 'craft', 'healthcare', 'leisure', 'tourism', 'social_facility', 'industrial'].includes(properties.osm_key) &&
    (' ' + kind + ' ' + label + ' ').includes(' ' + category + ' ');
}

export async function mappedBusinesses({ category, state, locality, zip }, fetcher = fetch) {
  const region = REGISTRIES[state].name;
  const url = new URL(PHOTON);
  url.search = new URLSearchParams({ q: [category, locality, region].join(' '),
    countrycode: 'US', layer: 'house', lang: 'en', limit: '30' });
  const data = await sourceJSON(url, fetcher, 9000);
  if (!Array.isArray(data.features)) throw new HttpError(502, 'OpenStreetMap category search could not be read.');
  return data.features.flatMap(({ properties = {} }) => {
    const name = clean(properties.name, 180), kind = osmKinds[properties.osm_type];
    const places = [properties.city, properties.locality, properties.district].filter(place => typeof place === 'string' && place.trim());
    const city = clean(zip ? places[0] : places.find(place => localityKey(place) === localityKey(locality)), 100);
    const postcode = zipCode(properties.postcode);
    if (!name || !city || !kind || !Number.isSafeInteger(properties.osm_id) ||
        properties.countrycode !== 'US' || normalize(properties.state || '') !== normalize(region) ||
        (zip && postcode.slice(0, 5) !== zip) || !matchesCategory(category, name, properties)) return [];
    const address = properties.housenumber && properties.street ? clean(properties.housenumber + ' ' + properties.street, 300) : '';
    const tags = properties.extra || {};
    return [{ name, city, state, address, zip: postcode, sourceURL: 'https://www.openstreetmap.org/' + kind + '/' + properties.osm_id,
      sourceName: 'OpenStreetMap', phone: clean(tags['contact:phone'] || tags.phone, 60),
      email: clean(tags['contact:email'] || tags.email, 240), website: publicWebsite(tags['contact:website'] || tags.website) }];
  });
}
