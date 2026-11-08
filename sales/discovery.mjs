import { inflateRawSync } from 'node:zlib';
import { HttpError, STATES, digest, officeIdentity } from './model.mjs';

export const IRS_DIRECTORY = 'https://www.irs.gov/e-file-providers/download-delimited-files-by-state-or-district-of-columbia';
const cache = new Map();
// Read the fixed IRS state ZIP in memory. Never extract paths to disk, accept
// arbitrary URLs, execute content, or allow an unbounded compressed payload.
export function unzipState(bytes, region) {
  if (bytes.length > 8000000) throw new HttpError(502, 'The office directory file is too large.');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new HttpError(502, 'The IRS directory download was not a supported ZIP file.');
  const count = bytes.readUInt16LE(end + 10); let at = bytes.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(at + 10), packed = bytes.readUInt32LE(at + 20), size = bytes.readUInt32LE(at + 24), nameSize = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), offset = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameSize).toString(); at += 46 + nameSize + extra + comment;
    if (name.toLowerCase() !== `${region.toLowerCase()}.txt`) continue;
    if (size > 20000000 || offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) throw new HttpError(502, 'The office directory archive could not be read safely.');
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    if (start + packed > bytes.length || ![0,8].includes(method)) throw new HttpError(502, 'The office directory archive is incomplete.');
    const body = method === 8 ? inflateRawSync(bytes.subarray(start,start + packed),{ maxOutputLength:20000000 }) : bytes.subarray(start,start + packed);
    if (body.length !== size) throw new HttpError(502, 'The office directory file is incomplete.');
    return new TextDecoder('windows-1252').decode(body);
  }
  throw new HttpError(502, 'The IRS archive did not contain the expected state file.');
}
export function parseDirectory(raw, region) {
  const clean = value => !value || /^(none|null)$/i.test(value.trim()) ? '' : value.trim();
  return raw.split(/\r?\n/).filter(Boolean).map(line => line.split('|').map(clean)).filter(c => c.length >= 11 && c[4] === region && c[0]).map(c => ({ name:c[0], address:[c[1],c[2]].filter(Boolean).join(', '), city:c[3], state:c[4], zip:c[5], contact:[c[7],c[8],c[9]].filter(Boolean).join(' '), phone:c[10], ero:c[11] === 'X' }));
}
export async function discoverOffices(region, locality, fetcher = fetch, { offset = 0, limit = 50 } = {}) {
  if (!STATES.includes(region)) throw new HttpError(400, 'Choose a state.');
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(400, 'Choose a valid search page.');
  const url = `https://www.irs.gov/pub/irs-efile/${region.toLowerCase()}.zip`;
  let data = cache.get(region);
  if (!data || data.expires < Date.now()) {
    const r = await fetcher(url,{ signal:AbortSignal.timeout(20000), redirect:'error' });
    if (!r.ok) throw new HttpError(502,'The IRS state directory is unavailable. Use the IRS directory link or retry later.');
    const chunks = []; let total = 0;
    for await (const chunk of r.body) { total += chunk.length; if (total > 8000000) throw new HttpError(502, 'The IRS download exceeded its size limit.'); chunks.push(Buffer.from(chunk)); }
    data = { rows:parseDirectory(unzipState(Buffer.concat(chunks),region),region), checkedAt:new Date().toISOString(), expires:Date.now() + 3600000 };
    cache.set(region,data);
  }
  const query = locality.toLowerCase().trim();
  const seen = new Set();
  const matches = data.rows.filter(o => {
    if (!o.ero || !(o.city.toLowerCase().includes(query) || o.zip.startsWith(query)) || /h\s*&\s*r\s*block|jackson\s*hewitt|liberty\s*tax/i.test(o.name)) return false;
    const identity = officeIdentity(o.name, o.address, o.city, o.state);
    if (seen.has(identity)) return false; seen.add(identity); return true;
  });
  const results = matches.slice(offset, offset + limit).map(o => ({ ...o, candidateId: digest(officeIdentity(o.name,o.address,o.city,o.state)).slice(0,24), independence:'unverified', contactRole:'unverified', title:o.name,url, snippet:`${o.address}, ${o.city}, ${o.state} ${o.zip} · ${o.phone || 'No phone listed'} · Public directory contact: ${o.contact || 'Not listed'}. Independent ownership needs verification.` }));
  return { results, total:matches.length, offset, limit, hasMore:offset + results.length < matches.length, stateRecords:data.rows.length, checkedAt:data.checkedAt, source:IRS_DIRECTORY, message:matches.length ? `${matches.length} matching e-file provider candidates; showing ${results.length ? offset+1 : 0}–${results.length ? offset+results.length : 0}. Known national chain names filtered. Verify independent ownership and contact details; IRS listing is not an endorsement.` : 'No matching candidates in this state directory. Try a nearby city or ZIP, or use the manual research links.' };
}
