import { HttpError } from './model.mjs';
import { publicText } from './public-data.mjs';

const cache = new Map();
export const validLocation = (region, lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && (region === 'HI' ? lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154 : region === 'AK' ? lat >= 51 && lat <= 72 && (lng >= -180 && lng <= -129 || lng >= 170 && lng <= 180) : lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66);
export function csvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else if (c !== '\r' || quoted) cell += c;
  }
  if (quoted) throw new HttpError(502, 'The address service returned incomplete CSV.');
  if (cell || row.length) { row.push(cell); rows.push(row); } return rows;
}
const keyOf = candidate => [candidate.address, candidate.city, candidate.state, candidate.zip].map(value => String(value || '').trim().toUpperCase()).join('|');
export async function geocodeCandidates(candidates, fetcher = fetch) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 25) throw new HttpError(400, 'Map between one and 25 public business addresses at a time.');
  const unique = new Map();
  for (const candidate of candidates) if (!candidate.location && !(cache.get(keyOf(candidate))?.expires > Date.now())) unique.set(keyOf(candidate), candidate);
  const input = [...unique.values()];
  if (input.length) {
    const quote = value => `"${String(value || '').replaceAll('"', '""')}"`;
    const csv = input.map((candidate, index) => [String(index), candidate.address, candidate.city, candidate.state, candidate.zip].map(quote).join(',')).join('\n') + '\n';
    const body = new FormData(); body.set('addressFile', new Blob([csv], { type: 'text/csv' }), 'gigtax-public-business-addresses.csv'); body.set('benchmark', 'Public_AR_Current');
    const response = await fetcher('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(35000), headers: { 'User-Agent': 'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)' } });
    const rows = csvRows(await publicText(response));
    for (const row of rows) {
      if (!/^\d+$/.test(row[0] || '') || !input[Number(row[0])]) continue;
      const candidate = input[Number(row[0])], coordinates = String(row[5] || '').split(',').map(Number);
      const matchesState = new RegExp(`,\\s*${candidate.state},\\s*\\d{5}`).test(row[4] || '');
      const location = row[2] === 'Match' && row[3] === 'Exact' && matchesState && coordinates.length === 2 && validLocation(candidate.state, coordinates[1], coordinates[0]) ? {
        lng: coordinates[0], lat: coordinates[1], matchedAddress: row[4], source: 'US Census Geocoder', precision: 'Address-range estimate', sourceURL: 'https://geocoding.geo.census.gov/' } : null;
      if (cache.size >= 3000) cache.delete(cache.keys().next().value);
      cache.set(keyOf(candidate), { location, expires: Date.now() + (location ? 86400000 : 1800000) });
    }
  }
  return candidates.map(candidate => ({ candidateId: candidate.candidateId, location: candidate.location || cache.get(keyOf(candidate))?.location || null, status: candidate.location || cache.get(keyOf(candidate))?.location ? 'mapped' : 'unmatched' }));
}
