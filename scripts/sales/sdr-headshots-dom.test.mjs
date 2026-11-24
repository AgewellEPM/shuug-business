import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../../public/rideshare-tax-pros/sdr-headshots.js', import.meta.url), 'utf8');
const smallJpeg = 'data:image/jpeg;base64,/9j/2Q==';

function workspace(t, { corrupt = false, outputs = [smallJpeg] } = {}) {
  const { window } = new JSDOM('', { runScripts: 'outside-only' });
  t.after(() => window.close());
  const sources = [], drawCalls = [], exports = [];
  window.Image = function Image() {
    const image = window.document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: 640 },
      naturalHeight: { value: 480 },
      src: { set(value) {
        sources.push(value);
        queueMicrotask(() => image.dispatchEvent(new window.Event(corrupt ? 'error' : 'load')));
      } },
    });
    return image;
  };
  window.HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    assert.equal(kind, '2d');
    assert.deepEqual([this.width, this.height], [112, 112]);
    return { fillRect() {}, drawImage(image, ...positions) { drawCalls.push(positions); } };
  };
  window.HTMLCanvasElement.prototype.toDataURL = function toDataURL(type, quality) {
    exports.push({ type, quality });
    return outputs[exports.length - 1];
  };
  window.eval(script);
  const file = new window.File(['fixture photo bytes'], 'headshot.png', { type: 'image/png' });
  return { file, encode: window.SdrHeadshots.encode, sources, drawCalls, exports };
}

test('headshots load through a FileReader data URL and return a bounded square JPEG', async t => {
  const fixture = workspace(t, {
    outputs: ['data:,', 'data:image/jpeg;base64,' + 'A'.repeat(13_000), smallJpeg],
  });
  assert.equal(await fixture.encode(fixture.file), smallJpeg);
  assert.deepEqual(fixture.sources, ['data:image/png;base64,' + Buffer.from('fixture photo bytes').toString('base64')]);
  assert.deepEqual(fixture.drawCalls, [[80, 0, 480, 480, 0, 0, 112, 112]]);
  assert.deepEqual(fixture.exports.map(({ type }) => type), ['image/jpeg', 'image/jpeg', 'image/jpeg']);
  assert.ok(fixture.exports.every(({ quality }, index, all) => index === 0 || quality < all[index - 1].quality));
});

test('a corrupt headshot gets instructions and is never sent to canvas', async t => {
  const fixture = workspace(t, { corrupt: true });
  await assert.rejects(fixture.encode(fixture.file), { message: 'Could not open this photo. Try a JPG, PNG, or WebP image.' });
  assert.equal(fixture.sources.length, 1);
  assert.deepEqual(fixture.drawCalls, []);
  assert.deepEqual(fixture.exports, []);
});
