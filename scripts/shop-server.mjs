/** Railway's single-volume process supervisor. No bootstrap endpoint or provider setup. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export function shopServerConfiguration(input = process.env) {
  const port = Number(input.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid service port is required.');
  const base = new URL(input.APP_BASE_URL ?? '');
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('An exact public HTTPS workspace origin is required.');
  if (input.DATABASE_URL?.trim()) throw new Error('This dedicated shop uses its private SQLite volume.');
  const directory = input.DEALDESK_DATA_DIR ?? '/data';
  if (!/^\/data(?:\/[A-Za-z0-9_-]+)*$/.test(directory)) throw new Error('The shop data directory must stay in its mounted /data volume.');
  const env = { ...input, PORT: String(port), APP_BASE_URL: base.origin, DEALDESK_DATA_DIR: directory,
    NODE_ENV: 'production', AUTH_ENABLED: 'true', DATABASE_URL: '', DEMO_DATA: 'false', NEXT_TELEMETRY_DISABLED: '1',
    SHUUG_BACKEND_URL: `http://127.0.0.1:${port}` };
  return { env, port,
    web: { command: process.execPath, args: ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', String(port)] },
    worker: { command: process.execPath, args: ['--import', 'tsx', 'scripts/shop-worker.ts'] } };
}

/** Commands/readiness/signals are injectable only for real fixture-process tests. */
export function superviseShopProcesses({ web, worker, env = process.env, cwd = process.cwd(), ready = async () => true,
  pollMs = 1000, graceMs = 20000, signals = process, onChild = () => {}, log = () => {} }) {
  if (!Number.isInteger(graceMs) || graceMs < 1 || graceMs > 45000 || !Number.isInteger(pollMs) || pollMs < 1) throw new Error('Invalid supervisor timing.');
  const children = new Map(), live = new Set();
  let closing = false, result = 0, killTimer, pollTimer, wakePoll;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const listeners = new Map();
  function finish() {
    if (!closing || live.size) return;
    clearTimeout(killTimer); clearTimeout(pollTimer); wakePoll?.();
    for (const [signal, handler] of listeners) signals.off(signal, handler);
    resolveDone(result);
  }
  function stop(code = 0) {
    if (closing) return done;
    closing = true; result = code;
    clearTimeout(pollTimer); wakePoll?.();
    for (const child of live) child.kill('SIGTERM');
    killTimer = setTimeout(() => {
      for (const child of live) child.kill('SIGKILL');
    }, graceMs);
    finish(); return done;
  }
  function start(name, command) {
    if (closing) return;
    let child;
    try { child = spawn(command.command, command.args, { cwd, env, stdio: command.stdio ?? 'inherit' }); }
    catch { log('Shop process could not start.'); void stop(1); return; }
    children.set(name, child); live.add(child);
    child.once('error', () => {
      if (!child.pid) live.delete(child);
      log('Shop process could not start.'); void stop(1); finish();
    });
    child.once('close', () => {
      live.delete(child);
      if (!closing) { log('A shop process stopped unexpectedly; restarting the service.'); void stop(1); }
      finish();
    });
    try { onChild(name, child); } catch { void stop(1); }
  }
  for (const signal of ['SIGTERM', 'SIGINT']) {
    const handler = () => { void stop(0); };
    listeners.set(signal, handler); signals.on(signal, handler);
  }
  start('web', web);
  void (async () => {
    while (!closing) {
      let available = false;
      try { available = await ready(); } catch { /* Private setup/storage failures only hold the worker. */ }
      if (closing) break;
      if (available) { start('worker', worker); break; }
      await new Promise(resolve => { wakePoll = resolve; pollTimer = setTimeout(resolve, pollMs); });
      wakePoll = undefined;
    }
  })();
  return { done, stop, children };
}

async function main() {
  const config = shopServerConfiguration();
  const controller = superviseShopProcesses({ ...config, cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    ready: async () => {
      const response = await fetch(`http://127.0.0.1:${config.port}/api/shop-health`, { signal: AbortSignal.timeout(2500) });
      return response.ok && (await response.json()).status === 'ready';
    }, log: message => process.stderr.write(`${message}\n`) });
  process.exitCode = await controller.done;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('Shop service configuration is incomplete.\n'); process.exitCode = 1; });
}
