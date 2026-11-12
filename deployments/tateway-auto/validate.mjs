/** Parse Compose only. This never starts Docker, a container, a VM or a provider. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(process.argv[2] ?? path.join(root, 'host.env.example'));
const allowed = new Set(['SHUUG_PUBLIC_HOST', 'APP_BASE_URL', 'SHUUG_IMAGE', 'SHUUG_WORKSPACE_VOLUME', 'SHUUG_DATA_DIR']);
const env = {};
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const match = /^([A-Z_]+)=([^\r\n]*)$/.exec(line);
  assert(match && allowed.has(match[1]), 'Keep host.env limited to the documented public deployment values. Provider secrets belong in the native vault.');
  assert(!(match[1] in env), 'Duplicate deployment value.');
  env[match[1]] = match[2];
}
assert(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(env.SHUUG_PUBLIC_HOST), 'Set the public DNS hostname.');
assert.equal(env.APP_BASE_URL, `https://${env.SHUUG_PUBLIC_HOST}`, 'Public origin and hostname must match exactly.');
assert(/^\/data(?:\/[A-Za-z0-9_-]+)*$/.test(env.SHUUG_DATA_DIR ?? '/data'), 'Data must stay inside the dedicated mounted volume.');
const result = spawnSync('docker', ['compose', '--env-file', envFile, '-f', path.join(root, 'compose.yaml'), '--profile', 'setup', 'config', '--format', 'json'], { encoding: 'utf8' });
if (result.error) throw new Error('Docker Compose CLI is required for configuration validation; do not start a daemon or VM for this check.');
assert.equal(result.status, 0, 'Compose configuration could not be parsed. Check the local Compose CLI and public host.env values.');
const config = JSON.parse(result.stdout);
assert.deepEqual(Object.keys(config.services).sort(), ['initialize', 'proxy', 'web', 'worker']);
for (const name of ['initialize', 'web', 'worker']) {
  const service = config.services[name], environment = service.environment;
  assert.equal(service.image, env.SHUUG_IMAGE ?? 'tateway-auto-shuug:local');
  assert.equal(environment.APP_BASE_URL, env.APP_BASE_URL, 'An inherited environment variable changed the selected public origin.');
  assert.equal(environment.DATABASE_URL, ''); assert.equal(environment.DEMO_DATA, 'false');
  assert.equal(environment.AUTH_ENABLED, 'true'); assert.equal(environment.NODE_ENV, 'production');
  assert.equal(environment.DEALDESK_DATA_DIR, env.SHUUG_DATA_DIR ?? '/data');
  assert(!('WORKSPACE_ACCESS_TOKEN' in environment), 'Never inject the local demo gateway token into this deployment.');
  assert(service.volumes.some(v => v.source === 'workspace' && v.target === '/data'));
  assert(!service.ports?.length, 'Only the TLS proxy may publish host ports.');
}
assert.equal(config.services.initialize.network_mode, 'none');
assert.deepEqual(config.services.worker.command, ['node', '--import', 'tsx', 'scripts/shop-worker.ts']);
assert.equal(config.services.proxy.environment.SHUUG_PUBLIC_HOST, env.SHUUG_PUBLIC_HOST, 'An inherited environment variable changed the TLS hostname.');
for (const name of ['proxy', 'worker']) assert.equal(config.services[name].depends_on.web.condition, 'service_healthy');
assert(config.services.web.healthcheck.test.join(' ').includes('/api/shop-health'));
assert.deepEqual(config.services.proxy.ports.map(p => String(p.published)).sort(), ['443', '80']);
assert.equal(config.volumes.workspace.name, env.SHUUG_WORKSPACE_VOLUME ?? 'tateway-auto-workspace');
const caddy = readFileSync(path.join(root, 'Caddyfile'), 'utf8');
assert(caddy.includes('reverse_proxy web:3000'));
assert(!/header_up\s+Authorization/i.test(caddy), 'The public proxy must not inject owner authorization.');
JSON.parse(readFileSync(path.join(root, 'workspace-plan.json'), 'utf8'));
console.log('Validated dedicated TateWay Compose configuration: one private workspace, one shop worker, readiness-gated TLS proxy. No services started.');
