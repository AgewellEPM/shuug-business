import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePipelineDelta } from './prepare-pipeline-release.mjs';
const before = '<header>UNCHANGED HEADER</header><main>UNCHANGED ART</main><nav aria-label="Footer Start here"><a href="/contact">Contact</a></nav>';
const after = before.replace('</nav>', '<a href="/sales">Agent sign-in</a></nav>');
test('the pipeline release permits precisely the agent sign-in footer link and rejects other public edits', () => {
  assert.equal(validatePipelineDelta('static/index.html', Buffer.from(before), Buffer.from(after)), 'agent_signin_footer');
  for (const html of [after.replace('UNCHANGED ART', 'OTHER ART'), after.replace('UNCHANGED HEADER', 'NEW HEADER'), before + '<a href="/sales">Agent sign-in</a>']) assert.throws(() => validatePipelineDelta('static/index.html', Buffer.from(before), Buffer.from(html)));
});
test('the one callback API route is allowed while existing routes, headers and CSP are immutable', () => {
  const original = { version: 3, routes: [{ src: '/.*', headers: { 'Content-Security-Policy': "default-src 'self'" }, continue: true }, { src: '/api/sales', dest: '/api/sales' }] };
  const candidate = { ...original, routes: [...original.routes, { src: '/api/sales-mail-webhook', dest: '/api/sales-mail-webhook' }] };
  assert.equal(validatePipelineDelta('config.json', Buffer.from(JSON.stringify(original)), Buffer.from(JSON.stringify(candidate))), 'mail_callback_route');
  candidate.routes = [{ src: '/.*', headers: { 'Content-Security-Policy': '*' }, continue: true }, ...candidate.routes.slice(1)];
  assert.throws(() => validatePipelineDelta('config.json', Buffer.from(JSON.stringify(original)), Buffer.from(JSON.stringify(candidate))), /Existing routes/);
});
test('unrelated payment, public directory and media changes remain blocked', () => {
  for (const name of ['functions/api/sales.func/payments.mjs', 'functions/api/offices.func/directory.mjs', 'static/assets/artwork.png', 'static/styles.css']) assert.throws(() => validatePipelineDelta(name, Buffer.from('before'), Buffer.from('after')));
});
