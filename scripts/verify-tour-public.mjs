import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'deployments/rideshare-tax-pros/.vercel/output/static');
const manifest = JSON.parse(await readFile(path.join(source, 'site-manifest.json'), 'utf8'));
const origin = manifest.origin;
const home = await readFile(path.join(source, 'index.html'));
const movie = await readFile(path.join(source, 'tour/getting-started.mp4'));
const movieSHA256 = createHash('sha256').update(movie).digest('hex');
const expectedTour = JSON.parse(await readFile(path.join(source, 'tour/chapters.json'), 'utf8'));
const checks = [];
async function load(url, headers = {}) {
  return fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(30000) });
}
for (const host of [origin, origin.replace('://', '://www.')]) {
  const response = await load(host);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), home, `${host} homepage differs from the saved version`);
  checks.push({ origin: host, homepageMatches: true });
}
const markup = home.toString('utf8');
const moviePath = markup.match(/<source src="([^"]+\.mp4[^"]*)"/)[1];
assert(moviePath.includes(movieSHA256.slice(0, 12)), 'The new movie needs a cache revision');
const ranged = await load(new URL(moviePath, origin), { Range: 'bytes=0-1023' });
assert.equal(ranged.status, 206);
assert.equal(ranged.headers.get('content-range'), `bytes 0-1023/${movie.length}`);
assert(ranged.headers.get('content-type')?.startsWith('video/mp4'));
assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), movie.subarray(0, 1024));
checks.push({ videoRangeStatus: 206, contentRange: ranged.headers.get('content-range') });
const captionPath = markup.match(/<track[^>]*src="([^"]+)"/)[1];
const captions = await load(new URL(captionPath, origin));
assert.equal(captions.status, 200);
assert(captions.headers.get('content-type')?.startsWith('text/vtt'));
const captionText = await captions.text();
assert.equal(captionText, await readFile(path.join(source, 'tour/captions.en.vtt'), 'utf8'));
assert.equal((captionText.match(/ --> /g) || []).length, 54);
checks.push({ captionContentType: captions.headers.get('content-type'), cues: 54 });
const posterPath = markup.match(/<video[^>]*poster="([^"]+)"/)[1];
const poster = await load(new URL(posterPath, origin));
assert.equal(poster.status, 200);
assert(poster.headers.get('content-type')?.startsWith('image/jpeg'));
assert.deepEqual(Buffer.from(await poster.arrayBuffer()), await readFile(path.join(source, 'tour/poster.jpg')));
const tour = await load(new URL('/tour/chapters.json', origin));
assert.equal(tour.status, 200);
assert.deepEqual(await tour.json(), expectedTour);
assert.equal(expectedTour.chapters.length, 13);
checks.push({ posterMatches: true, chapterCount: 13, duration: expectedTour.duration });
console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), deployment: process.argv[2] || null,
  movieSHA256, movieSizeBytes: movie.length, checks,
  scope: 'Live HTTP delivery, cache revision, byte ranges and captions. Human visual acceptance is separate.' }, null, 2));
