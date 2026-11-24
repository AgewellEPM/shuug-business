import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync(new URL('../../public/rideshare-tax-pros/care-demo-responses.js', import.meta.url), 'utf8'), { window });
const { toneOf } = window.CareDemoResponses;

test('care reply colors follow the actual message, including negation and mixed answers', () => {
  const messages = {
    positive: ['Yes', 'I slept well, thanks.', 'That helps', 'No pain right now.'],
    negative: ['No thanks', 'I had a hard night, actually.', 'I couldn’t sleep', 'I’m still tired', 'That did not help.'],
    neutral: ['I slept on and off', 'I’m fine, just a bit tired.', 'How are you doing today?', 'I’m okay, just give me a moment.'],
  };
  for (const [tone, phrases] of Object.entries(messages)) {
    for (const spokenText of phrases) assert.equal(toneOf({ reply:true, emoji:'👍', spokenText }), tone, spokenText);
  }
  assert.equal(toneOf({ label:'A different size would suit me', tone:'positive' }), 'positive');
  assert.equal(toneOf({ label:'Back', action:'back', tone:'negative' }), '');
});

test('sleep answers and the three bedside requests keep distinct pictures', () => {
  vm.runInNewContext(readFileSync(new URL('../../public/rideshare-tax-pros/care-demo-pictures.js', import.meta.url), 'utf8'), { window });
  const { identify } = window.CareDemoPictures;
  const { offline } = JSON.parse(readFileSync(new URL('./care-replies.json', import.meta.url), 'utf8'));
  const sleep = offline.sets.sleep.map(words => identify({ label:words.slice(words.indexOf(' ') + 1), emoji:'👍' }));
  assert.deepEqual(sleep, ['rested','hard-night','interrupted-sleep','awake','early','tired']);
  assert.deepEqual(['Bathroom','Water','Help'].map(label => identify({label})), ['bathroom','water','help']);
});

test('Hospital Arrival and ER use distinct pictures for services and symptoms', () => {
  const { identify } = window.CareDemoPictures;
  const boards = JSON.parse(readFileSync(new URL('../../public/rideshare-tax-pros/care-facility-kiosks.json', import.meta.url), 'utf8'));
  for (const id of ['loc_hospital_arrive', 'loc_hospital_er']) {
    const pictures = boards[id].tiles.map(tile => identify(tile));
    assert.ok(pictures.every(Boolean), id);
    assert.equal(new Set(pictures).size, pictures.length, id);
  }
  assert.equal(identify({ label:'Back', action:'back' }), '⬅️');
  assert.equal(identify({ label:'Karaoke', emoji:'🎤' }), '🎤');
  assert.equal(identify({ label:'Other details', emoji:'💬' }), '');
});
