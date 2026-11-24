import { nursingHomesSource, publicWebsite, statewideNursingHomes } from './business-category-sources.mjs';
import { HttpError, state as stateCode } from './model.mjs';
import { publicText } from './public-data.mjs';

const OSM = 'https://qlever.dev/api/osm-planet';
const mapSource = Object.freeze({ name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' });
const clean = (row, key, limit) => typeof row?.[key]?.value === 'string' ? row[key].value.trim().slice(0, limit) : '';
const seniorName = '(^|[^a-z])(senior( citizens?| and community| community| activity| wellness)? cent(er|re)s?|cent(er|re) for (senior activities|seniors)|elderly (community |activity )?cent(er|re)|older adult cent(er|re)|active adult cent(er|re))($|[^a-z])';

function seniorQuery(state) {
  return `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX osmgeo: <http://www.opengis.net/rdf#>
SELECT ?place ?name ?city ?houseNumber ?street ?fullAddress ?postalCode ?phone ?email ?website ?hours ?facility WHERE {
  ?state osmkey:ISO3166-2 "US-${state}" ; osmgeo:sfContains ?place .
  { ?place osmkey:community_centre:for "senior" ; osmkey:name ?name . }
  UNION
  { VALUES ?amenity { "community_centre" "social_facility" }
    ?place osmkey:amenity ?amenity ; osmkey:name ?name .
    FILTER(REGEX(STR(?name), "${seniorName}", "i")) }
  OPTIONAL { ?place osmkey:addr:city ?city }
  OPTIONAL { ?place osmkey:addr:housenumber ?houseNumber }
  OPTIONAL { ?place osmkey:addr:street ?street }
  OPTIONAL { ?place osmkey:addr:full ?fullAddress }
  OPTIONAL { ?place osmkey:addr:postcode ?postalCode }
  OPTIONAL { ?place osmkey:phone|osmkey:contact:phone ?phone }
  OPTIONAL { ?place osmkey:email|osmkey:contact:email ?email }
  OPTIONAL { ?place osmkey:website|osmkey:contact:website ?website }
  OPTIONAL { ?place osmkey:opening_hours ?hours }
  OPTIONAL { ?place osmkey:social_facility ?facility }
}`;
}

function seniorCenter(row, state) {
  const sourceURL = clean(row, 'place', 100), name = clean(row, 'name', 180);
  if (!/^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(sourceURL) || !name ||
      ['nursing_home', 'assisted_living', 'group_home', 'retirement_home'].includes(clean(row, 'facility', 80))) return null;
  const city = clean(row, 'city', 100), houseNumber = clean(row, 'houseNumber', 24), street = clean(row, 'street', 240);
  const address = clean(row, 'fullAddress', 300) || (houseNumber && street ? `${houseNumber} ${street}` : '');
  const postalCode = clean(row, 'postalCode', 20);
  return { name, city, state, address, zip: /^\d{5}(?:-\d{4})?$/.test(postalCode) ? postalCode : '',
    phone: clean(row, 'phone', 60), email: clean(row, 'email', 240), website: publicWebsite(clean(row, 'website', 1200)),
    hours: clean(row, 'hours', 240), sourceURL, sourceName: mapSource.name };
}

async function mapBindings(query, fetcher, timeout) {
  const url = new URL(OSM);
  url.searchParams.set('query', query);
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(timeout),
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'UniversalSDR/1.0 (state facility directory)' } });
  const { results } = JSON.parse(await publicText(response, 4_000_000));
  if (!Array.isArray(results?.bindings)) throw new HttpError(502, 'The OpenStreetMap senior center data could not be read.');
  return results.bindings;
}

async function municipalityNames(places, fetcher) {
  if (!places.length) return new Map();
  // The input URLs have already been restricted to exact OpenStreetMap object IDs.
  // A targeted lookup is faster than joining every statewide record to municipal boundaries.
  const query = `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX osmgeo: <http://www.opengis.net/rdf#>
SELECT DISTINCT ?place ?city WHERE {
  VALUES ?place { ${places.map(place => `<${place}>`).join(' ')} }
  ?municipality osmgeo:sfContains ?place ; osmkey:boundary "administrative" ; osmkey:admin_level 8 ; osmkey:name ?city .
}`;
  let rows;
  try { rows = await mapBindings(query, fetcher, 3000); }
  catch { return new Map(); }
  const names = new Map();
  for (const row of rows) {
    const place = clean(row, 'place', 100), city = clean(row, 'city', 100);
    if (!places.includes(place) || !city) continue;
    if (!names.has(place)) names.set(place, new Set());
    names.get(place).add(city);
  }
  return new Map([...names].flatMap(([place, cities]) => cities.size === 1 ? [[place, cities.values().next().value]] : []));
}

async function seniorCenters(state, fetcher) {
  const bindings = await mapBindings(seniorQuery(state), fetcher, 14000);
  const unique = new Map();
  for (const row of bindings) {
    const result = seniorCenter(row, state);
    if (result && !unique.has(result.sourceURL)) unique.set(result.sourceURL, result);
  }
  const results = [...unique.values()];
  const missingCities = results.filter(row => !row.city).map(row => row.sourceURL).sort().slice(0, 100);
  const municipalities = await municipalityNames(missingCities, fetcher);
  return results.map(row => municipalities.has(row.sourceURL) ? { ...row, city: municipalities.get(row.sourceURL) } : row);
}

export async function loadStateFacilities({ state, category }, fetcher = fetch) {
  const region = stateCode(state);
  if (category === 'nursing-home') return { results: await statewideNursingHomes(region, fetcher),
    coverage: 'Nursing homes certified by Medicare or Medicaid and published in CMS Care Compare.', sources: [nursingHomesSource] };
  if (category === 'senior-center') return { results: await seniorCenters(region, fetcher),
    coverage: 'Senior community centers mapped in OpenStreetMap. Coverage varies by area.', sources: [mapSource] };
  throw new HttpError(400, 'Choose nursing homes or senior community centers.');
}
