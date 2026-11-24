import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { scriptLibrary } from '../../sales/sales-script-library.mjs';
import { salesScripts } from './sales-scripts.mjs';
import { sqliteStore } from './sqlite.mjs';

const rep = { id: '10', role: 'agent' };
const teammate = { id: '20', role: 'agent' };
const owner = { id: 'owner', role: 'owner' };

test('personal uses and primary choices persist, and only explicit sharing exposes a custom script', t => {
  const directory = mkdtempSync(join(tmpdir(), 'sdr-sales-scripts-'));
  const file = join(directory, 'workspace.sqlite');
  let db = sqliteStore(file);
  let api = salesScripts(db);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const [base] = scriptLibrary;
  const custom = { ...base, title: 'My admissions desk script' };
  assert.throws(() => api.dispatch({ id: 'external', role: 'location' }, 'sales-scripts-read'), { status: 403 });
  const { savedId } = api.dispatch(rep, 'sales-scripts-save', { script: custom });
  assert.equal(api.dispatch(rep, 'sales-scripts-save', { script: custom }).savedId, savedId);
  assert.equal(api.dispatch(rep, 'sales-scripts-read').customCount, 1);
  assert.equal(api.dispatch(owner, 'sales-scripts-read').scripts.some(script => script.id === savedId), false);
  assert.throws(() => api.dispatch(teammate, 'sales-scripts-primary', { id: savedId }), { status: 404 });
  api.dispatch(rep, 'sales-scripts-primary', { id: savedId });
  api.dispatch(rep, 'sales-scripts-use', { id: savedId, channel: 'email' });
  api.dispatch(rep, 'sales-scripts-save', { script: { ...custom, id: savedId }, shared: true });
  assert.equal(api.dispatch(teammate, 'sales-scripts-read').scripts.find(script => script.id === savedId).editable, false);
  api.dispatch(teammate, 'sales-scripts-use', { id: savedId, channel: 'copy' });
  const privateCopy = api.dispatch(teammate, 'sales-scripts-save', { script: { ...custom, id: savedId, title: 'My copy' } });
  assert.notEqual(privateCopy.savedId, savedId);
  assert.equal(api.dispatch(rep, 'sales-scripts-read').scripts.find(script => script.id === savedId).title, custom.title);
  db.close();
  db = sqliteStore(file);
  api = salesScripts(db);
  const restored = api.dispatch(rep, 'sales-scripts-read');
  assert.equal(restored.primaryId, savedId);
  assert.equal(restored.useByScript[savedId], 1);
  assert.equal(restored.topScriptId, savedId);
  assert.equal(restored.uses, 1);
  assert.equal(restored.scripts.some(script => script.id === privateCopy.savedId), false);
  api.dispatch(rep, 'sales-scripts-save', { script: { ...custom, id: savedId }, shared: false });
  const teamView = api.dispatch(teammate, 'sales-scripts-read');
  assert.equal(teamView.scripts.some(script => script.id === savedId), false);
  assert.equal(teamView.uses, 1);
});

test('the builder validates generated drafts and falls back to an unsaved library template', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'sdr-sales-scripts-build-'));
  const db = sqliteStore(join(directory, 'workspace.sqlite'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const [base] = scriptLibrary;
  const request = { prompt: 'Intro for an admissions desk demo', category: base.category };
  const offline = salesScripts(db, { fetcher: async () => { throw new Error('offline'); } });
  const fallback = await offline.dispatch(rep, 'sales-scripts-build', request);
  assert.equal(fallback.generated, false);
  assert.equal(fallback.script.id, undefined);
  assert.equal(fallback.script.category, base.category);
  const online = salesScripts(db, { fetcher: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(options.body);
    assert.match(body.messages[1].content, /admissions desk demo/);
    assert.ok(body.format.properties.versions.required.includes('voicemail'));
    return { ok: true, async json() {
      return { message: { content: JSON.stringify({ ...base, title: 'Admissions desk demonstration' }) } };
    } };
  } });
  const generated = await online.dispatch(rep, 'sales-scripts-build', request);
  assert.equal(generated.generated, true);
  assert.equal(generated.script.title, 'Admissions desk demonstration');
  assert.equal(online.dispatch(rep, 'sales-scripts-read').customCount, 0);
});

test('a rep can personalize, save and reopen the face-to-face signing script using the existing library', t => {
  const directory = mkdtempSync(join(tmpdir(), 'sdr-scripts-visit-'));
  const db = sqliteStore(join(directory, 'workspace.sqlite'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const api = salesScripts(db);
  const { scripts } = api.dispatch(rep, 'sales-scripts-read');
  for (const script of scripts) {
    assert.ok(Object.values(script.versions).every(version => version.length > 0 && !version.includes('undefined')));
    assert.ok(script.versions.voicemail.trim().split(/\s+/).length <= 50);
  }
  const visit = scripts.find(s => s.id === 'visit-sign');
  assert.match(visit.versions.script, /are you ready to sign/i);
  assert.match(visit.versions.objections, /introduce me to the director/);
  const saved = api.dispatch(rep, 'sales-scripts-save', { script: { ...visit, title: 'My desk visit' } });
  assert.equal(saved.scripts.find(s => s.id === saved.savedId).versions.script, visit.versions.script);
});
