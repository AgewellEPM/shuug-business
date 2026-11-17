import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './handler.mjs';
import { digest, HttpError } from './model.mjs';
import { workspaceOrigin } from './workspace-session.mjs';

test('shared sign-in maps the assigned roles to their own sales and location surfaces', async () => {
  const origin = 'https://gigtax.pro';
  const env = { GIGTAX_TINKY_KEY: 'synthetic', GIGTAX_SALES_SESSION_KEY: 'a'.repeat(64), GIGTAX_SALES_OWNER_HASH: digest('synthetic-owner'), GIGTAX_SALES_ORIGIN: origin };
  const locationTicket = 'b'.repeat(64), staffTicket = 'c'.repeat(64);
  const records = {
    agents: [{ id: '41', status: 'active', contact_name: 'Synthetic Staff', notes: '{"states":["CT"]}' }],
    offices: [{ id: '61', town: 'Assigned Office', state: 'CT', locality: 'Hartford', notes: '{"address":"1 Main Street"}', assigned_to: '41' },
      { id: '62', town: 'Unrelated Office', state: 'CT', locality: 'Hartford', notes: '{}' }],
    enrollments: [{ id: '71', status: 'active', notes: '{"leadId":"62","acceptedAt":"synthetic"}' }], events: [],
  };
  const db = { list: async kind => records[kind], terms: async () => null, get: async (kind, id) => records[kind].find(row => row.id === id) };
  const tickets = new Map([[locationTicket, { role: 'location', targetId: '61' }], [staffTicket, { role: 'staff', targetId: '41' }]]), sessions = new Map();
  const handler = createHandler(env, db, { workspaceSession: async (action, token) => {
    if (action === 'revoke') { sessions.delete(token); return; }
    const value = (action === 'redeem' ? tickets : sessions).get(token);
    if (!value) throw new HttpError(401, 'Session expired.');
    if (action === 'read') return value;
    tickets.delete(token);
    const session = digest(token), expires = Date.now() + 60000;
    sessions.set(session, value);
    return { ...value, session, expires };
  } });
  async function post(requestOrigin, body, cookie = '') {
    const headers = new Map();
    let status, result;
    await handler({ method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json', cookie }, body }, {
      setHeader(name, value) { headers.set(name, value); },
      end(value) { status = this.statusCode; result = JSON.parse(value); },
    });
    return { status, result, headers, cookie: headers.get('Set-Cookie')?.split(';')[0] };
  }
  assert.equal((await post('https://untrusted.example', { action: 'workspace-entry', ticket: locationTicket })).status, 403);
  const location = await post(workspaceOrigin, { action: 'workspace-entry', ticket: locationTicket });
  assert.deepEqual(location.result, { destination: '/location' });
  assert.equal(location.headers.get('Access-Control-Allow-Origin'), workspaceOrigin);
  assert.match(location.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await post(workspaceOrigin, { action: 'workspace-entry', ticket: locationTicket })).status, 401);
  assert.equal((await post(workspaceOrigin, { action: 'my-location' }, location.cookie)).status, 403);
  const own = await post(origin, { action: 'my-location', id: '62' }, location.cookie);
  assert.deepEqual(own.result, { location: { name: 'Assigned Office', city: 'Hartford', state: 'CT', address: '1 Main Street', membership: 'setup_pending' } });
  for (const action of ['bootstrap', 'office', 'mailboxes', 'create-agent']) assert.equal((await post(origin, { action }, location.cookie)).status, 403);
  assert.equal((await post(origin, { action: 'logout' }, location.cookie)).status, 200);
  assert.equal((await post(origin, { action: 'my-location' }, location.cookie)).status, 401);

  const staff = await post(workspaceOrigin, { action: 'workspace-entry', ticket: staffTicket });
  assert.deepEqual(staff.result, { destination: '/sales' });
  const bootstrap = await post(origin, { action: 'bootstrap' }, staff.cookie);
  assert.equal(bootstrap.result.user.role, 'agent');
  assert.deepEqual(bootstrap.result.offices.map(row => row.id), ['61']);
  assert.equal((await post(origin, { action: 'my-location' }, staff.cookie)).status, 403);
  records.agents[0].status = 'revoked';
  assert.equal((await post(origin, { action: 'bootstrap' }, staff.cookie)).status, 403);
});
