import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const source = readFileSync(new URL('../../public/rideshare-tax-pros/hero-parallax.js', import.meta.url), 'utf8');

function harness({ mobile = true, allowMotion = true, height = 300 } = {}) {
  const dom = new JSDOM('<div class="mobile-hero-frame" data-hero-parallax><svg class="mobile-hero-photo"></svg></div>', { runScripts: 'outside-only' });
  const w = dom.window;
  const frame = w.document.querySelector('[data-hero-parallax]');
  const queries = new Map();
  w.matchMedia = media => {
    if (!queries.has(media)) {
      const listeners = new Set();
      queries.set(media, {
        media, matches: media.includes('max-width') ? mobile : allowMotion,
        addEventListener: (_, listener) => listeners.add(listener),
        setMatches(value) { this.matches = value; listeners.forEach(listener => listener({ matches: value, media })); },
      });
    }
    return queries.get(media);
  };
  let top = 600;
  let geometryReads = 0;
  frame.getBoundingClientRect = () => { geometryReads += 1; return { top, height }; };
  Object.defineProperty(w, 'innerHeight', { value: 900 });
  const observers = [];
  w.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
    intersect(isIntersecting) { this.callback([...this.targets].map(target => ({ target, isIntersecting }))); }
  };
  w.ResizeObserver = class { observe() {} disconnect() {} };
  let requestId = 0;
  const callbacks = new Map();
  w.requestAnimationFrame = callback => { callbacks.set(++requestId, callback); return requestId; };
  w.cancelAnimationFrame = id => callbacks.delete(id);
  w.eval(source);
  return {
    dom, frame,
    intersect: value => observers.at(-1).intersect(value),
    scrollTo(value) { top = value; w.dispatchEvent(new w.Event('scroll')); },
    flush() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback()); },
    setMobile: value => queries.get('(max-width: 1023px)').setMatches(value),
    setMotion: value => queries.get('(prefers-reduced-motion: no-preference)').setMatches(value),
    get pending() { return callbacks.size; },
    get reads() { return geometryReads; },
    get offset() { return parseFloat(frame.style.getPropertyValue('--hero-shift')); },
  };
}

test('mobile scrolling updates the photo offset, coalesces events, and stays within its overscan budget', () => {
  for (const height of [300, 1000]) {
    const h = harness({ height });
    try {
      assert(h.frame.classList.contains('hero-parallax-active'));
      h.intersect(true);
      h.scrollTo(600);
      h.scrollTo(600);
      assert.equal(h.pending, 1, 'Scroll events should share one animation frame');
      h.flush();
      const initialOffset = h.offset;
      assert(initialOffset < 0);
      h.scrollTo(200); h.flush();
      assert(h.offset > initialOffset, 'Photo must respond to actual scroll position');
      const limit = Math.min(24, height * 0.045);
      for (const top of [-10000, 10000]) {
        h.scrollTo(top); h.flush();
        assert(Math.abs(h.offset) <= limit, 'Movement must remain inside the clipped photo overscan');
      }
    } finally { h.dom.window.close(); }
  }
});

test('reduced motion clears the effect and pending work, then permits re-enabling', () => {
  const h = harness();
  try {
    h.intersect(true); h.flush();
    assert(Number.isFinite(h.offset));
    h.scrollTo(200); assert.equal(h.pending, 1);
    h.setMotion(false);
    assert(!h.frame.classList.contains('hero-parallax-active'));
    assert.equal(h.frame.style.getPropertyValue('--hero-shift'), '');
    assert.equal(h.pending, 0);
    h.scrollTo(100); assert.equal(h.pending, 0);
    h.setMotion(true); h.intersect(true); h.flush();
    assert(h.frame.classList.contains('hero-parallax-active'));
    assert(Number.isFinite(h.offset));
  } finally { h.dom.window.close(); }
  const reduced = harness({ allowMotion: false });
  try {
    reduced.scrollTo(200); reduced.flush();
    assert(!reduced.frame.classList.contains('hero-parallax-active'));
    assert.equal(reduced.reads, 0);
  } finally { reduced.dom.window.close(); }
});

test('desktop stays static and resizing from mobile to desktop clears transforms', () => {
  const h = harness({ mobile: false });
  try {
    h.scrollTo(200); h.flush();
    assert(!h.frame.classList.contains('hero-parallax-active'));
    assert.equal(h.reads, 0);
    h.setMobile(true); h.intersect(true); h.flush();
    assert(Number.isFinite(h.offset));
    h.scrollTo(100); h.setMobile(false);
    assert(!h.frame.classList.contains('hero-parallax-active'));
    assert.equal(h.frame.style.getPropertyValue('--hero-shift'), '');
    assert.equal(h.pending, 0);
    h.scrollTo(0); assert.equal(h.pending, 0);
  } finally { h.dom.window.close(); }
});

test('offscreen frames schedule no scroll work and are skipped if they leave before a queued update', () => {
  const h = harness();
  try {
    h.scrollTo(200); assert.equal(h.pending, 0);
    assert.equal(h.reads, 0);
    h.intersect(true); h.flush();
    const reads = h.reads;
    h.scrollTo(100); assert.equal(h.pending, 1);
    h.intersect(false); h.flush();
    assert.equal(h.reads, reads, 'Offscreen frames must not force geometry reads');
    h.scrollTo(-500); assert.equal(h.pending, 0);
    assert.equal(h.reads, reads);
  } finally { h.dom.window.close(); }
});
