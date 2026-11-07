/** Verify the real public backend before enabling website and native-app discovery. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { publicHttpsUrl } = createRequire(import.meta.url)('../public/rideshare-tax-pros/links.js');
const supplied = process.argv[2];
assert(publicHttpsUrl(supplied), 'Supply the actual hosted HTTPS workspace origin.');
const origin = new URL(supplied);
assert(origin.pathname === '/' && !origin.search && !origin.hash, 'Use an origin without a path, query or fragment.');
const request = (route, init = {}) => fetch(origin.origin + route, {
  ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
});
const health = await request('/api/website/customer/driver/health');
assert.equal(health.status, 200, 'The backend is not ready.');
assert.deepEqual(await health.json(), { service: 'gig-tax-pros-workspace', apiVersion: 1, ready: true }, 'Unexpected backend.');
const portal = await request('/api/website/customer');
assert.equal(portal.status, 200, 'The client portal is unavailable.');
assert.match(await portal.text(), /Client sign-in/);
assert.match(portal.headers.get('cache-control') || '', /no-store/);
const records = await request('/api/website/customer/driver/records');
assert.equal(records.status, 401, 'Driver records must require client authentication.');
const denied = await request('/api/website/customer/driver/session', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: '{}',
});
assert.equal(denied.status, 403, 'Cross-origin sign-in was not denied.');
const file = path.join(root, 'public/rideshare-tax-pros/site-config.json');
const config = JSON.parse(readFileSync(file, 'utf8'));
config.workspaceUrl = `${origin.origin}/api/website/customer`;
const temporary = `${file}.${randomUUID()}.tmp`;
writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
renameSync(temporary, file);
console.log(JSON.stringify({ ok: true, workspaceUrl: config.workspaceUrl, verifiedAt: new Date().toISOString(),
  next: 'Verify invited-client/app sync, persistence and backup recovery on this host, then build and deploy the public website.' }, null, 2));
