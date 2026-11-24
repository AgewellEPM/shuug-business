import { HttpError, STATES, metadata, state, visible } from './model.mjs';
import { localityAllowed, localityKey, stateAllowed } from './territory-access.mjs';
import { territoryGeometry } from './territory-map.mjs';

// Share only immutable geographic indexes. Rep scope and operational records
// are evaluated on every request, including after a lead or territory changes.
const indexes = new Map();
async function geographicIndex(region) {
  if (!indexes.has(region)) indexes.set(region, territoryGeometry(region).then(map => {
    const towns = new Map();
    for (const feature of map.features) {
      const key = localityKey(feature.name);
      if (!towns.has(key)) towns.set(key, new Set());
      for (const id of feature.counties) towns.get(key).add(id);
    }
    return { id: region, name: map.name, towns, counties: map.counties.map(({ id, name, label }) => ({ id, name, label })) };
  }).catch(error => { indexes.delete(region); throw error; }));
  return indexes.get(region);
}
function bucket(item) {
  return { ...item, towns: 0, covered: 0, working: 0, available: 0, offices: 0, openOffices: 0, prospects: 0,
    signed: 0, followups: 0, added: 0, previous: 0, leads: new Map() };
}
function period(now) {
  const d = new Date(now), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const start = Date.UTC(y, m, 1), previous = Date.UTC(y, m - 1, 1);
  return { start, previous, previousEnd: Math.min(start, previous + (now - start) + 1), now };
}
function officeFact(office, signed, dates) {
  const created = Date.parse(office.created_at);
  const open = !['not_interested', 'do_not_contact'].includes(office.status) && !metadata(office).primaryContactDoNotContact;
  return { offices: 1, openOffices: Number(open), prospects: Number(open && !signed && office.status !== 'active'), signed,
    followups: Number(open && Boolean(office.meeting_date)),
    added: Number(created >= dates.start && created <= dates.now),
    previous: Number(created >= dates.previous && created < dates.previousEnd) };
}
const officeFields = ['offices', 'openOffices', 'prospects', 'signed', 'followups', 'added', 'previous'];
function addOffice(out, fact) { for (const field of officeFields) out[field] += fact[field]; }
function addTown(out, status) { out.towns++; out[status]++; }
function addLead(out, lead) {
  if (lead?.name) out.leads.set(lead.memberId ? 'member:' + lead.memberId : 'name:' + lead.name.trim().toLowerCase(), lead.name);
}
function present(row) {
  const { leads, openOffices, previous, ...values } = row;
  const names = [...leads.values()].sort((a, b) => a.localeCompare(b));
  return { ...values, repCount: names.length, lead: names.length === 1 ? names[0] : '',
    coverage: row.towns ? Math.round(100 * row.covered / row.towns) : null, trend: row.added - previous };
}
function summarizeState(index, user, offices, signedByOffice, leads, dates) {
  const stateRow = bucket({ id: index.id, name: index.name });
  const counties = new Map(index.counties.map(county => [county.id, bucket(county)]));
  const working = new Set();
  for (const office of offices) {
    const key = localityKey(office.locality), countyIds = index.towns.get(key);
    const fact = officeFact(office, signedByOffice.get(String(office.id)) || 0, dates);
    addOffice(stateRow, fact);
    // A recorded town spanning multiple counties cannot locate an office in one.
    if (countyIds?.size === 1) {
      const county = counties.get(countyIds.values().next().value);
      if (county) addOffice(county, fact);
    }
    if (fact.openOffices) working.add(key);
  }
  for (const [town, countyIds] of index.towns) {
    if (!localityAllowed(user, index.id, town)) continue;
    let covered = false;
    for (const id of countyIds) {
      const county = counties.get(id);
      if (!county) continue;
      const assigned = Boolean(leads.get(id)?.name);
      covered ||= assigned;
      addTown(county, assigned ? 'covered' : working.has(town) ? 'working' : 'available');
    }
    addTown(stateRow, covered ? 'covered' : working.has(town) ? 'working' : 'available');
  }
  const townRestricted = user.role !== 'owner' && user.territory?.version === 1 &&
    Array.isArray(user.territory.areas.find(area => area.state === index.id)?.cities);
  const regions = [...counties.values()].filter(county => !townRestricted || county.towns > 0);
  for (const county of regions) {
    addLead(county, leads.get(county.id));
    addLead(stateRow, leads.get(county.id));
  }
  return { stateRow, regions };
}
export async function territoryDashboard(user, input, db, now = Date.now()) {
  const region = input.state ? state(input.state) : '';
  if (region && !stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
  const states = region ? [region] : STATES.filter(code => stateAllowed(user, code));
  const geography = [];
  // Bound decompression memory on the first nationwide request.
  for (const code of states) geography.push(await geographicIndex(code));
  const [offices, contracts] = await Promise.all([db.list('offices'), db.list('enrollments')]);
  const byState = new Map(states.map(code => [code, []]));
  for (const office of offices) if (byState.has(office.state) && visible(user, office)) byState.get(office.state).push(office);
  const signed = new Map();
  for (const row of contracts) {
    const info = metadata(row), id = String(info.leadId);
    if (info.signature && info.acceptedAt) signed.set(id, (signed.get(id) || 0) + 1);
  }
  const leads = db.countyLeadAssignments(), dates = period(now), rows = [];
  let total = bucket({ id: '', name: 'All states' });
  for (const index of geography) {
    const { stateRow, regions } = summarizeState(index, user, byState.get(index.id), signed, leads, dates);
    if (region) { total = stateRow; rows.push(...regions); }
    else {
      rows.push(stateRow);
      for (const key of ['towns', 'covered', 'working', 'available', ...officeFields]) total[key] += stateRow[key];
      for (const [id, name] of stateRow.leads) total.leads.set(id, name);
    }
  }
  return { state: region, total: present(total), active: rows.filter(row => row.leads.size > 0 || row.openOffices > 0).length,
    rows: rows.map(present), unmappedOffices: region ? total.offices - rows.reduce((n, row) => n + row.offices, 0) : 0 };
}
