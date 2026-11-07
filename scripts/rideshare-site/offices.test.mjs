import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import jsdom from 'jsdom';
import { loadOfficeLocations, officeMapURLs, renderOfficeMap, validateOfficeLocations } from './offices.mjs';

// Synthetic configuration stays in this test only, never in public office data.
const fixture = (id = 'synthetic-first', latitude = 41.5, longitude = -72.5) => ({
  id, name: `SYNTHETIC ${id}`, operatorName: 'SYNTHETIC independent operator', independentlyOwned: true, confirmed: true,
  address: { line1: 'Synthetic address for DOM proof only', city: 'Synthetic locality', region: 'Synthetic region', postalCode: '00000', country: 'Synthetic country' },
  latitude, longitude,
});
const script = readFileSync(new URL('../../public/rideshare-tax-pros/office-map.js', import.meta.url), 'utf8');
const { JSDOM, requestInterceptor } = jsdom;
function page(offices, javascript = true) {
  const requests = [];
  const dom = new JSDOM(`<!doctype html><html><body><main>${renderOfficeMap(offices)}</main></body></html>`, {
    url: 'https://gigtax.pro/', runScripts: 'outside-only',
    resources: { interceptors: [requestInterceptor(request => {
      if (new URL(request.url).hostname === 'www.openstreetmap.org') requests.push(request.url);
      return new Response('<!doctype html><p>Synthetic intercepted resource; no network.</p>', { headers: { 'Content-Type': 'text/html' } });
    })] },
  });
  if (javascript) {
    dom.window.eval(script);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  }
  return { dom, requests, document: dom.window.document };
}

test('public data is strict and an empty directory publishes no offices, iframe or fake map pins', () => {
  assert.deepEqual(loadOfficeLocations(), validateOfficeLocations(JSON.parse(readFileSync(new URL('../../public/rideshare-tax-pros/office-locations.json', import.meta.url)))));
  const { dom, document, requests } = page([]);
  try {
    assert.match(document.querySelector('.office-empty').textContent, /No office addresses are published yet/);
    assert.match(document.querySelector('[data-coverage-vision]').textContent, /Our goal:.*national brand recognition/s);
    assert.match(document.querySelector('[data-coverage-vision]').textContent, /Local service across the country/);
    assert.match(document.querySelector('figcaption').textContent, /does not show current service coverage or office locations/);
    assert.equal(document.querySelector('[data-coverage-vision] img').getAttribute('src'), '/assets/us-national-vision.svg');
    assert.equal(document.querySelectorAll('[data-office-id], iframe, [data-office-load]').length, 0);
    assert.equal(requests.length, 0);
  } finally { dom.window.close(); }
});

test('configured offices retain readable addresses, independent operators and safe external links with JavaScript disabled', () => {
  const first = fixture(), second = fixture('synthetic-second', 42, -73);
  const { dom, document, requests } = page([first, second], false);
  try {
    assert.equal(document.querySelectorAll('.office-card address').length, 2);
    assert.match(document.querySelector('.office-card').textContent, /Independently owned and operated by SYNTHETIC independent operator/);
    assert.equal(document.querySelector('[data-office-controls]').hidden, true);
    for (const address of document.querySelectorAll('.office-card address')) assert.match(address.textContent, /Synthetic address/);
    for (const link of document.querySelectorAll('.office-card a')) {
      const url = new URL(link.href); assert.equal(url.protocol, 'https:'); assert.equal(url.host, 'www.openstreetmap.org');
      assert.equal(link.rel, 'noopener noreferrer');
    }
    assert.equal(document.querySelectorAll('iframe').length, 0); assert.equal(requests.length, 0);
  } finally { dom.window.close(); }
});

test('selection updates the map link without network; explicit loading targets the selected numeric location', () => {
  const first = fixture(), second = fixture('synthetic-second', 42.123456, -73.654321);
  const { dom, document, requests } = page([first, second]);
  try {
    const select = document.querySelector('[data-office-select]'), load = document.querySelector('[data-office-load]');
    assert.equal(document.querySelector('[data-office-controls]').hidden, false);
    assert.equal(requests.length, 0); assert.equal(document.querySelectorAll('iframe').length, 0);
    select.value = second.id; select.dispatchEvent(new dom.window.Event('change'));
    assert.equal(document.querySelector('[data-office-map-link]').href, officeMapURLs(second.latitude, second.longitude).link);
    assert.equal(requests.length, 0);
    load.click();
    const frame = document.querySelector('iframe');
    assert.equal(frame.src, officeMapURLs(second.latitude, second.longitude).embed);
    assert.match(frame.title, /SYNTHETIC synthetic-second/);
    assert.equal(frame.referrerPolicy, 'strict-origin-when-cross-origin');
    assert.equal(frame.getAttribute('allow'), "geolocation 'none'");
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-same-origin');
    assert.deepEqual(requests, [frame.src]);
    assert.match(document.querySelector('[data-office-status]').textContent, /Map requested/);
    select.value = first.id; select.dispatchEvent(new dom.window.Event('change'));
    assert.equal(document.querySelector('iframe'), null); assert.equal(requests.length, 1);
    load.click(); assert.equal(document.querySelector('iframe').src, officeMapURLs(first.latitude, first.longitude).embed);
    assert.equal(requests.length, 2);
    document.querySelector('[data-office-hide]').click();
    assert.equal(document.querySelector('iframe'), null); assert.equal(requests.length, 2);
    assert.equal(document.activeElement, load);
  } finally { dom.window.close(); }
});

