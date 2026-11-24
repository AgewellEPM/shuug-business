import { nursingHomesSource } from './business-category-sources.mjs';
import { FACILITY_TYPES, HttpError, STATES, metadata, state, text } from './model.mjs';
import { localityAllowed, localityKey, stateAllowed } from './territory-access.mjs';
import { countyOwnership } from './territory-map.mjs';

const maxMatches = 12;
const historicalFacilityName = /\b(?:nursing homes?|skilled nursing|assisted living|independent living|long term care|senior(?: (?:citizens?|community|activity|wellness))? cent(?:er|re)s?)\b/;
const addressWords = { avenue: 'ave', boulevard: 'blvd', court: 'ct', drive: 'dr', highway: 'hwy', lane: 'ln', road: 'rd', saint: 'st', street: 'st' };
const searchKey = value => localityKey(value).replace(/\b(avenue|boulevard|court|drive|highway|lane|road|saint|street)\b/g, word => addressWords[word]);

function isFacility(row, info) {
  if (FACILITY_TYPES.has(info.facilityType) || info.facilitySource) return true;
  if (info.source === nursingHomesSource.url || info.source?.startsWith?.(nursingHomesSource.url + '?')) return true;
  return info.facilityType == null && historicalFacilityName.test(localityKey(row.town));
}

export async function facilityOwnership(user, input, db) {
  if (!['owner', 'agent'].includes(user.role)) throw new HttpError(403, 'Use a sales workspace account to check facility assignments.');
  const region = input.state == null || input.state === '' ? null : state(input.state);
  if (region && !stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
  const query = searchKey(text(input.query ?? '', 180));
  if (query.length < 2) return { matches: [], hasMore: false };
  const terms = query.split(' ');
  const numeric = terms.filter(term => /^\d+$/.test(term));
  const names = terms.filter(term => !numeric.includes(term));
  const offices = await db.list('offices');
  const candidates = [];
  for (const row of offices) {
    if ((region ? row.state !== region : !STATES.includes(row.state)) || !localityAllowed(user, row.state, row.locality)) continue;
    const info = metadata(row) || {};
    const name = typeof row.town === 'string' ? row.town.trim() : '';
    if (!name || !isFacility(row, info)) continue;
    const city = typeof row.locality === 'string' ? row.locality : '';
    const address = typeof info.address === 'string' ? info.address : '';
    const searchable = searchKey([name, address, city, row.state, info.postalCode].join(' '));
    if (!names.every(term => searchable.includes(term))) continue;
    if (numeric.length && !numeric.every(term => searchable.split(' ').includes(term))) continue;
    const nameKey = searchKey(name), addressKey = searchKey(address);
    const rank = nameKey === query || addressKey === query ? 0 : nameKey.startsWith(query) ? 1 : 2;
    candidates.push({ name, city, address, state: row.state, assignedTo: String(row.assigned_to ?? '').trim(), rank });
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || a.state.localeCompare(b.state) ||
    a.city.localeCompare(b.city) || a.address.localeCompare(b.address, undefined, { numeric: true }));
  const page = candidates.slice(0, maxMatches);
  const repIds = new Set(page.map(row => row.assignedTo).filter(id => id && id !== 'owner'));
  const reps = new Map();
  if (repIds.size) {
    for (const row of await db.list('agents')) {
      if (repIds.has(String(row.id)) && ['active', 'revoked'].includes(row.status) && typeof row.contact_name === 'string') {
        reps.set(String(row.id), row.contact_name.trim());
      }
    }
  }
  const matches = page.map(({ name, city, address, state, assignedTo }) => ({
    name, city, address, state,
    assignee: assignedTo === 'owner' ? 'Workspace owner' : assignedTo ? reps.get(assignedTo) || 'Unknown rep' : '',
    status: assignedTo ? 'assigned' : 'unassigned',
  }));
  return { matches, hasMore: candidates.length > matches.length };
}

export async function territoryOwnership(user, input, db, readTeam) {
  if (input.countyIds !== undefined && !Array.isArray(input.countyIds)) throw new HttpError(400, 'Choose up to 16 counties.');
  const result = await facilityOwnership(user, input, db);
  const { counties } = input.countyIds?.length ? await countyOwnership(user, input, db, readTeam) : { counties: [] };
  return { ...result, counties };
}
