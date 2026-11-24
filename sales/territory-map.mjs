import { readFile } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { HttpError, state, text } from './model.mjs';
import { validateHeadshot } from './sales-rep-profile.mjs';
import { countyMarketCoverage } from './sales-market-segments.mjs';
import { localityAllowed, localityKey, stateAllowed } from './territory-access.mjs';

const decompress = promisify(gunzip);

export async function territoryGeometry(region) {
  const file = new URL(`./territory-map-data/${region}.json.gz`, import.meta.url);
  return JSON.parse(await decompress(await readFile(file)));
}

// A county lead is an operational assignment. Account access comes from the
// existing reporting tree and the separate town/state permission records.
function assignmentScope(user, map, readTeam) {
  const owner = user.role === 'owner';
  const team = (readTeam?.().members || []).filter(member => member.active);
  const people = team.map(member => {
    const area = member.territory?.areas.find(a => a.state === map.state);
    let counties = null;
    if (!owner && area?.cities) {
      const names = new Set(area.cities);
      counties = [...new Set(map.features.filter(f => names.has(localityKey(f.name))).flatMap(f => f.counties))];
    } else if (!owner && !stateAllowed(member, map.state)) counties = [];
    return { id:member.id, name:member.name, counties };
  });
  const self = people.find(p => p.id === user.id);
  const manager = !!self && people.some(p => p.id !== user.id);
  const memberIds = new Set(people.map(p => p.id));
  const covers = (person, county) => !!person && (!person.counties || person.counties.includes(county));
  function canEdit(county, current) {
    return owner || (manager && covers(self, county) && (!current?.name || memberIds.has(current.memberId)));
  }
  return {people, owner, covers, canEdit};
}

function withProfilePhoto(db, lead) {
  if (!lead?.memberId) return lead;
  const profile = db?.salesRepProfile?.(lead.memberId);
  if (!profile?.revision) return lead;
  return { ...lead, photo: profile.photo, profileRevision: profile.revision };
}

async function describeCounties(user, db, map, counties, scope) {
  const [offices, agents] = db?.list ? await Promise.all([db.list('offices'), db.list('agents')]) : [[], []];
  const coverage = countyMarketCoverage(user, map, counties, offices, agents);
  return counties.map(county => {
    const lead = db?.countyLead(county.id) || null;
    return { id: county.id, lead: withProfilePhoto(db, lead),
      canEdit: scope.canEdit(county.id, lead), marketCoverage: coverage.get(county.id) };
  });
}

export async function territoryMap(user, input, db, readTeam) {
  const region = state(input.state);
  if (!stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
  const map = await territoryGeometry(region), scope = assignmentScope(user, map, readTeam);
  const descriptions = await describeCounties(user, db, map, map.counties, scope);
  map.counties.forEach((county, index) => Object.assign(county, descriptions[index]));
  map.features = map.features.filter(feature => localityAllowed(user, region, feature.name));
  map.landmarks = map.landmarks.filter(place => localityAllowed(user, region, place.name));
  map.leadMembers = scope.people.map(person => ({
    ...person, photo: db?.salesRepProfile?.(person.id)?.photo || '',
  }));
  map.customLeads = scope.owner;
  return map;
}

export async function countyOwnership(user, input, db, readTeam) {
  const region = state(input.state);
  if (!stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
  const ids = input.countyIds ?? [];
  if (!Array.isArray(ids) || ids.length > 16 || ids.some(id => typeof id !== 'string' || !/^\d{5}$/.test(id))) {
    throw new HttpError(400, 'Choose up to 16 counties.');
  }
  if (!ids.length) return { counties: [] };
  const map = await territoryGeometry(region), scope = assignmentScope(user, map, readTeam);
  const requested = new Set(ids);
  const counties = map.counties.filter(county => requested.has(county.id));
  return { counties: await describeCounties(user, db, map, counties, scope) };
}

export async function setCountyLead(user, input, db, readTeam) {
  const region = state(input.state);
  if (!stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new HttpError(400, 'Reopen the county assignment.');
  const map = await territoryGeometry(region);
  if (!map.counties.some(county => county.id === input.county)) throw new HttpError(400, 'Choose a county in this state.');
  return db.writeAgentTeam(() => {
    const scope = assignmentScope(user, map, readTeam);
    if (!scope.canEdit(input.county, db.countyLead(input.county))) throw new HttpError(403, 'Choose an available county within your team’s territory.');
    const clearing = input.clear === true;
    const person = scope.people.find(p => p.id === input.memberId);
    if (!clearing && (!scope.owner || input.memberId) && !scope.covers(person, input.county)) {
      throw new HttpError(403, 'Choose an active person on your team for this county.');
    }
    const name = person ? person.name : text(input.name, 100, !clearing);
    const photo = person || clearing ? '' : validateHeadshot(input.photo);
    const changes = clearing ? {name:'', photo:''} : {name, photo, ...(person ? {memberId:person.id} : {})};
    const lead = db.saveCountyLead(input.county, input.revision, changes);
    return {county: input.county, lead: withProfilePhoto(db, lead)};
  });
}
