/** Read-only check against the configured office backend. No public deployment,
 * enrollment, contact action or change to saved records occurs here. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createDirectoryHandler } from '../../sales/directory-handler.mjs';

const env = JSON.parse(readFileSync(path.join(homedir(), '.config/gigtax-sales/installation.json'), 'utf8'));
const server = createServer(createDirectoryHandler(env));
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/api/offices', { signal: AbortSignal.timeout(45_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.version, 1); assert(Array.isArray(result.offices));
  const keys = ['address','appointmentURL','available24x7','city','exteriorImageURL','hours','id','latitude','longitude','name','phone','postalCode','state'];
  for (const office of result.offices) assert.deepEqual(Object.keys(office).sort(), keys);
  const denied = await fetch(origin + '/api/offices', { method: 'POST', signal: AbortSignal.timeout(5000) });
  assert.equal(denied.status, 405);
  const receipt = { ok: true, verifiedAt: new Date().toISOString(),
    scope: 'Local packaged directory HTTP handler reading the real configured TinkySDR/D1 office backend',
    publicOfficeCount: result.offices.length, publicContactConfigured: Boolean(result.support.phone || result.support.appointmentURL),
    privateFieldProjectionVerified: true, readOnlyMethodVerified: true, publicDeploymentVerified: false,
    recordsChanged: false, appointmentBooked: false, phoneCallMade: false };
  writeFileSync('docs/deployments/gigtax-office-directory-backend-20261107.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
