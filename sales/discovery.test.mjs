import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { discoverOffices, parseDirectory, unzipState, resolveLocality, IRS_DIRECTORY } from './discovery.mjs';

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let n = 0; n < 8; n++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function zip(name, text) {
  const filename = Buffer.from(name), raw = Buffer.from(text), packed = deflateRawSync(raw), crc = crc32(raw);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(filename.length, 28);
  const ending = Buffer.alloc(22); ending.writeUInt32LE(0x06054b50); ending.writeUInt16LE(1, 8); ending.writeUInt16LE(1, 10);
  ending.writeUInt32LE(central.length + filename.length, 12); ending.writeUInt32LE(local.length + filename.length + packed.length, 16);
  return Buffer.concat([local, filename, packed, central, filename, ending]);
}
const row = (name, address, { region = 'CT', city = 'Hartford', postalCode = '06103', ero = true } = {}) =>
  [name, address, 'None', city, region, postalCode, 'None', 'Published', 'None', 'Contact', '8602045588', ero ? 'X' : ''].join('|');
const data = [
  ...Array.from({ length: 117 }, (_, i) => row(`Office ${i}`, `${i} Main St.`)),
  row('OFFICE-0', '0 MAIN ST', { city: 'HARTFORD' }), row('Office 1', '1 Main St.'), row('office 2', '2 main st'),
  row('H & R Block', '200 Chain Road'), row('Jackson Hewitt', '201 Chain Road'), row('Liberty Tax', '202 Chain Road'),
  row('Not an ERO', '300 Other Road', { ero: false }), row('Other City', '400 Other Road', { city: 'Bridgeport', postalCode: '06604' }),
].join('\n');
const ctZIP = zip('ct.txt', data);

test('bounded ZIP parsing reads the expected state file and preserves published contacts without inferring ownership', () => {
  assert.equal(unzipState(ctZIP, 'CT'), data);
  const entries = parseDirectory(unzipState(ctZIP, 'CT'), 'CT'); assert.equal(entries.length, 125);
  assert.equal(entries[0].contact, 'Published Contact'); assert.equal(entries[0].phone, '8602045588'); assert.equal(entries[0].ero, true); assert.equal(entries[0].independence, undefined);
  assert.throws(() => unzipState(zip('../ct.txt', data), 'CT'), /expected state file/);
  assert.throws(() => unzipState(zip('ma.txt', data), 'CT'), /expected state file/);
  assert.throws(() => unzipState(Buffer.from('not a ZIP'), 'CT'), /supported ZIP/);
});

test('pagination reaches all unique candidates beyond the first 50 and reuses one bounded IRS state download', async () => {
  const requests = [];
  const fetcher = async (url, init) => { requests.push({ url, init }); return new Response(ctZIP); };
  const pages = [];
  for (const offset of [0, 50, 100]) pages.push(await discoverOffices('CT', 'Hartford', fetcher, { offset, limit: 50 }));
  assert.equal(requests.length, 1); assert.equal(requests[0].url, 'https://www.irs.gov/pub/irs-efile/ct.zip'); assert.equal(requests[0].init.redirect, 'error'); assert(requests[0].init.signal instanceof AbortSignal);
  assert.deepEqual(pages.map(p => p.results.length), [50, 50, 17]); assert.deepEqual(pages.map(p => p.hasMore), [true, true, false]); assert(pages.every(p => p.total === 117 && p.source === IRS_DIRECTORY));
  const results = pages.flatMap(p => p.results); assert.equal(new Set(results.map(r => r.candidateId)).size, 117);
  assert(results.every(r => /^[a-f0-9]{24}$/.test(r.candidateId) && r.independence === 'unverified' && r.contactRole === 'unverified'));
  assert(!results.some(r => /block|hewitt|liberty|Not an ERO|Other City/i.test(r.name)));
  assert(pages.every(p => p.checkedAt === pages[0].checkedAt && p.stateRecords === 125));
  const beyond = await discoverOffices('CT', 'Hartford', fetcher, { offset: 150, limit: 50 }); assert.equal(beyond.results.length, 0); assert.equal(beyond.hasMore, false); assert.equal(beyond.total, 117);
  const repeat = await discoverOffices('CT', 'hartford', fetcher, { offset: 0, limit: 50 }); assert.deepEqual(repeat.results.map(r => r.candidateId), pages[0].results.map(r => r.candidateId));
});

