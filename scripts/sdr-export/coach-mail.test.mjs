import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { salesDailyPlan } from '../../sales/sales-daily-plan.mjs';
import { repEmailWorkspace } from './mail/workspace.mjs';
import { salesCoach } from './sales-coach.mjs';
import { sqliteStore } from './sqlite.mjs';

const owner = { role: 'owner', id: 'owner', name: 'Dawn' };
const fixture = t => {
  const dir = mkdtempSync(join(tmpdir(), 'tinky-actions-')), db = sqliteStore(join(dir, 'test.sqlite')), delivered = [];
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const mail = repEmailWorkspace(db, '11'.repeat(32), { ZOHO_CLIENT_ID: 'test-client', ZOHO_CLIENT_SECRET: 'test-only', ZOHO_REFRESH_TOKEN: 'test-only', SDR_ZOHO_OWNER_ADDRESS: 'rep@example.test' }, {
    transport: { prepare: async (_account, draft) => async () => { delivered.push({ ...draft }); return { messageId: String(delivered.length) }; } },
  });
  const model = async (_url, init) => {
    const body = JSON.parse(init.body);
    const fields = body.format.properties.fields.properties;
    const content = fields.nextAction ? { fields: { nextAction: 'Call on Friday', outcome: 'interested' }, answer: 'Review these fields.' }
      : { action: 'email', fields: { subject: 'A demo for {{organization}}', body: 'Hi {{contact}}, can we show a board at {{organization}}? {{rep}}' }, answer: 'Prepared', sources: [] };
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(content) } }) };
  };
  const coach = salesCoach(db, salesDailyPlan(db), { mail, fetcher: model });
  const create = (town, contact_email, id = 'owner') => db.create('offices', { town, contact_name: town + ' director', contact_email, assigned_to: id, status: 'new', state: 'CT', locality: 'Hartford', notes: '{}' });
  const ask = (question, lastId = 0, extras = {}) => coach.dispatch(owner, 'coach-ask', { question, lastId, requestId: randomUUID(), timeZone: 'UTC', ...extras }).then(res => res.turn);
  return { db, mail, coach, create, ask, delivered };
};

test('chat previews two separately addressed messages, sends on confirmation, and a retry never resubmits', async t => {
  const { db, coach, ask, create, delivered } = fixture(t);
  create('North Clinic', 'north@example.test'); create('West Library', 'west@example.test');
  const preview = await ask('Email North Clinic and West Library about a demo');
  assert.deepEqual(preview.mail.entries.map(e => e.to), ['north@example.test', 'west@example.test']);
  assert.match(preview.mail.entries[0].subject, /North Clinic/); assert.match(preview.mail.entries[1].body, /West Library/);
  assert.equal(delivered.length, 0);
  const confirmation = { question: 'Send them', requestId: randomUUID(), timeZone: 'UTC', lastId: preview.id, mailTurnId: preview.id };
  const sent = await coach.dispatch(owner, 'coach-ask', confirmation);
  assert.match(sent.turn.answer, /Zoho Mail accepted/);
  assert.deepEqual((await coach.dispatch(owner, 'coach-ask', confirmation)).turn, sent.turn);
  assert.equal(delivered.length, 2); assert.equal(db.list('events').length, 2);
  for (const item of delivered) { assert.equal(item.from, 'rep@example.test'); assert.equal(item.cc, ''); assert.equal(item.bcc, ''); }
});

test('a rep can revise the subject and new contact preferences are checked again when sending', async t => {
  const { db, ask, create, delivered } = fixture(t);
  const target = create('North Clinic', 'north@example.test');
  const preview = await ask('Email this prospect. Subject: Friday demo Body: Shall we meet?', 0, { screen: { view: 'pipeline', officeId: String(target.id) } });
  assert.equal(preview.mail.entries[0].body, 'Shall we meet?');
  const edited = await ask('Change the subject to Tuesday demo', preview.id);
  assert.equal(edited.mail.entries[0].subject, 'Tuesday demo');
  assert.equal(edited.mail.entries[0].body, 'Shall we meet?');
  db.patch('offices', target.id, { status: 'do_not_contact' });
  const result = await ask('Send it', edited.id);
  assert.match(result.answer, /paused/i); assert.equal(delivered.length, 0);
});

test('expired previews, cancellation and a generic form fill dispatch no mail', async t => {
  const { ask, create, delivered } = fixture(t);
  create('North Clinic', 'north@example.test');
  const preview = await ask('Email North Clinic. Subject: Friday Body: Shall we meet?');
  const cancel = await ask('Cancel the email', preview.id);
  const stale = await ask('Send it', cancel.id, { mailTurnId: preview.id }); assert.match(stale.answer, /new email preview/);
  const form = await ask('Fill in the pipeline progress form. The outcome was interested and the next action is call on Friday.', stale.id, { screen: { view: 'pipeline' } });
  assert.equal(form.apply, true); assert.equal(form.draft.formKey, 'progress'); assert.equal(form.draft.fields.nextAction, 'Call on Friday');
  assert.equal(delivered.length, 0);
});

test('saving the reviewed call uses edited fields and records one confirmed CRM action', async t => {
  const { db, coach, create } = fixture(t);
  const office = create('North Clinic', 'north@example.test');
  const draft = db.coach.append(owner.id, randomUUID(), 'Log the call', { mode: 'ai', answer: 'Review', sources: [], draft: {
    type: 'activity', recordId: String(office.id), recordName: office.town, fields: { kind: 'call', note: 'Initial note' } } }, 0);
  const input = { question: 'Save it', lastId: draft.id, requestId: randomUUID(), screen: { view: 'pipeline', officeId: String(office.id) },
    reviewed: { type: 'activity', recordId: String(office.id), fields: { kind: 'call', note: 'Edited by the rep' } } };
  let writes = 0;
  const crm = async (user, action, fields) => {
    assert.equal(user.id, owner.id); assert.equal(action, 'activity'); assert.equal(fields.note, 'Edited by the rep'); writes++;
    db.create('events', { assigned_to: fields.id, notes: JSON.stringify(fields) });
  };
  const saved = await coach.dispatch(owner, 'coach-ask', input, crm);
  assert.equal(saved.turn.saved.type, 'activity');
  await coach.dispatch(owner, 'coach-ask', input, crm);
  assert.equal(writes, 1);
});
