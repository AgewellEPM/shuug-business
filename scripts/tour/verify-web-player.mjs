import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Check the shipped interaction code without downloading a browser runtime.
function element(values = {}) {
  return { listeners: {}, attributes: {}, textContent: '', ...values,
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}
const buttons = [0, 30, 70].map((start, index) => element({ disabled: true, dataset: { seek: String(start), title: `Chapter ${index + 1}` } }));
let loads = 0, plays = 0, rejectPlay = false;
const video = element({ readyState: 0, duration: NaN, currentTime: 0,
  load() { loads++; }, play() { plays++; return rejectPlay ? Promise.reject(new Error('User gesture required')) : Promise.resolve(); },
});
const status = element(), title = element(), runtime = element();
const parts = { video, '.video-status': status, '.now-playing': title, '.runtime': runtime };
const root = { querySelector: name => parts[name], querySelectorAll: () => buttons };
vm.runInNewContext(readFileSync(new URL('../../public/rideshare-tax-pros/tour/player.js', import.meta.url), 'utf8'),
  { document: { querySelectorAll: () => [root] } });
assert.equal(plays, 0, 'Opening the page must not autoplay.');
assert.ok(buttons.every(button => !button.disabled));
buttons[2].listeners.click();
assert.equal(loads, 1); assert.equal(plays, 0);
video.duration = 100; video.readyState = 1; video.listeners.loadedmetadata();
assert.equal(video.currentTime, 70); assert.equal(plays, 1);
assert.equal(runtime.textContent, '1:40 · 3 chapters');
video.currentTime = 35; video.listeners.timeupdate();
assert.equal(title.textContent, 'Chapter 2');
assert.equal(buttons[1].attributes['aria-current'], 'true');
assert.equal(buttons[0].attributes['aria-current'], undefined);
rejectPlay = true; buttons[0].listeners.click(); await Promise.resolve();
assert.equal(video.currentTime, 0); assert.match(status.textContent, /Press play/);
video.listeners.error(); assert.match(status.textContent, /transcript/);
console.log('Web player: no autoplay, delayed chapter seeking, active chapter, playback rejection and media-error fallback pass.');
