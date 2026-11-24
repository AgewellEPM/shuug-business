import { metadata } from './model.mjs';
import { localityAllowed, localityKey } from './territory-access.mjs';

const markets = [
  ['hospitals', 'Hospitals', /\b(?:hospitals?|medical centers? inpatient)\b/],
  ['senior-care', 'Senior care', /\b(?:nursing homes?|skilled nursing|nursing and rehabilitation|assisted living|independent living|long term care|memory care|senior living|senior care)\b/],
  ['community-centers', 'Community centers', /\b(?:community cent(?:er|re)s?|senior(?: (?:citizens?|activity|wellness))? cent(?:er|re)s?)\b/],
  ['healthcare', 'Healthcare', /\b(?:health care|healthcare|clinics?|medical cent(?:er|re)s?|urgent care|medical practices?)\b/],
];
const classifiedTypes = new Map([
  ['hospital', 'hospitals'], ['hospital system', 'hospitals'],
  ['nursing home', 'senior-care'], ['assisted living', 'senior-care'], ['independent living', 'senior-care'],
  ['long term care', 'senior-care'], ['memory care', 'senior-care'], ['senior care', 'senior-care'],
  ['senior center', 'community-centers'], ['community center', 'community-centers'],
  ['healthcare', 'healthcare'], ['clinic', 'healthcare'],
]);
const labels = new Map(markets.map(([id, label]) => [id, label]));

export function officeMarket(row, info) {
  if (!info) {
    try { info = metadata(row) || {}; }
    catch { return null; }
  }
  const type = localityKey(info.facilityType || info.businessType || row.category);
  const known = classifiedTypes.get(type);
  const id = known || markets.find(([, , pattern]) => pattern.test(localityKey(row.town)))?.[0];
  return id ? { id, label: labels.get(id) } : null;
}

function increment(buckets, key, segment, detail = {}) {
  const prior = buckets.get(key);
  if (prior) prior.count++;
  else buckets.set(key, { ...segment, ...detail, count: 1 });
}

function ordered(buckets) {
  return [...buckets.values()].sort((a,b) => a.label.localeCompare(b.label) || (a.rep || '').localeCompare(b.rep || ''));
}

export function teamMarketSegments(user, members, offices) {
  const buckets = new Map(members.map(member => [member.id, new Map()]));
  for (const row of offices) {
    const segments = buckets.get(String(row.assigned_to ?? ''));
    if (!segments || !localityAllowed(user, row.state, row.locality)) continue;
    const market = officeMarket(row);
    if (market) increment(segments, market.id, market);
  }
  return members.map(member => ({ ...member, marketSegments: ordered(buckets.get(member.id)) }));
}

export function countyMarketCoverage(user, map, counties, offices, agents) {
  const selected = new Set(counties.map(county => county.id));
  const localityCounties = new Map();
  for (const feature of map.features) {
    const key = localityKey(feature.name);
    const ids = localityCounties.get(key) || new Set();
    for (const id of feature.counties || []) ids.add(id);
    localityCounties.set(key, ids);
  }
  const reps = new Map(agents.map(agent => [String(agent.id), agent.contact_name]));
  reps.set('owner', 'Workspace owner');
  const coverage = new Map(counties.map(county => [county.id, new Map()]));
  for (const row of offices) {
    if (row.state !== map.state || !row.assigned_to || !localityAllowed(user, row.state, row.locality)) continue;
    // Use the recorded town only when it resolves to a single county.
    const ids = localityCounties.get(localityKey(row.locality));
    if (ids?.size !== 1) continue;
    const [county] = ids;
    if (!selected.has(county)) continue;
    const market = officeMarket(row);
    if (!market) continue;
    const repId = String(row.assigned_to);
    increment(coverage.get(county), market.id + ':' + repId, market, {rep: reps.get(repId) || 'Unknown rep'});
  }
  return new Map([...coverage].map(([county, buckets]) => [county, ordered(buckets)]));
}
