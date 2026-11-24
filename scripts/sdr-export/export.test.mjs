import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn, execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function run(root) {
  const port = await freePort();
  const origin = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['--import', './public-source-fixture.mjs', 'scripts/sdr-export/server.mjs'], {
    cwd: root, env: { PATH: process.env.PATH, SDR_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'exit');
    child.kill('SIGTERM');
    await closed;
  };
  try {
    for (let retry = 0; retry < 60; retry++) {
      if (child.exitCode !== null) throw new Error('Export server exited: ' + stderr);
      try {
        if ((await fetch(origin + '/sales')).ok) return { origin, stop };
      } catch {}
      await delay(50);
    }
    throw new Error('Export server did not start: ' + stderr);
  } catch (error) {
    await stop();
    throw error;
  }
}

function browserSession(origin) {
  let cookie = '';
  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('Origin', origin);
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(origin + path, { ...options, headers });
    const next = response.headers.get('set-cookie');
    if (next) cookie = next.split(';')[0];
    return response;
  }
  async function api(action, data = {}, expected = 200) {
    const response = await request('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
    const result = await response.json();
    assert.equal(response.status, expected, result.error);
    return result;
  }
  return { request, api };
}

async function mountConsole(t, origin, session, html, path = '/sales') {
  const dom = new JSDOM(html, { url: origin + path, runScripts: 'outside-only', beforeParse(window) {
    window.fetch = (path, options) => session.request(path, options);
  } });
  t.after(() => dom.window.close());
  const { window } = dom;
  for (const script of window.document.querySelectorAll('script[src]')) {
    const asset = await session.request(script.getAttribute('src'));
    assert.equal(asset.status, 200);
    window.eval(await asset.text());
  }
  return window;
}

async function waitFor(read, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await read();
    if (result) return result;
    await delay(20);
  }
  assert.fail(description);
}

