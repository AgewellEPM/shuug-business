import { HttpError, metadata } from '../../sales/model.mjs';

const day = 86_400_000;

export function monthlyPrizes(db, { now = Date.now, zone = 'America/New_York' } = {}) {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return async (user, { month }) => {
    if (!['owner', 'agent'].includes(user.role)) throw new HttpError(403, 'Open the sales workspace to view prizes.');
    if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Choose a valid prize month.');
    const today = now(), isOwner = user.role === 'owner', host = String(user.id);
    const cutoff = new Date(month + '-01T00:00:00Z'), start = +cutoff - day;
    cutoff.setUTCMonth(cutoff.getUTCMonth() + 1);
    const end = +cutoff + day;
    const [enrollments, agents] = await Promise.all([db.list('enrollments'), isOwner ? db.list('agents') : []]);
    const firstByLocation = new Map();
    for (const row of enrollments) {
      const { signature, acceptedAt, leadId, agentId } = metadata(row), at = Date.parse(acceptedAt);
      if (!signature || !leadId || !Number.isFinite(at) || at > today) continue;
      const location = String(leadId), prior = firstByLocation.get(location);
      if (!prior || at < prior.at) firstByLocation.set(location, { at, rep: String(agentId ?? '') });
    }
    const signed = [...firstByLocation.values()].filter(row => (isOwner || row.rep === host) && date.format(row.at).slice(0, 7) === month);
    const hosts = new Set(isOwner ? [host, ...agents.map(agent => String(agent.id))] : [host]);
    const demos = [...hosts].flatMap(id => db.booking.range(id, start, end))
      .filter(row => row.type === 'demo' && row.status === 'confirmed' && date.format(row.start).slice(0, 7) === month);
    return {
      month, currentMonth: date.format(today).slice(0, 7), scope: isOwner ? 'team' : 'rep',
      signedLocations: signed.length, signedBy10th: signed.filter(row => Number(date.format(row.at).slice(8, 10)) <= 10).length,
      confirmedDemos: new Set(demos.map(row => row.id)).size,
    };
  };
}