test('office text is escaped and invalid public config, URLs, duplicate IDs and coordinate types fail closed', () => {
  const text = fixture(); text.name = '<script>synthetic</script>'; text.operatorName = 'Synthetic "operator" <name>';
  const html = renderOfficeMap([text]);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>synthetic'));
  assert.ok(html.includes('&quot;operator&quot;'));
  const unnamed = fixture(); delete unnamed.operatorName;
  const unnamedHTML = renderOfficeMap([unnamed]);
  assert.ok(unnamedHTML.includes('Independently owned and operated</p>'));
  assert.ok(!unnamedHTML.includes('by undefined'));
  for (const mutation of [
    office => { office.confirmed = false; }, office => { office.independentlyOwned = false; },
    office => { office.latitude = '41.5'; }, office => { office.latitude = NaN; },
    office => { office.longitude = Infinity; }, office => { office.longitude = 181; },
    office => { office.id += '\n'; }, office => { office.embedURL = 'javascript:forbidden()'; },
    office => { office.address.url = 'https://private.invalid'; }, office => { office.operatorName = ''; },
  ]) {
    const office = fixture(); mutation(office); assert.throws(() => renderOfficeMap([office]));
  }
  assert.throws(() => validateOfficeLocations([fixture(), fixture()]));
  assert.throws(() => officeMapURLs('41.5', -72.5)); assert.throws(() => officeMapURLs(90, 0));
  const corner = new URL(officeMapURLs(85, 180).embed);
  assert.equal(corner.protocol, 'https:'); assert.equal(corner.host, 'www.openstreetmap.org');
  assert.ok(corner.searchParams.get('bbox').split(',').every(value => Number.isFinite(Number(value))));
});

test('invalid DOM coordinates cannot become an iframe URL and repeated initialization does not duplicate load handlers', () => {
  const { dom, document, requests } = page([fixture()]);
  try {
    document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    document.querySelector('[data-office-load]').click(); assert.equal(requests.length, 1);
    const card = document.querySelector('[data-office-id]'); card.dataset.officeLatitude = 'javascript:forbidden()';
    document.querySelector('[data-office-select]').dispatchEvent(new dom.window.Event('change'));
    assert.equal(document.querySelector('iframe'), null);
    assert.equal(document.querySelector('[data-office-load]').disabled, true);
    assert.match(document.querySelector('[data-office-status]').textContent, /coordinates need review/);
    document.querySelector('[data-office-load]').click(); assert.equal(requests.length, 1);
  } finally { dom.window.close(); }
});

test('national vision uses official geography for all50states plus DC and separate Alaska/Hawaii insets without fake markers', () => {
  const source = readFileSync(new URL('../../public/rideshare-tax-pros/assets/us-national-vision.svg', import.meta.url), 'utf8');
  const dom = new JSDOM(source, { contentType: 'image/svg+xml' });
  try {
    const { document } = dom.window;
    const expected = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ').sort();
    assert.deepEqual([...document.querySelectorAll('[data-state]')].map(path => path.getAttribute('data-state')).sort(), expected);
    assert.ok(document.querySelector('#alaska-inset [data-state="AK"]'));
    assert.ok(document.querySelector('#hawaii-inset [data-state="HI"]'));
    assert.equal(document.querySelectorAll('circle, ellipse[data-office-id], script, foreignObject').length, 0);
    const metadata = JSON.parse(document.querySelector('metadata').textContent);
    assert.equal(metadata.source, 'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_20m.zip');
    assert.equal(metadata.sourceSHA256, '7bc773d83c01b6df69b8aada9c2b5983d97f22f4551947cc5c00b87c663223ef');
    assert.match(metadata.meaning, /goal only/);
    for (const path of document.querySelectorAll('[data-state]')) {
      const numbers = path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
      assert.ok(numbers.length >= 8);
      assert.ok(numbers.every((value, index) => Number.isFinite(value) && value >= 0 && value <= (index % 2 ? 650 : 1000)));
    }
    assert.ok(source.includes('#a627f6') && source.includes('#f70ce8') && source.includes('#03060c'));
  } finally { dom.window.close(); }
});