test('exported workspace runs its real console, keeps projects isolated and persists an agreement workflow', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'universal-sdr-test-'));
  const root = join(directory, 'first');
  const second = join(directory, 'second');
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(server => server.stop()));
    rmSync(directory, { recursive: true, force: true });
  });
  for (const destination of [root, second]) execFileSync(process.execPath, ['scripts/sdr-export/export.mjs', destination]);
  assert.equal(existsSync(join(root, 'workspace-data')), false);
  for (const destination of [root, second]) writeFileSync(join(destination, 'public-source-fixture.mjs'), `
    const fetchNetwork = globalThis.fetch;
    globalThis.fetch = async (address, options) => {
      const url = new URL(address);
      if (url.hostname === 'data.cms.gov') {
        const state = url.searchParams.get('conditions[0][value]');
        if (state === 'AL') return Response.json({ count: 1, results: [{
          cms_certification_number_ccn: '015024', provider_name: 'Limestone Nursing and Rehabilitation Center',
          provider_address: '1600 WEST HOBBS STREET', citytown: 'ATHENS', state: 'AL', zip_code: '35611', telephone_number: '2562323461',
        }] });
        const cities = state === 'CT' ? ['BRIDGEPORT', ...Array(28).fill('HARTFORD')] : state === 'AK' ? ['ANCHORAGE'] : [];
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 30);
        const rows = cities.map((city, index) => ({ cms_certification_number_ccn: String(index + 1).padStart(6, '0'),
          provider_name: city + ' Example Home ' + (index + 1), provider_address: (index + 1) + ' EXAMPLE STREET',
          citytown: city, state, zip_code: city === 'ANCHORAGE' ? '99501' : '06106', telephone_number: '8605550100' }));
        return Response.json({ results: rows.slice(offset, offset + limit), count: rows.length, total: rows.length });
      }
      if (url.hostname === 'qlever.dev') {
        const query = url.searchParams.get('query') || '';
        const state = query.match(/"US-([A-Z]{2})"/)?.[1];
        const place = id => ({ type: 'uri', value: 'https://www.openstreetmap.org/way/' + id });
        const literal = value => ({ type: 'literal', value });
        const facility = (id, city) => ({ place: place(id), name: literal(city + ' Example Senior Center'), city: literal(city),
          houseNumber: literal('80'), street: literal('Example Street') });
        let bindings = [];
        if (state === 'CT') bindings = [facility('45', 'Hartford'), { place: place('54'), name: literal('Second Example Senior Center') },
          { place: place('55'), name: literal('Third Example Senior Center') }];
        else if (state === 'AK') bindings = [facility('46', 'Anchorage')];
        else if (query.includes('VALUES ?place')) bindings = [{ place: place('54'), city: literal('Hartford') },
          { place: place('55'), city: literal('Hartford') }, { place: place('55'), city: literal('West Hartford') }];
        return Response.json({ results: { bindings } });
      }
      if (url.hostname === 'photon.komoot.io') return Response.json({ features: [
        { properties: { name: 'Example Senior Center', city: 'Portland', state: 'Maine', postcode: '04101', countrycode: 'US', osm_type: 'W', osm_id: 42, osm_key: 'amenity', osm_value: 'community_centre', housenumber: '30', street: 'Example St' } },
        { properties: { name: 'Wrong State Senior Center', city: 'Portland', state: 'Oregon', postcode: '12345', countrycode: 'US', osm_type: 'W', osm_id: 43, osm_key: 'amenity', osm_value: 'community_centre' } }
      ] });
      return fetchNetwork(address, options);
    };
  `);
  const office = { name: 'Sample Solar Partner', city: 'Hartford', state: 'CT', address: '10 Example St', postalCode: '06103', source: 'https://example.test/partners', contact: 'Example Owner', email: 'owner@example.test' };
  const directoryLead = { name: 'Example Carpentry', city: 'Portland', state: 'ME', address: '20 Example St', postalCode: '04101',
    source: 'https://example.test/directory', contact: 'Example Contact', email: 'hello@example.test' };
  writeFileSync(join(root, 'workspace.json'), JSON.stringify({ name: 'Solar Partners SDR', directory: 'project', contracts: 'agreement', focus: 'senior-care' }));
  writeFileSync(join(root, 'business-directory.json'), JSON.stringify([office, directoryLead]));

  const first = await run(root);
  servers.push(first);
  const other = await run(second);
  servers.push(other);
  const code = readFileSync(join(root, 'workspace-data', 'owner-code'), 'utf8').trim();
  const otherCode = readFileSync(join(second, 'workspace-data', 'owner-code'), 'utf8').trim();
  assert.notEqual(code, otherCode);
  const owner = browserSession(first.origin);
  const differentProject = browserSession(other.origin);
  await owner.api('sales-team-read', {}, 401);
  await owner.api('territory-map', { state: 'CT' }, 401);
  await owner.api('territory-facilities', { state: 'CT', category: 'nursing-home' }, 401);
  await differentProject.api('login', { code, email: 'agent@example.test' }, 401);
  await differentProject.api('login', { code: otherCode });
  assert.deepEqual((await differentProject.api('bootstrap')).offices, []);
  assert.deepEqual((await differentProject.api('campaign-read')).campaigns, []);
  assert.deepEqual((await differentProject.api('sales-team-read')).members.map(member => member.id), ['owner']);
  assert.equal((await fetch(first.origin + '/workspace-data/owner-code')).status, 404);
  assert.equal((await differentProject.request('/sales/senior-care')).status, 404);
  assert.equal((await fetch(first.origin + '/business-directory.json')).status, 404);
  assert.equal((await fetch(first.origin + '/api/sales', { method: 'POST', headers: { Origin: 'https://other.example.test', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);

  const response = await owner.request('/sales');
  const html = await response.text();
  assert.ok(html.includes('Solar Partners SDR'));
  assert.ok(!html.includes('portal.gigtax.pro'));
  const window = await mountConsole(t, first.origin, owner, html);
  assert.equal(window.document.querySelector('#sales-workspace').hidden, true);
  const login = window.document.querySelector('#sales-login-form');
  login.elements.code.value = code;
  login.dispatchEvent(new window.Event('submit', { cancelable: true }));
  for (let retry = 0; retry < 100 && window.document.querySelector('#sales-workspace').hidden; retry++) await delay(20);
  assert.equal(window.document.querySelector('#sales-workspace').hidden, false);
  assert.equal(window.document.querySelector('[data-tab=team]').hidden, false);
  const ctDirectory = await owner.api('territory-facilities', { state: 'CT', category: 'nursing-home' });
  assert.equal(ctDirectory.total, 29);
  assert.equal(ctDirectory.results.length, 25);
  assert.equal(ctDirectory.hasMore, true);
  assert.ok(ctDirectory.results.every(record => record.state === 'CT' && record.sourceName === 'CMS Care Compare'));
  const secondPage = await owner.api('territory-facilities', { state: 'CT', category: 'nursing-home', offset: 25 });
  assert.equal(secondPage.results.length, 4);
  assert.equal(secondPage.hasMore, false);
  assert.ok(secondPage.results.every(record => !ctDirectory.results.some(prior => prior.sourceURL === record.sourceURL)));
  const anchorages = await owner.api('territory-facilities', { state: 'AK', category: 'nursing-home', query: 'Anchorage' });
  assert.deepEqual(anchorages.results.map(record => record.state), ['AK']);
  await owner.api('territory-facilities', { state: 'CT', category: 'other' }, 400);
  await owner.api('territory-facilities', { state: 'CT', category: 'nursing-home', offset: -1 }, 400);
  const pageDocument = window.document;
  pageDocument.querySelector('[data-tab="territories"]').click();
  pageDocument.querySelector('[data-territory-state="AK"]').click();
  const territoriesPanel = pageDocument.querySelector('[data-tab-panel="territories"]');
  assert.equal(pageDocument.querySelector('#sales-territory-facilities'), null);
  assert.equal(territoriesPanel.querySelector('#sales-territory-cities'), null);
  assert.ok(territoriesPanel.querySelector('[data-territory-lookup]'));
  const townPanel = pageDocument.getElementById('territory-town-map');
  const stateShape = code => pageDocument.querySelector(`#sales-territory-map path[data-state="${code}"]`);
  const statePicker = pageDocument.getElementById('sales-territory-cards');
  const townCanvas = townPanel.querySelector('[data-map-canvas]');
  // JSDOM has no layout. Give Leaflet the dimensions of a workspace map.
  Object.defineProperties(townCanvas, { clientWidth: { value: 800 }, clientHeight: { value: 480 },
    offsetWidth: { value: 800 }, offsetHeight: { value: 480 } });
  townCanvas.getBoundingClientRect = () => ({left:0, top:0, right:800, bottom:480, width:800, height:480});
  townPanel.querySelector('[data-map-back]').click();
  assert.equal(statePicker.hidden, false);
  stateShape('NC').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  stateShape('CT').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(() => townCanvas.querySelectorAll('.town-map-area').length === 169, 'CT town polygons did not open');
  assert.equal(townPanel.hidden, false);
  assert.equal(pageDocument.activeElement.id, 'town-map-title');
  assert.equal(stateShape('CT').closest('.sdr-card').hidden, true);
  assert.equal(statePicker.hidden, true);
  assert.equal(townPanel.querySelector('h2').textContent, 'Connecticut towns and cities');
  assert.ok(townCanvas.querySelector('.town-map-label'));
  const colors = townPanel.querySelector('[data-map-colors]');
  assert.equal(colors.checked, true);
  assert.equal(townCanvas.querySelectorAll('.town-map-county').length, 9);
  const townSelect = townPanel.querySelector('[data-map-town]');
  const hartford = [...townSelect.options].find(option => option.text === 'Hartford');
  assert.equal(townSelect.options.length, 170);
  const hartfordPath = townCanvas.querySelector(`path[data-locality="${hartford.value}"]`);
  const drawing = hartfordPath.closest('svg'), stateWidth = parseFloat(drawing.style.width);
  hartfordPath.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(townSelect.value, hartford.value);
  assert.equal(hartfordPath.classList.contains('is-selected'), true);
  const zoomedWidth = parseFloat(drawing.style.width);
  assert.ok(zoomedWidth > stateWidth);
  colors.click();
  assert.ok(townPanel.classList.contains('map-grayscale'));
  assert.equal(window.localStorage.getItem('sdr.territoryMap.colors'), 'off');
  assert.equal(parseFloat(drawing.style.width), zoomedWidth);
  assert.equal(townSelect.value, hartford.value);
  townPanel.querySelector('[data-map-reset]').click();
  assert.equal(parseFloat(drawing.style.width), stateWidth);
  assert.equal(townSelect.value, '');
  const newHaven = [...townSelect.options].find(option => option.text === 'New Haven');
  townSelect.value = newHaven.value;
  townSelect.dispatchEvent(new window.Event('change'));
  assert.equal(townCanvas.querySelector('.is-selected').dataset.locality, newHaven.value);
  townPanel.querySelector('[data-map-back]').click();
  assert.equal(townPanel.hidden, true);
  assert.equal(stateShape('CT').closest('.sdr-card').hidden, false);
  assert.equal(pageDocument.activeElement, stateShape('CT'));
  stateShape('NC').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => townCanvas.querySelector('.town-map-area'), 'NC town polygons did not open');
  assert.ok([...townSelect.options].some(option => option.text === 'Raleigh' || option.text.startsWith('Raleigh ')));
  assert.equal(townPanel.querySelector('h2').textContent, 'North Carolina towns and cities');
  townPanel.querySelector('[data-map-back]').click();
  stateShape('SC').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => townCanvas.querySelectorAll('.town-map-county').length === 46, 'SC counties did not open');
  assert.equal(colors.checked, false);
  const atlas = townCanvas.querySelector('svg[data-detail]');
  assert.equal(atlas.dataset.detail, 'counties');
  assert.ok(atlas.querySelector('.town-map-capital[data-landmark="Columbia"]'));
  assert.ok(atlas.querySelector('.label-county'));
  assert.equal(townPanel.querySelectorAll('[data-county-row]').length, 46);
  const wheel = deltaY => townCanvas.dispatchEvent(new window.WheelEvent('wheel', {deltaY, clientX:400, clientY:240, bubbles:true, cancelable:true}));
  wheel(-90);
  await waitFor(() => townCanvas.dataset.layer === 'towns', 'Scrolling in did not remove county fills');
  assert.equal(atlas.querySelector('.town-map-county').parentElement.getAttribute('display'), 'none');
  wheel(90);
  await waitFor(() => townCanvas.dataset.layer === 'counties', 'Scrolling out did not restore counties');
  const mapSelection = townPanel.querySelector('[data-map-selection]');
  assert.equal(mapSelection.hidden, true);
  assert.equal(mapSelection.previousElementSibling.className, 'town-map-layout');
  const clarendon = atlas.querySelector('path[data-county="45027"]');
  clarendon.dispatchEvent(new window.MouseEvent('click', {bubbles:true}));
  assert.equal(mapSelection.hidden, false);
  assert.match(mapSelection.textContent, /Clarendon County/);
  await waitFor(() => /No sales rep currently assigned/.test(mapSelection.textContent), 'The county’s unassigned status did not load');
  assert.equal(clarendon.parentElement.getAttribute('display'), 'none');
  assert.equal(atlas.querySelector('.town-map-districts').getAttribute('display'), 'inline');
  assert.equal(atlas.querySelectorAll('.town-map-district[data-district^="45027"]').length, 7);
  assert.equal(atlas.querySelector('.label-county'), null);
  const leadForm = townPanel.querySelector('.county-lead-form');
  leadForm.elements.name.value = 'Example County Lead';
  leadForm.requestSubmit();
  await waitFor(() => townPanel.querySelector('[data-county-row="45027"]').textContent.includes('Example County Lead'), 'County roster did not update');
  const portrait = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCoBqK//9k=';
  const change = {state:'SC', county:'45027', name:'Example County Lead', photo:portrait, revision:1};
  await owner.api('set-county-lead', change);
  await owner.api('set-county-lead', change, 409);
  await owner.api('set-county-lead', {...change, county:'09001'}, 400);
  townPanel.querySelector('[data-map-reset]').click();
  const territoryLookup = townPanel.querySelector('[data-territory-lookup]');
  territoryLookup.value = 'Manning';
  territoryLookup.dispatchEvent(new window.Event('input', { bubbles: true }));
  const manningResult = await waitFor(() => [...townPanel.querySelectorAll('[data-territory-matches] li')]
    .find(row => row.querySelector('button strong')?.textContent === 'Manning' && /Assigned to Example County Lead/.test(row.textContent)),
  'Manning lookup did not show the assigned Clarendon County lead');
  assert.match(manningResult.textContent, /Clarendon County/);
  manningResult.querySelector('button').click();
  assert.equal(townSelect.value, '4544350');
  assert.equal(townCanvas.dataset.layer, 'towns');
  assert.equal(mapSelection.hidden, false);
  assert.match(mapSelection.textContent, /Manning/);
  await waitFor(() => /Clarendon County.*Example County Lead/.test(mapSelection.textContent), 'The town’s assigned rep did not load');
  townPanel.querySelector('[data-map-streets]').click();
  assert.equal(townCanvas.dataset.layer, 'streets');
  const tile = townCanvas.querySelector('img.leaflet-tile');
  assert.match(tile.src, /^https:\/\/tile\.openstreetmap\.org\/16\//);
  townCanvas.dispatchEvent(new window.MouseEvent('click', {clientX:400, clientY:240, bubbles:true}));
  assert.match(mapSelection.textContent, /Checking sales rep/);
  await waitFor(() => {
    const selection = townPanel.querySelector('[data-map-selection]');
    return /Manning.*Clarendon County.*Example County Lead/.test(selection.textContent);
  }, 'A street-map click did not show the matching county assignment');
  const [, , tx, ty] = new URL(tile.src).pathname.split('/');
  assert.ok(Math.abs(Number(tx)-18188) < 150 && Math.abs(parseInt(ty)-26250) < 240, 'street tiles are in South Carolina');
  assert.ok(townCanvas.querySelector('a[href="https://www.openstreetmap.org/copyright"]'));
  for (let z = 17; z <= 19; z++) townCanvas.querySelector('.leaflet-control-zoom-in').click();
  assert.ok(townCanvas.querySelector('img.leaflet-tile[src*="/19/"]'));
  townPanel.querySelector('[data-map-reset]').click();
  assert.equal(townCanvas.dataset.layer, 'counties');
  assert.equal(clarendon.parentElement.getAttribute('display'), 'inline');
  assert.equal(mapSelection.hidden, true);
  const richland = atlas.querySelector('path[data-county="45079"]');
  assert.ok(richland.getAttribute('class').includes('county-'));
  richland.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(atlas.dataset.detail, 'towns');
  assert.ok(atlas.querySelector('text[data-locality]'), 'county zoom adds local town names');
  colors.click();
  assert.equal(townPanel.classList.contains('map-grayscale'), false);
  assert.equal(window.localStorage.getItem('sdr.territoryMap.colors'), 'on');
  townPanel.querySelector('[data-map-back]').click();
  window.location.hash = 'view=territories&state=CT';
  await waitFor(() => townCanvas.querySelectorAll('.town-map-area').length === 169, 'CT state link did not open');
  const ctSenior = await owner.api('territory-facilities', { state: 'CT', category: 'senior-center' });
  assert.deepEqual(ctSenior.results.map(record => record.city), ['', 'Hartford', 'Hartford']);
  assert.equal(ctSenior.sources[0].url, 'https://www.openstreetmap.org/copyright');
  pageDocument.querySelector('[data-tab="home"]').click();
  assert.equal((await owner.request('/sales-welcome.webp')).headers.get('content-type'), 'image/webp');
  assert.equal(window.document.querySelector('#sdr-xp-level').textContent, 'Level 1');
  const researchForm = window.document.querySelector('#sdr-category-form');
  assert.equal(researchForm.elements.state.options.length, 51);
  for (const [key, value] of Object.entries({ type: 'senior centers', locality: 'Portland', state: 'ME' })) researchForm.elements[key].value = value;
  researchForm.requestSubmit();
  const businessResults = window.document.querySelector('#sdr-category-results');
  for (let retry = 0; retry < 100 && !businessResults.querySelector('article'); retry++) await delay(20);
  assert.equal(businessResults.querySelectorAll('article').length, 1);
  assert.match(businessResults.textContent, /Example Senior Center/);
  businessResults.querySelector('button').click();
  for (let retry = 0; retry < 100 && window.document.querySelector('#sdr-xp-bar').value === 0; retry++) await delay(20);
  assert.equal(window.document.querySelector('#sdr-xp-bar').value, 10);
  const earnings = window.document.querySelector('#sdr-earnings-form');
  earnings.elements.label.value = 'Example payment';
  earnings.elements.amount.value = '125.50';
  earnings.requestSubmit();
  for (let retry = 0; retry < 100 && window.document.querySelector('#sdr-earning-amount').textContent === '$0.00'; retry++) await delay(20);
  assert.equal(window.document.querySelector('#sdr-earning-amount').textContent, '$125.50');
  assert.equal((await differentProject.api('bootstrap')).earnings.totalCents, 0);
  window.document.querySelector('[data-tab=campaigns]').click();
  assert.equal(window.document.querySelector('[data-tab-panel=campaigns]').hidden, false);
  const campaignForm = window.document.querySelector('#sales-campaign-form');
  for (const [key, value] of Object.entries({ campaignName: 'Carpentry outreach', business: 'Example Services',
    offer: 'We provide appointment scheduling tools.', nextStep: 'Reply if your team would like a demo.',
    keywords: 'carpentry', city: 'Portland', state: 'ME', source: 'directory', mode: 'draft' })) {
    campaignForm.elements.namedItem(key).value = value;
  }
  campaignForm.requestSubmit();
  const runCampaign = window.document.querySelector('#sales-run-campaign');
  for (let retry = 0; retry < 100 && runCampaign.disabled; retry++) await delay(20);
  assert.equal(runCampaign.disabled, false);
  runCampaign.click();
  const campaignResults = window.document.querySelector('#sales-campaign-results');
  for (let retry = 0; retry < 100 && !campaignResults.querySelector('article'); retry++) await delay(20);
  assert.ok(campaignResults.textContent.includes(directoryLead.name));
  assert.ok(campaignResults.textContent.includes('appointment scheduling tools'));
  window.document.querySelector('[data-tab=prospects]').click();
  assert.equal(window.document.querySelector('[data-tab-panel=prospects]').hidden, false);
  const search = window.document.querySelector('#sales-linkedin-search');
  const searches = [];
  window.open = (href, target, features) => searches.push({ url: new URL(href), target, features });
  search.elements.keywords.value = '   ';
  search.requestSubmit(search.querySelector('[value=people]'));
  assert.equal(searches.length, 0);
  search.elements.keywords.value = '  Sales & partnerships + Hartford  ';
  search.elements.keywords.dispatchEvent(new window.Event('input'));
  for (const kind of ['people', 'companies']) {
    search.requestSubmit(search.querySelector(`[value=${kind}]`));
    const { url, target, features } = searches.pop();
    assert.equal(url.origin, 'https://www.linkedin.com');
    assert.equal(url.pathname, `/search/results/${kind}/`);
    assert.equal(url.searchParams.get('keywords'), 'Sales & partnerships + Hartford');
    assert.equal(target, '_blank');
    assert.equal(features, 'noopener,noreferrer');
  }

  const fixtureProspect = { name: 'Renée Example', title: 'Sales Manager', company: 'Example Solar',
    locality: 'Hartford', note: 'Ask about the program', sourceURL: 'https://uk.linkedin.com/in/renee-example/?trk=fixture#details' };
  window.location.hash = new URLSearchParams({ view: 'prospects', profile: fixtureProspect.sourceURL, name: fixtureProspect.name }).toString();
  const editor = window.document.querySelector('#sales-prospect-editor');
  for (let retry = 0; retry < 50 && editor.hidden; retry++) await delay(20);
  const prospectForm = window.document.querySelector('#sales-save-prospect');
  assert.equal(editor.hidden, false);
  assert.equal(prospectForm.elements.sourceURL.value, fixtureProspect.sourceURL);
  assert.equal(prospectForm.elements.namedItem('name').value, fixtureProspect.name);
  assert.equal(window.location.hash, '#view=prospects');
  for (const [key, value] of Object.entries(fixtureProspect)) prospectForm.elements.namedItem(key).value = value;
  prospectForm.requestSubmit();
  const prospectCards = window.document.querySelector('#sales-prospect-results');
  for (let retry = 0; retry < 100 && !prospectCards.querySelector('article'); retry++) await delay(20);
  const places = [...prospectCards.querySelectorAll('a')].map(a => new URL(a.href));
  assert.equal(places[0].href, 'https://www.linkedin.com/in/renee-example');
  assert.equal(places[1].origin, 'https://www.google.com');
  assert.equal(places[1].searchParams.get('q'), 'Renée Example Example Solar Sales Manager Hartford -site:linkedin.com');
  const localFilter = window.document.querySelector('#sales-filter-prospects');
  localFilter.elements.query.value = 'renee program';
  localFilter.requestSubmit();
  const localRecord = (await owner.api('list-prospects', { query: 'renee program' })).records[0];
  assert.equal(localRecord.name, fixtureProspect.name);
  assert.equal((await owner.api('save-prospect', { ...fixtureProspect, sourceURL: 'https://www.linkedin.com/in/Renee-Example/' })).existing, true);
  await owner.api('save-prospect', { ...fixtureProspect, sourceURL: 'https://linkedin.com.example.test/in/renee-example' }, 400);
  await owner.api('update-prospect', { id: localRecord.id, expectedRevision: 'stale', archived: true }, 409);

  await t.test('Prospects displays and updates real business records and keeps LinkedIn capture', async () => {
    const panel = pageDocument.querySelector('.sdr-prospects');
    const find = selector => panel.querySelector(selector);
    assert.equal((await owner.request('/sales-prospects.css')).status, 200);
    assert.equal((await owner.request('/sales-prospects-community.webp')).headers.get('content-type'), 'image/webp');
    assert.equal(find('#sales-linkedin-prospects').open, true);
    find('[data-prospect-add]').click();
    const form = find('#sales-business-prospect-form');
    for (const [field, value] of Object.entries({
      name: 'Example Care Prospect', address: '72 Example St', city: 'Portland', state: 'ME',
      facilityType: 'nursing-home', contact: 'Example Administrator', email: 'care@example.test',
    })) form.elements.namedItem(field).value = value;
    form.requestSubmit();
    const row = await waitFor(() => [...panel.querySelectorAll('[data-prospect-select]')]
      .find(button => button.textContent.includes('Example Care Prospect')), 'Created business did not appear in Prospects');
    const id = row.dataset.prospectSelect;
    assert.equal(JSON.parse((await owner.api('office', { id })).office.notes).facilityType, 'nursing-home');
    assert.match(find('[data-prospect-detail]').textContent, /Example Care Prospect/);
    assert.match(find('[data-prospect-detail]').textContent, /Example Administrator/);

    const stage = find('[data-prospect-status]');
    stage.value = 'contacted';
    stage.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitFor(() => find('[data-prospect-action-status]')?.textContent === 'Status updated.', 'Status was not confirmed');
    assert.equal((await owner.api('office', { id })).office.status, 'contacted');

    const statusButton = status => find(`.prospects-status-button[data-stage="${status}"]`);
    const visibleRow = () => find(`[data-prospect-pane="list"] [data-prospect-select="${id}"]`);
    statusButton('new').click();
    assert.equal(statusButton('new').querySelector('input').checked, true);
    assert.equal(visibleRow(), null);
    statusButton('contacted').click();
    assert.equal(statusButton('contacted').querySelector('input').checked, true);
    assert.ok(visibleRow());
    find('[data-prospect-clear]').click();
    assert.equal(statusButton('contacted').querySelector('input').checked, false);
    visibleRow().click();

    find('[data-prospect-action="followup"]').click();
    const followup = find('[data-prospect-action-form] form');
    followup.elements.nextFollowup.value = '2026-11-24';
    followup.requestSubmit();
    await waitFor(() => find('[data-prospect-action-status]')?.textContent === 'Follow-up scheduled.', 'Follow-up was not confirmed');
    assert.equal((await owner.api('office', { id })).office.meeting_date, '2026-11-24');

    find('[data-prospect-action="call"]').click();
    const call = find('[data-prospect-action-form] form');
    call.elements.note.value = 'Fixture call discussed an introduction.';
    call.requestSubmit();
    await waitFor(() => find('[data-prospect-note]')?.textContent.includes('Fixture call'), 'Logged call was not projected into notes');
    assert.equal((await owner.api('office', { id })).pipeline.lastContact.channel, 'call');

    find('[data-prospect-view="map"]').click();
    assert.match(find('[data-prospect-region="ME"]').textContent, /Maine/);
    find('[data-prospect-region="ME"]').click();
    assert.equal(find('#sales-business-prospect-filter').elements.state.value, 'ME');
    assert.equal(find('[data-prospect-pane="list"]').hidden, false);
    find('[data-prospect-view="pipeline"]').click();
    assert.match(find('[data-prospect-pane="pipeline"]').textContent, /In conversation/);
    assert.match(find('[data-prospect-pane="pipeline"]').textContent, /Example Care Prospect/);
    find('[data-prospect-save-filter]').click();
    assert.match(find('[data-prospect-filter-status]').textContent, /saved/);
    find('[data-prospect-clear]').click();
    assert.equal(find('#sales-business-prospect-filter').elements.state.value, '');
    find('[data-prospect-view="list"]').click();
    find('[data-prospect-action="email"]').click();
    await waitFor(() => pageDocument.querySelector('#sales-detail .sales-compose-form'),
      'Draft email did not open the existing reviewable composer');
    pageDocument.querySelector('#sales-detail-close').click();
  });

  await t.test('selecting a facility type and state loads sourced prospects before saving', async () => {
    const panel = pageDocument.querySelector('.sdr-prospects');
    const find = selector => panel.querySelector(selector);
    const filter = find('#sales-business-prospect-filter');
    const status = find('[data-prospect-directory-status]');
    const listing = find('[data-prospect-directory-results]');
    const before = (await owner.api('bootstrap')).offices.length;
    function choose(field, value) {
      filter.elements[field].value = value;
      filter.elements[field].dispatchEvent(new window.Event('change', { bubbles: true }));
    }
    find('[data-prospect-clear]').click();
    choose('type', 'nursing-home');
    assert.equal(find('[data-prospect-directory]').hidden, true);
    choose('state', 'CT');
    await waitFor(() => status.textContent.includes('Showing 1–25 of 29 for Connecticut'), 'Connecticut did not auto-populate');
    assert.match(listing.textContent, /Bridgeport Example Home/i);
    assert.match(listing.querySelector('a').href, /^https:\/\/data\.cms\.gov\//);
    assert.equal((await owner.api('bootstrap')).offices.length, before);
    find('[data-prospect-directory-next]').click();
    await waitFor(() => status.textContent.includes('Showing 26–29'), 'Directory next page did not load');
    filter.elements.query.value = 'Bridgeport';
    filter.elements.query.dispatchEvent(new window.Event('input', { bubbles: true }));
    await waitFor(() => listing.rows.length === 1 && listing.textContent.includes('BRIDGEPORT'), 'Search did not filter the Connecticut directory');
    listing.querySelector('form').requestSubmit();
    await waitFor(() => listing.querySelector('[data-open-facility]'), 'Directory row did not become a saved prospect');
    const office = (await owner.api('bootstrap')).offices.find(row => /bridgeport example home/i.test(row.town));
    assert.ok(office);
    assert.equal(JSON.parse(office.notes).facilityType, 'nursing-home');
    assert.equal((await owner.api('bootstrap')).offices.length, before + 1);

    filter.elements.query.value = '';
    choose('type', 'senior-center');
    await waitFor(() => listing.textContent.includes('Hartford Example Senior Center'), 'Senior centers did not replace the nursing-home list');
    assert.ok(!listing.textContent.includes('BRIDGEPORT'));
    find('[data-prospect-clear]').click();
    window.location.hash = '#view=prospects&type=nursing-home&state=AK';
    await waitFor(() => listing.textContent.includes('ANCHORAGE Example Home'), 'Prospects link did not load the chosen state');
    assert.match(status.textContent, /Alaska/);
    assert.match(listing.textContent, /Administrator not sourced/);
    assert.ok(listing.querySelector('a[href^="https://www.linkedin.com/search/"]'));

    choose('state', 'AL');
    await waitFor(() => listing.textContent.includes('Sherry Bowling'), 'Published administrator did not populate');
    const administrator = listing.querySelector('.prospects-administrator');
    assert.match(administrator.querySelector('img').alt, /Sherry Bowling/);
    assert.match(administrator.querySelector('img').src, /^https:\/\/static\.wixstatic\.com\//);
    assert.match(administrator.textContent, /sbowling@limestonehf\.com/);
    assert.equal(administrator.querySelector('a[title]').href, 'https://www.limestonehf.com/meet-our-team');
    listing.querySelector('form').requestSubmit();
    await waitFor(() => listing.querySelector('[data-open-facility]'), 'Administrator facility was not saved');
    const limestone = (await owner.api('bootstrap')).offices.find(row => /limestone/i.test(row.town));
    assert.equal(JSON.parse(limestone.notes).facilityAdministrator.name, 'Sherry Bowling');
    find('[data-prospect-clear]').click();
  });

  const agentEmail = 'agent@example.test';
  const { agent, code: accessCode } = await owner.api('create-agent', { name: 'Example Agent', email: agentEmail, states: ['CT'] });
  const legacyStore = new DatabaseSync(join(root, 'workspace-data', 'workspace.sqlite'));
  try {
    const { data } = legacyStore.prepare("SELECT data FROM records WHERE kind = 'agents' AND id = ?").get(Number(agent.id));
    const { notes, ...row } = JSON.parse(data);
    const { parentId, ...legacyNotes } = JSON.parse(notes);
    assert.equal(parentId, 'owner');
    legacyStore.prepare("UPDATE records SET data = ? WHERE kind = 'agents' AND id = ?")
      .run(JSON.stringify({ ...row, notes: JSON.stringify(legacyNotes) }), Number(agent.id));
  } finally { legacyStore.close(); }
  const agentSession = browserSession(first.origin);
  await agentSession.api('login', { email: agentEmail, code: accessCode });
  await agentSession.api('create-agent', { name: 'Denied', email: 'denied@example.test', states: [] }, 403);
  await agentSession.api('record-earnings', {}, 403);
  await agentSession.api('business-research', { type: 'senior center', locality: 'Portland', state: 'ME' }, 403);
  assert.equal((await agentSession.api('business-research-last')).research, null);
  assert.deepEqual((await agentSession.api('list-prospects')).records, []);
  await agentSession.api('update-prospect', { id: localRecord.id, expectedRevision: localRecord.revision, archived: true }, 404);
  const agentCompany = { name: 'Example Solar', sourceURL: 'https://www.linkedin.com/company/example-solar/about/' };
  const company = (await agentSession.api('save-prospect', agentCompany)).record;
  assert.equal(company.type, 'company');
  assert.equal(company.sourceURL, 'https://www.linkedin.com/company/example-solar');
  assert.equal((await owner.api('list-prospects')).total, 2);
  const archived = (await agentSession.api('update-prospect', { id: company.id, expectedRevision: company.revision, archived: true })).record;
  assert.deepEqual((await agentSession.api('list-prospects')).records, []);
  assert.equal((await agentSession.api('list-prospects', { archived: true })).records[0].id, archived.id);
  await agentSession.api('search-local', { city: 'Boston', state: 'MA' }, 403);
  assert.ok((await agentSession.api('territory-localities', { state: 'CT', query: 'Hartford' })).results.length > 0);

  const revision = async () => (await owner.api('bootstrap')).agents.find(member => member.id === agent.id).territoryRevision;
  const assignTown = async town => owner.api('set-agent-territory', { id: agent.id, state: 'CT', mode: 'selected',
    cityKeys: [town], expectedRevision: await revision() });
  pageDocument.querySelector('#sales-refresh').click();
  pageDocument.querySelector('[data-tab="team"]').click();
  const townAccessState = pageDocument.querySelector('#sales-town-access-state');
  const townAccess = townAccessState.closest('details');
  assert.equal(townAccess.hidden, false);
  townAccess.querySelector('summary').click();
  townAccessState.value = 'CT';
  townAccessState.dispatchEvent(new window.Event('change', { bubbles: true }));
  await waitFor(() => townAccess.querySelector('[data-territory-town][value="hartford"]'), 'Town access editor did not load Connecticut');
  const salesperson = await waitFor(() => {
    const field = townAccess.querySelector('[data-territory-agent]');
    return [...(field?.options || [])].some(option => option.value === String(agent.id)) && field;
  }, 'New rep missing from the town access editor');
  salesperson.value = String(agent.id);
  salesperson.dispatchEvent(new window.Event('change', { bubbles: true }));
  const coverage = townAccess.querySelector('[data-territory-mode]');
  coverage.value = 'selected';
  coverage.dispatchEvent(new window.Event('change', { bubbles: true }));
  townAccess.querySelector('[data-territory-town][value="hartford"]').click();
  townAccess.querySelector('[data-territory-save]').click();
  await waitFor(async () => (await agentSession.api('territory-localities', { state: 'CT' })).total === 1, 'Saving town access did not restrict the rep to Hartford');

  const scopedMap = await agentSession.api('territory-map', { state: 'CT' });
  assert.deepEqual(scopedMap.features.map(feature => feature.name), ['Hartford']);
  await agentSession.api('territory-map', { state: 'AK' }, 403);
  await agentSession.api('set-county-lead', {state:'CT', county:'09110',revision:0,name:'Blocked',photo:''}, 403);
  const townFacilities = await agentSession.api('territory-facilities', { state: 'CT', category: 'nursing-home' });
  assert.equal(townFacilities.total, 28);
  assert.ok(townFacilities.results.every(record => record.city.toLowerCase() === 'hartford'));
  const townCenters = await agentSession.api('territory-facilities', { state: 'CT', category: 'senior-center' });
  assert.deepEqual(townCenters.results.map(record => record.name), ['Hartford Example Senior Center', 'Second Example Senior Center']);
  await agentSession.api('territory-facilities', { state: 'AK', category: 'nursing-home' }, 403);
  window.document.querySelector('[data-tab=team]').click();
  const ownerInvite = window.document.querySelector('#sales-create-agent');
  const submitInvite = ownerInvite.querySelector('button[type=submit]');
  for (let retry = 0; retry < 100 && submitInvite.disabled; retry++) await delay(20);
  assert.equal(submitInvite.disabled, false);
  for (const [key, value] of Object.entries({ name: 'Example Peer', email: 'peer@example.test', states: 'MA' })) ownerInvite.elements[key].value = value;
  ownerInvite.requestSubmit();
  const createdCode = () => window.document.querySelector('#sales-agent-code-value')?.textContent;
  for (let retry = 0; retry < 100 && !createdCode(); retry++) await delay(20);
  assert.match(createdCode() || '', /^[A-Za-z0-9_-]{43}$/);
  const peer = (await owner.api('sales-team-read')).members.find(member => member.email === 'peer@example.test');
  assert.equal(peer.parentId, 'owner');
  const juniorInput = { name: 'Example Junior', email: 'junior@example.test' };
  await agentSession.api('sales-team-invite', { ...juniorInput, states: ['MA'] }, 403);
  await agentSession.api('sales-team-invite', { ...juniorInput, parentId: peer.id }, 403);
  const tryInvite = () => agentSession.request('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sales-team-invite', ...juniorInput }) });
  const inviteReplies = await Promise.all([tryInvite(), tryInvite()]);
  assert.deepEqual(inviteReplies.map(reply => reply.status).sort(), [200, 409]);
  const junior = await inviteReplies.find(reply => reply.ok).json();
  const juniorSession = browserSession(first.origin);
  await juniorSession.api('login', { email: juniorInput.email, code: junior.code });
  const traineeInput = { name: 'Example Trainee', email: 'trainee@example.test' };
  const trainee = await juniorSession.api('sales-team-invite', traineeInput);
  const traineeSession = browserSession(first.origin);
  await traineeSession.api('login', { email: traineeInput.email, code: trainee.code });
  const team = await owner.api('sales-team-read');
  const byId = new Map(team.members.map(member => [member.id, member]));
  assert.equal(team.rootId, 'owner');
  assert.equal(byId.get(agent.id).parentId, 'owner');
  assert.equal(byId.get(junior.agent.id).parentId, agent.id);
  assert.equal(byId.get(trainee.agent.id).parentId, junior.agent.id);
  assert.equal(byId.get(trainee.agent.id).active, true);
  assert.equal(team.members.some(member => 'codeHash' in member || 'code' in member), false);
  const branch = await agentSession.api('sales-team-read');
  assert.equal(branch.rootId, agent.id);
  assert.deepEqual((await agentSession.api('bootstrap')).agents, []);
  assert.deepEqual(new Set(branch.members.map(member => member.id)), new Set([agent.id, junior.agent.id, trainee.agent.id]));
  assert.equal(branch.members.find(member => member.id === junior.agent.id).canRevoke, true);
  assert.equal(branch.members.find(member => member.id === trainee.agent.id).canRevoke, false);
  await agentSession.api('sales-team-revoke', { id: trainee.agent.id }, 403);
  await agentSession.api('sales-team-revoke', { id: peer.id }, 403);
  const agentWindow = await mountConsole(t, first.origin, agentSession, html);
  const agentDocument = agentWindow.document;
  for (let retry = 0; retry < 100 && agentDocument.querySelector('#sales-workspace').hidden; retry++) await delay(20);
  const agentNav = agentDocument.querySelector('[data-tab=team]');
  agentNav.click();
  agentDocument.querySelector('#sales-team-territories').click();
  agentDocument.querySelector('[data-territory-state="CT"]').click();
  const capitolId = '09110';
  await waitFor(() => agentDocument.querySelector('[data-county-row="09110"]'), 'Team county roster did not load');
  agentDocument.querySelector('[data-county-row="09110"]').click();
  const teamCounty = agentDocument.querySelector('.county-lead-form');
  const choices = [...teamCounty.elements.memberId.options].map(o => o.value);
  assert.ok(choices.includes(junior.agent.id) && choices.includes(trainee.agent.id) && !choices.includes(peer.id));
  teamCounty.elements.memberId.value = junior.agent.id;
  teamCounty.requestSubmit();
  await waitFor(() => agentDocument.querySelector('[data-county-row="09110"]').textContent.includes(juniorInput.name), 'Team lead could not save a county assignment');
  const delegated = {state:'CT', county:capitolId, memberId:trainee.agent.id, revision:1, photo:''};
  const transfer = await juniorSession.api('set-county-lead', delegated);
  assert.equal(transfer.lead.name, traineeInput.name);
  await agentSession.api('set-county-lead', {...delegated, revision:2, memberId:peer.id},403);
  await agentSession.api('set-county-lead', {...delegated, revision:0, county:'09190'},403);
  assert.deepEqual((await juniorSession.api('territory-localities',{state:'CT'})).results.map(r => r.name), ['Hartford']);
  assert.equal((await owner.api('territory-map',{state:'CT'})).counties.find(c=>c.id===capitolId).lead.memberId, trainee.agent.id);

  assert.equal(agentNav.hidden, false);
  agentNav.click();
  assert.equal(agentDocument.querySelector('#sales-enrollment-terms').hidden, true);
  const branchTree = agentDocument.querySelector('#sales-team');
  const traineeRow = '[data-team-member="' + trainee.agent.id + '"]';
  for (let retry = 0; retry < 100 && !branchTree.querySelector(traineeRow); retry++) await delay(20);
  assert.ok(branchTree.querySelector('[data-team-member="' + junior.agent.id + '"] ' + traineeRow));
  assert.equal(branchTree.querySelector('[data-team-member="' + peer.id + '"]'), null);
  assert.ok(branchTree.querySelector('[data-team-revoke="' + junior.agent.id + '"]'));
  assert.equal(branchTree.querySelector('[data-team-revoke="' + trainee.agent.id + '"]'), null);
  const juniorScope = (await juniorSession.api('bootstrap')).user.territory;
  assert.deepEqual(juniorScope.areas, [{ state: 'CT', cities: ['hartford'] }]);
  await juniorSession.api('search-local', { city: 'New Haven', state: 'CT' }, 403);
  await assignTown('new haven');
  assert.deepEqual((await traineeSession.api('bootstrap')).user.territory.areas, []);
  await traineeSession.api('search-local', { city: 'Hartford', state: 'CT' }, 403);
  await assignTown('hartford');
  assert.deepEqual((await traineeSession.api('bootstrap')).user.territory.areas, juniorScope.areas);

  const candidates = await owner.api('search-local', { city: 'Hartford', state: 'CT' });
  assert.equal(candidates.results[0].name, office.name);
  const sourced = await owner.api('research-local-contacts', { candidateToken: candidates.results[0].researchToken });
  assert.ok(sourced.evidence.some(item => item.value === office.email));
  const saved = (await owner.api('create-office', { ...office, assignedTo: agent.id })).office;
  const id = String(saved.id);
  window.document.querySelector('[data-tab=pipeline]').click();
  window.document.querySelector('#sales-refresh').click();
  const officeSelector = `#sales-offices [data-office="${id}"]`;
  for (let retry = 0; retry < 100 && !window.document.querySelector(officeSelector); retry++) await delay(20);
  window.document.querySelector(officeSelector).click();
  const sourceLinks = '#sales-detail .sales-actions a[href^="https://www.linkedin.com/"]';
  for (let retry = 0; retry < 100 && !window.document.querySelector(sourceLinks); retry++) await delay(20);
  const prospectSearch = new URL(window.document.querySelector(sourceLinks).href);
  assert.equal(prospectSearch.pathname, '/search/results/people/');
  assert.equal(prospectSearch.searchParams.get('keywords'), 'Sample Solar Partner Hartford CT');
  assert.equal((await agentSession.api('bootstrap')).offices[0].town, office.name);
  const detail = await agentSession.api('office', { id });
  assert.match(detail.drafts.message, /Solar Partners SDR/);
  await agentSession.api('record-progress', { id, expectedRevision: detail.pipeline.revision, requestId: randomUUID(), kind: 'contacted', channel: 'call', note: 'Synthetic call recorded.', waitingOn: 'office' });
  const lead = await agentSession.api('office', { id });
  await agentSession.api('save-contact', { id, contactId: 'office-contact', expectedRevision: lead.contacts.revision, requestId: randomUUID(),
    contact: { name: office.contact, email: office.email, role: 'owner', preference: 'email', sourceURL: office.source, sourceNote: 'Reviewed sample source.', reviewed: true } });
  await owner.api('verify-office', { id, finding: 'independent', reviewed: true, sourceURL: office.source, note: 'Synthetic ownership proof.' });

  const agreement = { business: 'Solar Partners', agreementTitle: 'Project partnership', agreementText: 'Synthetic contract content for a local project. This written text records the agreed responsibilities of the two businesses.' };
  await owner.api('publish-terms', { ...agreement, approved: false }, 400);
  await owner.api('publish-terms', { ...agreement, approved: true });
  const invitation = await agentSession.api('invite', { id, ownerName: office.contact, email: office.email });
  const inviteURL = new URL(invitation.link);
  const token = Object.fromEntries(new URLSearchParams(inviteURL.hash.slice(1)));
  assert.equal(inviteURL.origin, first.origin);
  const signer = browserSession(first.origin);
  assert.match(await (await signer.request('/office-signup')).text(), /Review and sign your agreement/);
  const view = await signer.api('signup-view', token);
  assert.equal(view.terms.title, agreement.agreementTitle);
  const sign = await signer.api('signup-sign', { ...token, signature: office.contact, email: office.email, termsHash: view.terms.hash, authorized: true, independent: true, electronicConsent: true, accepted: true });
  assert.equal(sign.paymentStatus, 'not_required');
  await signer.api('signup-confirm', token, 409);
  assert.equal((await owner.api('bootstrap')).offices.find(row => row.town === office.name).pipeline.waitingOn, 'none');
  await agentSession.api('sales-team-revoke', { id: junior.agent.id });
  await juniorSession.api('bootstrap', {}, 401);
  await traineeSession.api('bootstrap', {}, 401);
  await traineeSession.api('login', { email: traineeInput.email, code: trainee.code }, 401);
  await owner.api('revoke-agent', { id: agent.id });
  await agentSession.api('bootstrap', {}, 401);
  const replacement = await owner.api('sales-team-invite', { ...traineeInput, parentId: peer.id });
  assert.notEqual(replacement.agent.id, trainee.agent.id);
  const replacementSession = browserSession(first.origin);
  await replacementSession.api('login', { email: traineeInput.email, code: replacement.code });
  await owner.api('sales-team-revoke', { id: peer.id });
  await replacementSession.api('bootstrap', {}, 401);

  await t.test('senior-care and universal views share saved facilities and honor the active pipeline filter', async t => {
    const path = '/sales/senior-care';
    const carePage = await owner.request(path);
    assert.equal(carePage.status, 200);
    assert.ok(pageDocument.querySelector('a[href="/sales/senior-care"]'));
    assert.equal(pageDocument.querySelector('#care-directory-state'), null);
    const careWindow = await mountConsole(t, first.origin, owner, await carePage.text(), path);
    const care = careWindow.document;
    await waitFor(() => !care.querySelector('#sales-workspace').hidden, 'Care view did not reuse the signed-in session');
    const directoryState = care.querySelector('#care-directory-state');
    assert.equal(directoryState.options.length, 51);
    care.querySelector('[data-tab="facilities"]').click();
    const facilitiesPanel = care.querySelector('[data-tab-panel="facilities"]');
    assert.equal(facilitiesPanel.hidden, false);
    assert.equal(care.querySelector('[data-tab-panel="territories"] #sales-territory-facilities'), null);
    const results = facilitiesPanel.querySelector('[data-facility-results]');
    const facilityState = facilitiesPanel.querySelector('[data-facility-state]');
    facilityState.value = 'AK';
    facilityState.dispatchEvent(new careWindow.Event('change', { bubbles: true }));
    await waitFor(() => /Anchorage Example Home/i.test(results.textContent), 'Alaska facilities did not load from the directory state selector');
    assert.match(results.querySelector('a').href, /^https:\/\/data\.cms\.gov\//);
    facilityState.value = 'CT';
    facilityState.dispatchEvent(new careWindow.Event('change', { bubbles: true }));
    await waitFor(() => /Bridgeport Example Home/i.test(results.textContent), 'Connecticut facilities did not load from the directory state selector');
    assert.doesNotMatch(results.textContent, /Anchorage Example Home/i);
    const facilitySearch = facilitiesPanel.querySelector('[data-facility-search]');
    const query = facilitiesPanel.querySelector('[data-facility-query]');
    query.value = 'Bridgeport';
    facilitySearch.requestSubmit();
    await waitFor(() => /Bridgeport Example Home/i.test(results.textContent) && !/Hartford Example Home/i.test(results.textContent), 'Facility name and town search failed');
    query.value = '';
    facilitySearch.requestSubmit();

    const facilities = [
      { category: 'nursing-home', state: 'AK', name: 'ANCHORAGE Example Home 1' },
      { category: 'senior-center', state: 'CT', name: 'Second Example Senior Center', address: '42 Example Street' },
    ];
    for (const facility of facilities) {
      care.querySelector('[data-tab="home"]').click();
      directoryState.value = facility.state;
      directoryState.dispatchEvent(new careWindow.Event('change', { bubbles: true }));
      care.querySelector(`[data-browse-facility="${facility.category}"]`).click();
      const row = await waitFor(() => [...care.querySelectorAll('[data-facility-results] li')]
        .find(item => item.querySelector('strong')?.textContent === facility.name), 'Directory did not open the requested facility type and state');
      if (facility.address) row.querySelector('[name="address"]').value = facility.address;
      row.querySelector('[data-save-to-pipeline]').click();
      await waitFor(() => row.querySelector('[data-open-facility]'), 'Directory did not confirm the saved facility');
    }

    const savedOffices = (await owner.api('bootstrap')).offices;
    care.querySelector('[data-tab="pipeline"]').click();
    pageDocument.querySelector('[data-tab="pipeline"]').click();
    pageDocument.querySelector('#sales-refresh').click();
    for (const facility of facilities) {
      const matching = savedOffices.filter(row => row.town === facility.name);
      assert.equal(matching.length, 1);
      assert.equal(JSON.parse(matching[0].notes).facilityType, facility.category);
      const office = `#sales-offices [data-office="${matching[0].id}"]`;
      await waitFor(() => pageDocument.querySelector(office), 'Universal pipeline did not show the saved facility');
      const filter = care.querySelector('#sales-facility-kind-filter');
      filter.value = facility.category;
      filter.dispatchEvent(new careWindow.Event('change', { bubbles: true }));
      const visible = [...care.querySelectorAll('#sales-offices [data-office]')].map(button => button.textContent);
      assert.ok(visible.some(label => label.includes(facility.name)));
      const other = facilities.find(row => row.category !== facility.category);
      assert.ok(visible.every(label => !label.includes(other.name)));
    }
  });

  await first.stop();
  const restarted = await run(root);
  servers.push(restarted);
  const reopen = browserSession(restarted.origin);
  await reopen.api('login', { code });
  const recovered = await reopen.api('bootstrap');
  const recoveredLead = (await reopen.api('territory-map',{state:'SC'})).counties.find(county => county.id === '45027').lead;
  assert.deepEqual(recoveredLead, {name:'Example County Lead', photo:portrait, revision:2});
  assert.equal(recovered.earnings.totalCents, 12550);
  assert.equal((await reopen.api('business-research-last')).research.companies[0].name, 'Example Senior Center');
  assert.equal(recovered.offices.find(row => row.town === office.name).pipeline.stage, 'contract_signed');
  assert.equal(JSON.parse(recovered.offices.find(row => row.town === 'Second Example Senior Center').notes).facilityType, 'senior-center');
  assert.equal(recovered.contracts[0].status, 'signed');
  assert.deepEqual(recovered.agents, []);
  const recoveredTeam = await reopen.api('sales-team-read');
  const originalTrainee = recoveredTeam.members.find(member => member.id === trainee.agent.id);
  assert.equal(originalTrainee.active, false);
  assert.equal(originalTrainee.parentId, junior.agent.id);
  assert.equal((await reopen.api('list-prospects', { query: 'renee' })).records[0].id, localRecord.id);
  assert.equal((await reopen.api('list-prospects', { archived: true })).records[0].id, archived.id);
  assert.deepEqual((await differentProject.api('bootstrap')).offices, []);
  const doLogin = (origin, secret) => fetch(origin + '/api/sales', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', code: secret }),
  });
  const firstCookie = (await doLogin(restarted.origin, code)).headers.get('set-cookie').split('=')[0];
  const secondCookie = (await doLogin(other.origin, otherCode)).headers.get('set-cookie').split('=')[0];
  assert.notEqual(firstCookie, secondCookie);

  await t.test('the sidebar keeps Signup locations and the Rolodex adds contacts in an empty workspace', async t => {
    const response = await differentProject.request('/sales');
    const contactsWindow = await mountConsole(t, other.origin, differentProject, await response.text(), '/sales#view=contacts');
    const doc = contactsWindow.document;
    const find = selector => doc.querySelector(selector);
    await waitFor(() => !find('[data-tab-panel="contacts"]').hidden, 'The Rolodex did not open');
    assert.ok(find('.sdr-sidebar [data-tab="locations"]'));
    assert.equal(find('.sdr-sidebar [data-tab="discover"]'), null);
    assert.ok(find('[data-tab-panel="discover"]'));
    const opener = find('[data-rolodex-add]');
    opener.click();
    const form = find('#sales-add-rolodex-contact');
    const submit = () => form.requestSubmit();
    function fill(fields) {
      for (const [key, value] of Object.entries(fields)) form.elements.namedItem(key).value = value;
    }
    assert.equal(form.elements.officeId.value, 'new');
    assert.equal(form.querySelector('fieldset').hidden, false);
    fill({ name: 'Example First Contact', role: 'manager', title: 'Administrator', email: 'first@example.test',
      organization: 'Example New Organization', address: '80 Example Street', city: 'Hartford', state: 'CT' });
    submit();
    await waitFor(() => find('[data-rolodex-results]').textContent.includes('Example First Contact'), 'New contact did not appear');
    const data = await differentProject.api('bootstrap');
    assert.equal(data.offices.length, 1);
    assert.match(data.offices[0].town, /Example New Organization/);
    assert.equal(data.rolodex.contacts[0].role, 'manager');
    assert.equal(data.rolodex.contacts[0].title, 'Administrator');
    assert.equal(data.rolodex.contacts[0].primary, true);

    opener.click();
    fill({ officeId: String(data.offices[0].id), name: 'Example Second Contact', role: 'staff', email: 'second@example.test' });
    form.elements.officeId.dispatchEvent(new contactsWindow.Event('change', { bubbles: true }));
    assert.equal(form.querySelector('fieldset').hidden, true);
    submit();
    await waitFor(() => find('[data-rolodex-results]').textContent.includes('Example Second Contact'), 'Existing office contact did not appear');
    const saved = await differentProject.api('bootstrap');
    assert.equal(saved.offices.length, 1);
    assert.equal(saved.rolodex.contacts.length, 2);
    assert.ok(!recovered.rolodex.contacts.some(contact => contact.officeName === 'Example New Organization'));
  });

  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  const client = new Client({ name: 'sdr-export-test', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: ['scripts/sdr-export/mcp.mjs'], cwd: root,
      env: { SDR_ORIGIN: restarted.origin }, stderr: 'pipe',
    }));
    const read = await client.callTool({ name: 'sdr_read', arguments: { resource: 'pipeline' } });
    assert.ok(!read.isError, read.content[0]?.text);
    assert.ok(JSON.parse(read.content[0].text).offices.some(row => row.town === office.name));
  } finally {
    await client.close();
  }
  await other.stop();
  const unspecifiedProfile = JSON.parse(readFileSync(join(second, 'workspace.json'), 'utf8'));
  writeFileSync(join(second, 'workspace.json'), JSON.stringify({ ...unspecifiedProfile, focus: 'another-sector' }));
  const otherSector = await run(second);
  servers.push(otherSector);
  assert.equal((await fetch(otherSector.origin + '/sales')).status, 200);
  assert.equal((await fetch(otherSector.origin + '/sales/senior-care')).status, 404);
});
