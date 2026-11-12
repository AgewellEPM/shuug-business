import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET } from '../../src/app/api/shop-health/route.ts';
import { saveSecrets } from '../../src/lib/connections/vault.ts';
import { hashPassword } from '../../src/lib/auth/passwords.ts';

let directory;
const original = { data: process.env.DEALDESK_DATA_DIR, database: process.env.DATABASE_URL, owner: process.env.WORKSPACE_OWNER_PASSWORD_HASH,
  gateway: process.env.WORKSPACE_ACCESS_TOKEN, legacyGateway: process.env.PPC_WORKSPACE_ACCESS_TOKEN };
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'tateway-health-'));
  process.env.DEALDESK_DATA_DIR = directory;
  for (const key of ['DATABASE_URL', 'WORKSPACE_OWNER_PASSWORD_HASH', 'WORKSPACE_ACCESS_TOKEN', 'PPC_WORKSPACE_ACCESS_TOKEN']) process.env[key] = '';
});
afterEach(() => {
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: original.data, DATABASE_URL: original.database,
    WORKSPACE_OWNER_PASSWORD_HASH: original.owner, WORKSPACE_ACCESS_TOKEN: original.gateway, PPC_WORKSPACE_ACCESS_TOKEN: original.legacyGateway })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});
async function expectStatus(status, code) {
  const response = await GET();
  assert.equal(response.status, code);
  assert.deepEqual(await response.json(), { status });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
}
test('public readiness holds an unconfigured or malformed owner setup', async () => {
  await expectStatus('setup_required', 503);
  saveSecrets({ WORKSPACE_OWNER_PASSWORD_HASH: 'not-a-native-password-hash', WORKSPACE_ACCESS_TOKEN: 'short' });
  await expectStatus('setup_required', 503);
});
test('native configured owner makes the SQLite workspace ready', async () => {
  saveSecrets({ WORKSPACE_OWNER_PASSWORD_HASH: hashPassword('Synthetic-private-owner-password') });
  await expectStatus('ready', 200);
});
test('an authenticated owner gateway can satisfy readiness without exposing its key', async () => {
  saveSecrets({ WORKSPACE_ACCESS_TOKEN: 'synthetic-private-owner-gateway-token-123456789' });
  await expectStatus('ready', 200);
});
test('private vault and SQLite failures reveal only unavailable', async () => {
  writeFileSync(path.join(directory, 'connections.enc'), 'PRIVATE-CORRUPT-VAULT-SENTINEL', { mode: 0o600 });
  await expectStatus('unavailable', 503);
  rmSync(path.join(directory, 'workspace.sqlite'));
  mkdirSync(path.join(directory, 'workspace.sqlite'));
  await expectStatus('unavailable', 503);
});
test('unexpected external database selection cannot report dedicated readiness', async () => {
  process.env.DATABASE_URL = 'postgresql://synthetic.invalid/unrelated-workspace';
  await expectStatus('unavailable', 503);
});
