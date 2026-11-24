import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { renderSalesCoach } from '../rideshare-site/sales-coach.mjs';

const script = readFileSync(new URL('../../public/rideshare-tax-pros/sales-coach.js', import.meta.url), 'utf8');
const controlsScript = readFileSync(new URL('../../public/rideshare-tax-pros/sales-coach-controls.js', import.meta.url), 'utf8');

test('opening and minimizing the coach preserves the underlying screen and navigation runs once', async t => {
  const dom = new JSDOM('<main id="sales-workspace"><section id="work"></section>' + renderSalesCoach(() => '') + '</main>', {
    url: 'https://workspace.example/sales#view=today', runScripts: 'outside-only',
  });
  const w = dom.window, el = selector => w.document.querySelector(selector);
  t.after(() => w.close());
  w.eval(script);
  let here = { view: 'today', label: 'Today’s Plan' }, navigations = 0;
  const turns = [], saved = { turns, next: [], calendar: {}, goal: null };
  const api = async (action, data) => {
    if (action === 'coach-state') return { ...saved, turns: [...turns] };
    assert.equal(data.screen.view, 'today');
    const turn = { id: 1, question: data.question, answer: 'Here is Pipeline.', mode: 'workflow',
      sources: [], navigation: { title: 'Pipeline', href: '#view=pipeline' } };
    turns.push(turn); return { turn };
  };
  const coach = w.SdrCoach.mount({ api, context: () => here, navigate(href) {
    ++navigations; assert.equal(href, '#view=pipeline'); here = { view: 'pipeline', label: 'Pipeline' }; w.location.hash = href;
  } });
  coach.view({ id: 'staff1' });
  assert.equal(el('[data-tab-panel="coach"]'), null); assert.equal(el('#coach-popup').hidden, true);
  el('#coach-launch').click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.location.hash, '#view=today'); assert.equal(el('#coach-popup').hidden, false);
  const composer = el('#coach-form');
  composer.elements.question.value = 'Open my pipeline';
  composer.requestSubmit(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(navigations, 1); assert.equal(el('#coach-context').textContent, 'Pipeline'); assert.equal(el('#coach-popup').hidden, false);
  el('#coach-show-goal').click(); assert.equal(el('#coach-side').hidden, false);
  el('#coach-minimize').click(); assert.equal(w.location.hash, '#view=pipeline'); assert.equal(el('#coach-launch').hidden, false);
  el('#coach-launch').click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(navigations, 1);
  coach.reset(); assert.equal(el('#coach-widget').hidden, true); assert.equal(el('#coach-messages').children.length, 0);
});

test('voice capture stops before a reply is read and resumes only while the rep is in voice mode', () => {
  const dom = new JSDOM('<button id="mic" hidden></button>', { runScripts: 'outside-only' });
  const w = dom.window, submitted = [];
  let listening, spoken;
  w.SpeechRecognition = class { start() { listening = this; } stop() { listening = null; } abort() { this.stop(); } };
  w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  w.speechSynthesis = { speak(u) { spoken = u; }, cancel() {} };
  w.eval(controlsScript);
  const mic = w.document.querySelector('#mic'), voice = w.SdrCoachControls.voice(mic, text => submitted.push(text), () => {});
  mic.click(); assert.equal(mic.hidden, false);
  listening.onresult({ results: [{ isFinal: true, 0: { transcript: 'Open my pipeline' } }] });
  assert.deepEqual(submitted, ['Open my pipeline']); assert.equal(listening, null);
  voice.answer({ answer: 'Opened Pipeline.' }); assert.equal(spoken.text, 'Opened Pipeline.'); assert.equal(listening, null);
  spoken.onend(); assert.ok(listening); voice.stop(); assert.equal(listening, null);
  dom.window.close();
});

test('Speak explains a disconnected microphone and leaves typing available', async t => {
  const dom = new JSDOM('<form><textarea name="question"></textarea><button type="button" id="mic"><span>Speak</span></button></form>', { runScripts: 'outside-only' });
  const w = dom.window, messages = [], constraints = [];
  t.after(() => dom.window.close());
  w.AudioContext = class { resume() { return Promise.resolve(); } close() { return Promise.resolve(); } };
  w.AudioWorkletNode = class {};
  w.navigator.mediaDevices = { async getUserMedia(request) { constraints.push(request); throw new w.DOMException('No inputs', 'NotFoundError'); } };
  w.eval(controlsScript);
  const mic = w.document.querySelector('#mic');
  w.SdrCoachControls.voice(mic, () => assert.fail('No command was spoken'), text => messages.push(text), () => true);
  mic.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(constraints.length, 1); assert.equal(constraints[0].video, false);
  assert.match(messages.at(-1), /No microphone.*power on.*Sound → Input/);
  assert.equal(mic.getAttribute('aria-pressed'), 'false'); assert.equal(mic.textContent, 'Speak');
  assert.equal(mic.form.elements.question.disabled, false);
});

test('closing voice while permission is pending releases a late microphone without recording', async t => {
  const dom = new JSDOM('<button type="button" id="mic"></button>', { runScripts: 'outside-only' });
  const w = dom.window; t.after(() => w.close());
  let allow, stopped = 0;
  w.AudioContext = class { resume() { return Promise.resolve(); } close() { this.state = 'closed'; return Promise.resolve(); } };
  w.AudioWorkletNode = class { constructor() { assert.fail('Cancelled microphone started recording'); } };
  w.navigator.mediaDevices = { getUserMedia() { return new Promise(resolve => { allow = resolve; }); } };
  w.eval(controlsScript);
  const mic = w.document.querySelector('#mic');
  const voice = w.SdrCoachControls.voice(mic, () => assert.fail('Cancelled command submitted'), () => {}, () => true);
  mic.click(); voice.stop(); allow({ getTracks: () => [{ stop() { stopped++; } }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, 1); assert.equal(mic.getAttribute('aria-pressed'), 'false');
});
