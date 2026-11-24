import { HttpError, STATES, digest, email, metadata, secret, text } from './model.mjs';
import { agentTerritory } from './territories.mjs';
import { salesRepProfileUpdate } from './sales-rep-profile.mjs';

const OWNER = 'owner';
const actions = new Set(['sales-team-read', 'sales-team-invite', 'sales-team-revoke', 'sales-team-profile', 'set-sales-team-profile']);
const idOf = row => String(row.id);
const parentOf = row => metadata(row).parentId || OWNER;
const isAgent = row => row.status === 'active' || (row.status === 'revoked' && Boolean(metadata(row).codeHash));

function lineage(row, roster) {
  const chain = [], visited = new Set();
  while (row && !visited.has(idOf(row))) {
    chain.push(row);
    visited.add(idOf(row));
    const parent = parentOf(row);
    if (parent === OWNER) return chain;
    row = roster.get(parent);
  }
  return null;
}

function scopeOf(row) {
  const { states = [], territory } = metadata(row);
  if (territory?.version === 1) return new Map(territory.areas.map(area => [area.state, area.cities]));
  return states.length ? new Map(states.map(state => [state, null])) : null;
}

function intersect(scope, limit) {
  if (!scope) return limit;
  if (!limit) return scope;
  const allowed = new Map();
  for (const [state, cities] of scope) {
    if (!limit.has(state)) continue;
    const towns = limit.get(state);
    const shared = cities === null ? towns : towns === null ? cities : cities.filter(city => towns.includes(city));
    if (shared === null || shared.length) allowed.set(state, shared);
  }
  return allowed;
}

function territoryFields(scope, structured) {
  if (!scope) return { states: [], territory: null };
  const areas = [...scope].map(([state, cities]) => ({ state, cities }));
  const states = areas.map(area => area.state);
  const territory = structured || !areas.length || areas.some(area => area.cities !== null) ? { version: 1, areas } : null;
  return { states, territory };
}

function account(row, roster) {
  const chain = lineage(row, roster);
  const active = Boolean(chain?.every(member => member.status === 'active'));
  const scope = chain ? chain.reduce((allowed, member) => intersect(allowed, scopeOf(member)), null) : new Map();
  const structured = chain?.some(member => metadata(member).territory?.version === 1);
  return { active, scope, structured, chain };
}

function pairedRows(rows) {
  return new Map(rows.filter(isAgent).map(row => [idOf(row), row]));
}

function publicMember(row, member, rootId) {
  const id = idOf(row), parentId = parentOf(row);
  return { id, name: row.contact_name, email: row.contact_email, parentId: id === rootId ? null : parentId, active: member.active,
    canRevoke: member.active && id !== rootId && (rootId === OWNER || parentId === rootId),
    ...territoryFields(member.scope, member.structured) };
}

export function salesTeamTools(db, audit, owner) {
  const list = () => pairedRows(db.list('agents'));
  function rosterUser(row, roster = list()) {
    const current = row && roster.get(idOf(row));
    if (!current) return null;
    const member = account(current, roster);
    if (!member.active) return null;
    const { territoryRevision } = agentTerritory(current);
    return { id: idOf(current), name: current.contact_name, email: current.contact_email, role: 'agent', territoryRevision,
      ...territoryFields(member.scope, member.structured) };
  }

  function roster(user, rows) {
    if (user.role !== 'owner') return [];
    const records = pairedRows(rows);
    return [...records.values()].map(row => rosterUser(row, records)).filter(Boolean)
      .map(({ id, name, states, territory, territoryRevision }) => ({ id, name, states, territory, territoryRevision }));
  }

  function read(user) {
    const records = list(), rootId = user.id;
    if (rootId !== OWNER && !account(records.get(rootId), records).active) throw new HttpError(401, 'Your sales access was revoked.');
    const members = [];
    if (rootId === OWNER) members.push({ id: OWNER, name: owner.name, email: '', parentId: null, active: true,
      canRevoke: false, states: [], territory: null });
    for (const row of records.values()) {
      const member = account(row, records);
      if (rootId === OWNER || member.chain?.some(ancestor => idOf(ancestor) === rootId)) members.push(publicMember(row, member, rootId));
    }
    return { rootId, members };
  }

  function invite(user, body, records) {
    const name = text(body.name, 140, true), address = email(body.email), requested = body.states ?? [];
    if (!Array.isArray(requested) || requested.length > STATES.length || requested.some(state => !STATES.includes(state))) {
      throw new HttpError(400, 'Choose valid territories.');
    }
    const rootId = body.parentId === undefined ? user.id : String(body.parentId);
    if (user.role !== 'owner' && rootId !== user.id) throw new HttpError(403, 'Invite members directly under your own account.');
    const parent = rootId === OWNER ? { active: true, scope: null } : account(records.get(rootId), records);
    if (!parent.active) throw new HttpError(404, 'Choose an active team member.');
    if ([...records.values()].some(row => String(row.contact_email).toLowerCase() === address && account(row, records).active)) {
      throw new HttpError(409, 'An active agent already uses that email.');
    }
    const chosen = new Set(requested);
    if (parent.scope && [...chosen].some(state => !parent.scope.has(state))) throw new HttpError(403, 'Choose states within the team lead’s territory.');
    const scope = chosen.size ? intersect(new Map([...chosen].map(state => [state, null])), parent.scope) : parent.scope;
    const code = secret(), fields = territoryFields(scope, parent.structured);
    const row = db.create('agents', { town: `Sales agent ${secret().slice(0, 12)}`, contact_name: name, contact_email: address,
      status: 'active', notes: JSON.stringify({ codeHash: digest(code), parentId: rootId, ...fields }) });
    audit(user, `agent:${row.id}`, 'sales_team_member_invited', { agentId: idOf(row), parentId: rootId });
    return { agent: { ...publicMember(row, { active: true, scope, structured: parent.structured }, user.id), role: 'agent' }, code };
  }

  function revoke(user, body, records) {
    const row = records.get(String(body.id));
    if (user.role !== 'owner' && (!row || parentOf(row) !== user.id)) throw new HttpError(403, 'Manage access for your direct reports.');
    if (!row) throw new HttpError(404, 'Agent not found.');
    if (row.status !== 'revoked') {
      db.patch('agents', row.id, { status: 'revoked' });
      audit(user, `agent:${row.id}`, 'sales_team_access_revoked', { agentId: idOf(row) });
    }
    return { revoked: true };
  }

  function dispatch(user, action, body) {
    if (action === 'sales-team-read') return read(user);
    function work() {
      const records = list();
      if (user.role !== 'owner' && !account(records.get(user.id), records).active) throw new HttpError(401, 'Your sales access was revoked.');
      if (action === 'sales-team-profile') return { profile: db.salesRepProfile(user.id) };
      if (action === 'set-sales-team-profile') {
        const changes = salesRepProfileUpdate(body);
        return { profile: db.setSalesRepProfile(user.id, body.revision, changes) };
      }
      return action === 'sales-team-invite' ? invite(user, body, records) : revoke(user, body, records);
    }
    return action === 'sales-team-profile' ? work() : db.writeAgentTeam(work);
  }

  return { actions, dispatch, roster, rosterUser };
}
