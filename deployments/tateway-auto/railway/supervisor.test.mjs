import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { shopServerConfiguration, superviseShopProcesses } from '../../../scripts/shop-server.mjs';

const fixture = (ignoreTerm = false) => ({ command: process.execPath, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], args: ['-e', `
  process.on('SIGTERM', () => { ${ignoreTerm ? '' : 'process.send?.({ stopped: true }); process.exit(0);'} });
  process.on('message', message => { if (message === 'fail') process.exit(7); });
  setInterval(() => {}, 1000); process.send?.({ ready: true });
`] });
function harness(options = {}) {
  const started = new Set(), pids = [], exits = new Map(), messages = [], signals = new EventEmitter();
  const controller = superviseShopProcesses({ web: fixture(), worker: fixture(), graceMs: 100, pollMs: 5, signals,
    ...options, log: message => messages.push(message), onChild: (name, child) => {
      pids.push(child.pid); child.on('message', message => { if (message.ready) started.add(name); });
      child.on('exit', (code, signal) => exits.set(name, { code, signal }));
    } });
  const waitFor = async predicate => {
    const deadline = Date.now() + 3000;
    while (!predicate()) { assert(Date.now() < deadline, 'Fixture process did not reach the expected state.'); await delay(5); }
  };
  return { controller, started, pids, exits, messages, signals, waitFor };
}
function assertGone(pids) {
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
}

test('runtime honors Railway PORT and forces private production application settings', () => {
  const config = shopServerConfiguration({ PORT: '4567', APP_BASE_URL: 'https://portal.tatewayauto.com', DEALDESK_DATA_DIR: '/data', AUTH_ENABLED: 'false', DEMO_DATA: 'true' });
  assert.deepEqual(config.web.args.slice(-4), ['--hostname', '0.0.0.0', '--port', '4567']);
  assert.equal(config.env.AUTH_ENABLED, 'true'); assert.equal(config.env.DEMO_DATA, 'false');
  assert.equal(config.env.DATABASE_URL, ''); assert.equal(config.env.NODE_ENV, 'production');
  assert.equal(config.env.SHUUG_BACKEND_URL, 'http://127.0.0.1:4567');
  assert.throws(() => shopServerConfiguration({ APP_BASE_URL: 'http://public.example.invalid' }));
  assert.throws(() => shopServerConfiguration({ APP_BASE_URL: 'https://portal.tatewayauto.com', DATABASE_URL: 'postgres://unrelated' }));
});

test('web starts alone during owner setup, then one worker starts when readiness succeeds', async () => {
  let ready = false;
  const h = harness({ ready: async () => ready });
  try {
    await h.waitFor(() => h.started.has('web')); await delay(30);
    assert.equal(h.controller.children.has('worker'), false);
    ready = true; await h.waitFor(() => h.started.has('worker'));
    assert.equal(h.controller.children.size, 2);
    h.signals.emit('SIGTERM'); assert.equal(await h.controller.done, 0);
    assertGone(h.pids); assert.equal(h.signals.listenerCount('SIGTERM'), 0);
  } finally { await h.controller.stop(); }
});

test('unexpected worker failure stops the web and reports failure for platform restart', async () => {
  const h = harness();
  try {
    await h.waitFor(() => h.started.size === 2);
    h.controller.children.get('worker').send('fail');
    assert.equal(await h.controller.done, 1);
    assert.equal(h.exits.get('worker').code, 7); assertGone(h.pids);
    assert(h.messages.every(message => !message.includes('APP_BASE_URL') && !message.includes('Authorization')));
  } finally { await h.controller.stop(); }
});

test('SIGINT forcibly stops an uncooperative owned child after the grace period', async () => {
  const h = harness({ worker: fixture(true), graceMs: 50 });
  try {
    await h.waitFor(() => h.started.size === 2);
    const started = Date.now(); h.signals.emit('SIGINT');
    assert.equal(await h.controller.done, 0);
    assert(Date.now() - started < 2000); assert.equal(h.exits.get('worker').signal, 'SIGKILL'); assertGone(h.pids);
  } finally { await h.controller.stop(); }
});

test('spawn failure also cleans up any other owned child', async () => {
  const h = harness({ worker: { command: '/nonexistent/tateway-fixture-binary', args: [], stdio: 'ignore' } });
  try { assert.equal(await h.controller.done, 1); assertGone(h.pids.filter(Boolean)); }
  finally { await h.controller.stop(); }
});