test('city and ZIP filtering operate before pagination and duplicate normalization', async () => {
  const fetcher = async () => new Response(ctZIP);
  const first = await discoverOffices('CT', '061', fetcher, { offset: 0, limit: 7 });
  const second = await discoverOffices('CT', '061', fetcher, { offset: 7, limit: 7 });
  assert.equal(first.total, 117); assert.equal(first.limit, 7); assert.equal(second.offset, 7); assert.equal(first.results.length, 7); assert.equal(second.results.length, 7);
  assert(!first.results.some(a => second.results.some(b => a.candidateId === b.candidateId)));
  const other = await discoverOffices('CT', '06604', fetcher); assert.equal(other.total, 1); assert.equal(other.results[0].name, 'Other City'); assert.equal(other.hasMore, false);
  const none = await discoverOffices('CT', 'No Such City', fetcher); assert.equal(none.total, 0); assert.equal(none.results.length, 0); assert.equal(none.hasMore, false); assert.match(none.message, /No matching candidates/);
});

test('separate state ZIPs and candidate identities do not share cached state results', async () => {
  let requests = 0;
  const fetcher = async url => { requests++; assert.equal(url, 'https://www.irs.gov/pub/irs-efile/ma.zip'); return new Response(zip('ma.txt', row('Office 0', '0 Main St.', { region: 'MA', city: 'Boston', postalCode: '02108' }))); };
  const ma = await discoverOffices('MA', 'Boston', fetcher), ct = await discoverOffices('CT', 'Hartford', async () => { throw new Error('Expected cached CT fixture.'); });
  assert.equal(requests, 1); assert.equal(ma.results[0].state, 'MA'); assert.notEqual(ma.results[0].candidateId, ct.results[0].candidateId);
});

test('invalid offsets, page sizes and states fail before any network request', async () => {
  let requests = 0; const fetcher = async () => { requests++; throw new Error('Must not fetch invalid input.'); };
  for (const offset of [-1, 0.5, 100001, NaN, Infinity, '0', null, true]) await assert.rejects(discoverOffices('NY', 'Albany', fetcher, { offset }), error => error.status === 400);
  for (const limit of [-1, 0, 51, 1.5, NaN, Infinity, '50', null, true]) await assert.rejects(discoverOffices('NY', 'Albany', fetcher, { limit }), error => error.status === 400);
  await assert.rejects(discoverOffices('../../private', 'Albany', fetcher), error => error.status === 400); assert.equal(requests, 0);
});

test('unavailable, oversized and malformed directory downloads fail without returning partial candidates', async () => {
  await assert.rejects(discoverOffices('RI', 'Providence', async () => new Response('', { status: 503 })), error => error.status === 502 && /unavailable/.test(error.message));
  const oversized = { ok: true, body: { async *[Symbol.asyncIterator]() { yield Buffer.alloc(8000001); } } };
  await assert.rejects(discoverOffices('RI', 'Providence', async () => oversized), error => error.status === 502 && /size limit/.test(error.message));
  await assert.rejects(discoverOffices('RI', 'Providence', async () => new Response('broken ZIP')), /supported ZIP/);
});
test('Hartford typos are corrected visibly; ambiguous cities and ZIP codes are never silently changed', async () => {
  for (const city of ['hartord','hartrod']) { const result = await discoverOffices('CT', city, async () => new Response(ctZIP), { includeChains:true, exactCity:true, offset:100 }); assert.equal(result.total,120); assert.equal(result.correction.from,city); assert.match(result.locality,/hartford/i); assert(result.results.some(row=>row.chain)); }
  assert.equal(resolveLocality('Cliton',[{city:'Clinton'},{city:'Clifton'}]).correction,null);
  assert.equal(resolveLocality('06103',[{city:'Hartford'}]).locality,'06103');
});
