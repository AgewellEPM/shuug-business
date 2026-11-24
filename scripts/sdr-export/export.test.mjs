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
import { trainingCourseExercises } from '../../sales/training-content.mjs';
import { trainingScenarios } from '../../sales/training-scenarios.mjs';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function run(root, googlePlacesKey = '') {
  const port = await freePort();
  const origin = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['--import', './public-source-fixture.mjs', 'scripts/sdr-export/server.mjs'], {
    cwd: root, env: { PATH: process.env.PATH, SDR_PORT: String(port), SDR_GOOGLE_PLACES_API_KEY: googlePlacesKey }, stdio: ['ignore', 'pipe', 'pipe'],
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
    window.fetch = (input, options) => {
      const url = new URL(input, window.location.href);
      assert.equal(url.origin, origin);
      const path = url.pathname + url.search;
      if (!options?.signal) return session.request(path, options);
      // Keep DOM event subscriptions in the document realm and bridge fetch cancellation into Node.
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
      return session.request(path, { ...options, signal: controller.signal })
        .finally(() => options.signal.removeEventListener('abort', abort));
    };
    const dialog = window.HTMLDialogElement.prototype;
    dialog.showModal ??= function () { this.open = true; };
    dialog.close ??= function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
    session.configureWindow?.(window);
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
      if (url.hostname === 'places.googleapis.com') {
        if (options.headers['X-Goog-Api-Key'] !== 'fixture-places-key') throw new Error('Places key must stay in the request header.');
        if (url.pathname === '/v1/places:searchText') {
          const { textQuery } = JSON.parse(options.body);
          if (!textQuery.includes('Limestone Nursing and Rehabilitation Center') || !textQuery.includes('1600 WEST HOBBS STREET')) return Response.json({});
          const part = (type, longText, shortText = longText) => ({ types: [type], longText, shortText });
          const listing = (id, number) => ({ id, displayName: { text: 'Limestone Nursing & Rehabilitation' }, addressComponents: [
            part('country', 'United States', 'US'), part('administrative_area_level_1', 'Alabama', 'AL'), part('locality', 'Athens'),
            part('postal_code', '35611'), part('street_number', number), part('route', 'W Hobbs St'),
          ] });
          return Response.json({ places: [listing('WrongGooglePlaceId', '1601'), listing('LimestoneGooglePlaceId', '1600')] });
        }
        if (url.pathname === '/v1/places/LimestoneGooglePlaceId') {
          const review = (rating, name, text) => ({ rating, text: { text }, relativePublishTimeDescription: 'a week ago',
            authorAttribution: { displayName: name, uri: 'https://www.google.com/maps/contrib/1234', photoUri: 'https://lh3.googleusercontent.com/a/example' },
            googleMapsUri: 'https://www.google.com/maps/reviews/' + rating });
          return Response.json({
            id: 'LimestoneGooglePlaceId', rating: 4.2, userRatingCount: 137,
            googleMapsLinks: { reviewsUri: 'https://www.google.com/maps/place/Limestone/reviews' },
            reviews: [
              review(5, 'Fixture Reviewer One', 'Front desk directions were helpful.'),
              review(4, 'Fixture Reviewer Two', 'Friendly check-in.'),
              review(1, 'Fixture Reviewer Three', 'We had questions about visiting hours.'),
              review(3, 'Fixture Reviewer Four', 'Our experience was mixed.'),
              review(5, 'Fixture Reviewer Five', 'Staff gave us a clear answer.'),
            ],
            reviewSummary: { text: { text: 'Fixture summary of visitor feedback.' }, disclosureText: { text: 'Summarized with Gemini' },
              flagContentUri: 'https://www.google.com/maps/report/fixture', reviewsUri: 'https://www.google.com/maps/place/Limestone/reviews' },
          });
        }
        throw new Error('Places lookup did not select the matched street address.');
      }
      if (url.origin === 'http://127.0.0.1:11434' && url.pathname === '/api/chat') {
        const { messages } = JSON.parse(options.body);
        const { roles, communicationFocus } = JSON.parse(messages[1].content);
        if (messages.some(message => message.content.includes('Fixture Reviewer') || message.content.includes('questions about visiting hours'))) {
          throw new Error('Review content reached the outreach model.');
        }
        if (roles.length < 5) return Response.json({}, { status: 503 });
        return Response.json({ message: { content: JSON.stringify({
          examples: roles.map(role => communicationFocus || ('A front-desk use case relevant to ' + role + '.')),
        }) } });
      }
      if (url.hostname === 'data.cms.gov') {
        const state = url.searchParams.get('conditions[0][value]');
        if (state === 'AL') return Response.json({ count: 2, results: [{
          cms_certification_number_ccn: '015024', provider_name: 'Limestone Nursing and Rehabilitation Center',
          provider_address: '1600 WEST HOBBS STREET', citytown: 'ATHENS', state: 'AL', zip_code: '35611', telephone_number: '2562323461',
          number_of_certified_beds: '170',
        }, {
          cms_certification_number_ccn: '015465', provider_name: 'Aspire Physical Recovery Center of West Alabama',
          provider_address: '2400 HOSPITAL DRIVE', citytown: 'NORTHPORT', state: 'AL', zip_code: '35476', telephone_number: '2053308412',
          number_of_certified_beds: '75',
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

  const first = await run(root, 'fixture-places-key');
  servers.push(first);
  const other = await run(second);
  servers.push(other);
  const code = readFileSync(join(root, 'workspace-data', 'owner-code'), 'utf8').trim();
  const otherCode = readFileSync(join(second, 'workspace-data', 'owner-code'), 'utf8').trim();
  assert.notEqual(code, otherCode);
  const owner = browserSession(first.origin);
  const differentProject = browserSession(other.origin);
  await owner.api('sales-team-read', {}, 401);
  await owner.api('sales-daily-plan', {}, 401);
  await owner.api('territory-map', { state: 'CT' }, 401);
  await owner.api('territory-facilities', { state: 'CT', category: 'nursing-home' }, 401);
  await owner.api('facility-reviews', { state: 'AL', category: 'nursing-home' }, 401);
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
  const today = window.document.querySelector('[data-tab-panel="today"]');
  assert.equal(today.hidden, false);
  assert.equal(window.document.querySelector('[data-tab="today"]').getAttribute('aria-pressed'), 'true');
  assert.equal(window.document.querySelector('[data-profile-name]').textContent, 'Workspace owner');
  assert.equal((await owner.request('/sales-today-hero.webp')).headers.get('content-type'), 'image/webp');
  const firstTask = await waitFor(() => today.querySelector('[data-today-tasks] input[type="checkbox"]'),
    'The opening action plan did not load workspace tasks');
  const taskCount = today.querySelectorAll('[data-today-tasks] input[type="checkbox"]').length;
  assert.ok(taskCount >= 3);
  assert.equal(today.querySelector('[data-today-metric="totalProspects"]').textContent, '0');
  assert.equal(today.querySelector('[data-today-schedule-empty]').hidden, false);
  firstTask.click();
  await waitFor(() => today.querySelector('[data-today-progress]').value === 1, 'The checklist did not save the completed task');
  assert.equal(today.querySelector('[data-today-progress]').max, taskCount);
  today.querySelector('[data-today-filter="follow-ups"]').click();
  assert.equal(today.querySelector('[data-today-tasks-empty]').hidden, false);
  today.querySelector('[data-today-filter="all"]').click();
  assert.equal(today.querySelector('[data-today-tasks] input[type="checkbox"]').checked, true);
  today.querySelector('[data-today-schedule-link]').click();
  assert.equal(window.document.querySelector('[data-tab-panel="calendar"]').hidden, false);
  window.document.querySelector('[data-tab="home"]').click();
  assert.equal(window.document.querySelector('[data-tab-panel="home"]').hidden, false);
  window.document.querySelector('[data-tab="today"]').click();
  await waitFor(() => today.querySelector('[data-today-tasks] input[type="checkbox"]')?.checked,
    'The daily task did not stay completed when reopening Today');
  today.querySelector('[data-today-schedule-action]').click();
  await waitFor(() => window.document.activeElement?.id === 'bk-public-link',
    'Schedule meeting did not open the owner’s published booking workflow');
  window.document.querySelector('[data-tab="today"]').click();
  today.querySelector('[data-today-action="add-prospect"]').click();
  assert.equal(window.document.querySelector('[data-tab-panel="prospects"]').hidden, false);
  assert.equal(window.document.activeElement, window.document.querySelector('[data-prospect-editor] input[name="name"]'));
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
  await t.test('training opens from the sidebar and resumes saved onboarding', async t => {
    const trainingWindow = await mountConsole(t, first.origin, owner, html);
    const doc = trainingWindow.document;
    const training = doc.querySelector('[data-tab-panel="training"]');
    const find = selector => training.querySelector(selector);
    await waitFor(() => !doc.querySelector('#sales-workspace').hidden, 'Workspace did not sign in');
    doc.querySelector('.sdr-sidebar [data-tab="training"]').click();
    const planButton = '[data-training-feature] [data-training-plan="sales-onboarding"]';
    const featuredCourse = '[data-training-feature] .training-feature-description [data-training-course="sales-onboarding"]';
    await waitFor(() => find(featuredCourse), 'The featured course did not load');
    find(planButton).click();
    await waitFor(() => find(planButton).getAttribute('aria-pressed') === 'true', 'Adding a course to My Plan did not save');
    find(featuredCourse).click();
    await waitFor(async () => (await owner.api('training-progress')).progress.sections['sales-onboarding'] === 'workspace',
      'The first lesson did not save');
    find('.training-lesson-nav [data-training-section="follow-through"]').click();
    await waitFor(async () => (await owner.api('training-progress')).progress.sections['sales-onboarding'] === 'follow-through',
      'The later lesson did not save');

    const resumed = await mountConsole(t, first.origin, owner, html, '/sales#view=training');
    const resume = selector => resumed.document.querySelector('.sdr-training ' + selector);
    await waitFor(() => resume(featuredCourse), 'The Training Center did not load after reopening');
    assert.match(resume(featuredCourse).textContent, /Continue Training/);
    assert.equal(resume(planButton).getAttribute('aria-pressed'), 'true');
    resume(featuredCourse).click();
    assert.match(resume('[data-training-lesson-title]').textContent, /handoff/i);
    const finish = '[data-training-complete="sales-onboarding"]';
    assert.equal(resume(finish).disabled, true);
    resume('.training-lesson-nav [data-training-section="conversation"]').click();
    await waitFor(async () => (await owner.api('training-progress')).progress.visitedSections['sales-onboarding']?.includes('conversation'),
      'All lesson visits did not save');
    resume('.training-work-tabs [data-training-work="practice"]').click();
    for (const form of resumed.document.querySelectorAll('[data-training-practice]')) {
      for (const input of form.querySelectorAll('[name="criterion"]')) input.checked = true;
      form.requestSubmit();
      await waitFor(() => !form.querySelector('[data-training-practice-status]').hidden, 'The practice checklist did not save');
    }
    resume('.training-work-tabs [data-training-work="assessment"]').click();
    for (const question of trainingCourseExercises['sales-onboarding'].questions) {
      resume(`[data-training-question="${question.id}"] input[value="${question.correct}"]`).checked = true;
    }
    resume('[data-training-assessment]').requestSubmit();
    await waitFor(() => resume('.training-assessment-result[data-passed="true"]'), 'Passing score and feedback did not appear');
    await waitFor(() => resume(finish) && !resume(finish).disabled, 'The completion action did not become available');
    resume(finish).click();
    await waitFor(() => resume('[data-training-metric="completed"]').textContent === '1', 'Completing the course did not update progress');
    assert.ok((await owner.api('training-progress')).progress.completed['sales-onboarding']);
    assert.deepEqual((await differentProject.api('training-progress')).progress.plan, []);
    assert.deepEqual((await differentProject.api('training-progress')).progress.completed, {});
  });
  await t.test('training demos offer selectable voice replies and record a pipeline practice score', async t => {
    const spoken = [];
    let microphone;
    const session = { ...owner, configureWindow(window) {
      window.SpeechRecognition = class {
        constructor() { microphone = this; }
        start() { this.onstart(); }
        abort() { this.aborted = true; }
      };
      window.SpeechSynthesisUtterance = class {
        constructor(text) { this.text = text; }
      };
      window.speechSynthesis = {
        cancel() {}, getVoices() { return []; },
        speak(phrase) { spoken.push(phrase.text); phrase.onend(); },
      };
    } };
    const { document } = await mountConsole(t, first.origin, session, html, '/sales#view=training&section=demo');
    const find = selector => document.querySelector(selector);
    const voiceLink = '[data-training-demo="voice"]';
    await waitFor(() => find(voiceLink), 'Demo Lab links did not load');
    const before = (await owner.api('bootstrap')).offices;
    find(voiceLink).click();
    const voice = part => find('[data-training-voice-' + part + ']');
    assert.equal(find('[data-tab-panel="training-demo"]').hidden, false);
    assert.equal((await owner.request('/care-location-qr-healthcare.png')).headers.get('content-type'), 'image/png');
    voice('listen').click();
    assert.match(voice('status').textContent, /Listening/);
    microphone.onresult({ results: { length: 1, 0: { isFinal: true, 0: { transcript: 'Would you like some water?' } } } });
    assert.equal(microphone.aborted, true);
    assert.match(voice('choices').textContent, /water/);
    assert.deepEqual(spoken, []);
    voice('choices').querySelector('button').click();
    assert.deepEqual(spoken, []);
    voice('speak').click();
    assert.match(spoken[0], /water/);
    find('[data-training-demo-return]').click();
    find('[data-training-demo="pipeline"]').click();
    const scenario = trainingScenarios.find(item => item.id === 'nursing-home-pipeline');
    const start = `[data-pipeline-practice-start="${scenario.id}"]`;
    await waitFor(() => find(start), 'Pipeline practice case did not load');
    find(start).click();
    for (const stage of scenario.stages) {
      const form = find('[data-pipeline-practice-stage]');
      assert.match(form.textContent, new RegExp(stage.prompt.slice(0, 20), 'i'));
      form.querySelector(`[value="${stage.correct}"]`).checked = true;
      form.requestSubmit();
    }
    await waitFor(() => find('[data-pipeline-practice-result][data-passed="true"]'), 'The practice score did not appear');
    assert.equal((await owner.api('training-progress')).progress.scenarios[scenario.id].best.percent, 100);
    assert.deepEqual((await owner.api('bootstrap')).offices, before);
  });
  await t.test('a Support click during startup survives initial view selection', async t => {
    let releaseSettings;
    const settingsReady = new Promise(resolve => { releaseSettings = resolve; });
    t.after(releaseSettings);
    const slowSession = {
      async request(path, options) {
        if (path === '/api/sales' && options?.body && JSON.parse(options.body).action === 'directory-settings') {
          await settingsReady;
        }
        return owner.request(path, options);
      },
    };
    const { document } = await mountConsole(t, first.origin, slowSession, html, '/sales#view=today');
    await waitFor(() => !document.querySelector('#sales-workspace').hidden, 'Workspace did not become visible');
    document.querySelector('[data-tab="support"]').click();
    releaseSettings();
    await waitFor(() => document.querySelector('#directory-support-form'), 'Owner settings did not load');
    assert.equal(document.body.dataset.sdrView, 'support');
    assert.equal(document.querySelector('[data-tab-panel="support"]').hidden, false);
    const header = document.querySelector('.sdr-topbar');
    const { progress } = await owner.api('bootstrap');
    assert.equal(header.querySelector('#sdr-xp-level').textContent, 'Level ' + progress.level);
    assert.equal(header.querySelector('#sdr-xp-bar').value, progress.xpIntoLevel);
    assert.equal(header.querySelector('#sdr-earnings').hidden, false);
    assert.ok(header.querySelector('#sales-logout'));
    assert.equal(header.querySelector('.sdr-user-avatar, #sales-name'), null);
    const search = header.querySelector('#sdr-header-search');
    search.querySelector('input').value = 'Solar';
    search.requestSubmit();
    assert.equal(document.body.dataset.sdrView, 'pipeline');
    assert.equal(document.querySelector('#sales-filter').value, 'Solar');
  });
  await t.test('support deep link opens help and preserves request conversations in the exported workspace', async t => {
    const supportWindow = await mountConsole(t, first.origin, owner, html, '/sales#view=support');
    const document = supportWindow.document;
    const rail = document.querySelector('.sdr-sidebar');
    const panel = document.querySelector('[data-tab-panel="support"]');
    const find = selector => panel.querySelector(selector);
    await waitFor(() => !document.querySelector('#sales-workspace').hidden && !panel.hidden,
      'Support Center did not open from its deep link');
    assert.equal(rail.querySelector('[data-tab="support"]').getAttribute('aria-pressed'), 'true');
    assert.equal(rail.querySelector('[data-tab="campaigns"]').hidden, false);
    assert.equal(rail.querySelector('[data-tab="locations"]'), null);
    assert.equal(rail.querySelector('[data-tab="contacts"]'), null);
    await waitFor(() => find('[data-support-service="requests"]').textContent === 'Available',
      'Support request availability was not reported');
    const metric = name => find(`[data-support-metric="${name}"]`).textContent;
    assert.equal(metric('response'), '—');
    assert.equal(metric('satisfaction'), '—');
    const sidebarResources = rail.querySelector('[data-support-sidebar-resources]');
    sidebarResources.click();
    assert.match(find('#support-library-title').textContent, /User guides/i);
    find('[data-support-action="clear-library"]').click();
    assert.equal(document.activeElement, sidebarResources);

    const search = find('[data-support-search]');
    search.elements.query.value = 'facilities by state';
    search.requestSubmit();
    const library = find('[data-support-library]');
    assert.equal(library.hidden, false);
    assert.match(library.textContent, /Find facilities by state/);
    const contracts = find('[data-support-topic="contracts"]');
    contracts.click();
    assert.equal(contracts.getAttribute('aria-pressed'), 'true');
    const guide = find('[data-support-entry="prepare-agreement-link"]');
    assert.ok(guide);
    guide.click();
    const dialog = find('[data-support-dialog]');
    assert.equal(dialog.open, true);
    assert.match(dialog.textContent, /Prepare an agreement for review/);
    find('[data-support-action="close-dialog"]').click();

    const startChat = find('[data-support-action="chat"]');
    startChat.click();
    assert.equal(find('#support-dialog-title').textContent, 'Start a support conversation');
    const create = find('[data-support-form="create"]');
    const subject = 'Question about an office agreement';
    const message = 'The <office> asked for the agreement link.';
    create.elements.subject.value = subject;
    create.elements.category.value = 'contracts';
    create.elements.message.value = message;
    create.requestSubmit();
    await waitFor(() => find('[data-support-form="reply"]'), 'New support conversation did not open');
    assert.equal(find('#support-dialog-title').textContent, subject);
    assert.equal(find('.support-thread-message p').textContent, message);
    await waitFor(() => find('[data-support-request-rows] [data-state="open"]'), 'New request did not appear as open');
    assert.equal(find('[data-support-request-rows] tr').cells.length, 4);
    find('[data-support-action="close-dialog"]').click();
    startChat.click();
    const reply = find('[data-support-form="reply"]');
    assert.equal(find('#support-dialog-title').textContent, subject);
    reply.elements.status.value = 'resolved';
    reply.elements.message.value = 'The agreement link is in the office contract record.';
    reply.requestSubmit();
    await waitFor(() => find('[data-support-request-rows] [data-state="resolved"]'),
      'Resolved request did not appear in the support table');
    assert.match(find('.support-thread').textContent, /The agreement link is in the office contract record/);
    const rating = find('[data-support-form="rating"]');
    rating.elements.rating.value = '4';
    rating.requestSubmit();
    await waitFor(() => /^4[.,]0 \/ 5$/.test(metric('satisfaction')), 'Saved rating did not update the satisfaction metric');
    assert.equal(metric('response'), '—', 'An owner replying to their own request must not create a response time');
    const { requests } = await owner.api('support-requests');
    assert.equal(requests.find(request => request.subject === subject)?.messages.length, 2);
    assert.deepEqual((await differentProject.api('support-requests')).requests, []);
  });
  pageDocument.querySelector('[data-tab="territories"]').click();
  const territoriesPanel = pageDocument.querySelector('[data-tab-panel="territories"]');
  const territoryHero = territoriesPanel.querySelector('.sdr-territory-hero');
  const territoryState = territoryHero.querySelector('#sales-territory-state');
  const chooseTerritory = code => {
    territoryState.focus();
    territoryState.value = code;
    territoryState.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  assert.equal(territoryState.value, '');
  assert.equal(territoryState.options.length, 52);
  assert.equal(territoryState.querySelector('option[value="DC"]').textContent, 'District of Columbia');
  pageDocument.querySelector('[data-territory-state="AK"]').click();
  assert.equal(territoryState.value, 'AK');
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
  assert.equal(territoryState.value, '');
  assert.equal(statePicker.closest('[hidden]'), null);
  stateShape('NC').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  stateShape('CT').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(() => townCanvas.querySelectorAll('.town-map-area').length === 169, 'CT town polygons did not open');
  assert.equal(townPanel.hidden, false);
  assert.equal(pageDocument.activeElement.id, 'town-map-title');
  assert.equal(stateShape('CT').closest('.sdr-card').hidden, true);
  assert.ok(statePicker.closest('[hidden]'));
  assert.equal(territoryHero.closest('[hidden]'), null);
  assert.equal(territoryState.value, 'CT');
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
  assert.equal(territoryState.value, '');
  assert.equal(pageDocument.activeElement, stateShape('CT'));
  stateShape('NC').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => townCanvas.querySelector('.town-map-area'), 'NC town polygons did not open');
  assert.ok([...townSelect.options].some(option => option.text === 'Raleigh' || option.text.startsWith('Raleigh ')));
  assert.equal(townPanel.querySelector('h2').textContent, 'North Carolina towns and cities');
  chooseTerritory('SC');
  await waitFor(() => townCanvas.querySelectorAll('.town-map-county').length === 46, 'Switching states in the dropdown did not open South Carolina');
  assert.equal(territoryHero.closest('[hidden]'), null);
  assert.equal(pageDocument.activeElement, territoryState);
  assert.equal(territoryState.value, 'SC');
  assert.equal(window.location.hash, '#view=territories&state=SC');
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
  assert.equal(townPanel.querySelector('[data-map-research]'), null);
  assert.ok(![...townPanel.querySelectorAll('[data-map-tools] button')].some(button => button.textContent.trim() === 'Find offices'));
  const clarendon = atlas.querySelector('path[data-county="45027"]');
  clarendon.dispatchEvent(new window.MouseEvent('click', {bubbles:true}));
  assert.equal(mapSelection.hidden, false);
  assert.match(mapSelection.textContent, /Clarendon County/);
  await waitFor(() => /No sales rep currently assigned/.test(mapSelection.textContent), 'The county’s unassigned status did not load');
  assert.equal(clarendon.parentElement.getAttribute('display'), 'none');
  assert.equal(atlas.querySelector('.town-map-districts').getAttribute('display'), 'inline');
  assert.equal(atlas.querySelectorAll('.town-map-district[data-district^="45027"]').length, 7);
  assert.equal(atlas.querySelector('.label-county'), null);
  assert.equal(townPanel.querySelector('.county-lead-form'), null);
  const assignCounty = await waitFor(() => mapSelection.querySelector('[data-county-assign]'), 'No assignment action for the workspace owner');
  assert.equal(assignCounty.textContent, 'Assign county');
  assignCounty.click();
  const leadForm = await waitFor(() => townPanel.querySelector('[data-county-editor] .county-lead-form'), 'Assign county did not open the county editor');
  leadForm.elements.memberId.value = 'manual';
  leadForm.elements.memberId.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(leadForm.elements.name.disabled, false);
  leadForm.elements.name.value = 'Example County Lead';
  leadForm.requestSubmit();
  await waitFor(() => townPanel.querySelector('[data-county-row="45027"]').textContent.includes('Example County Lead'), 'County roster did not update');
  await waitFor(() => mapSelection.querySelector('[data-county-assign]')?.textContent === 'Change rep', 'County assignment action did not switch to Change rep');
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
  assert.equal(townPanel.querySelector('.county-lead-form'), null);
  const richland = atlas.querySelector('path[data-county="45079"]');
  assert.ok(richland.getAttribute('class').includes('county-'));
  richland.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(atlas.dataset.detail, 'towns');
  assert.ok(atlas.querySelector('text[data-locality]'), 'county zoom adds local town names');
  colors.click();
  assert.equal(townPanel.classList.contains('map-grayscale'), false);
  assert.equal(window.localStorage.getItem('sdr.territoryMap.colors'), 'on');
  chooseTerritory('');
  assert.equal(townPanel.hidden, true);
  assert.equal(statePicker.closest('[hidden]'), null);
  assert.equal(pageDocument.activeElement, territoryState);
  assert.equal(window.location.hash, '#view=territories');
  window.location.hash = 'view=territories&state=CT';
  await waitFor(() => townCanvas.querySelectorAll('.town-map-area').length === 169, 'CT state link did not open');
  assert.equal(territoryState.value, 'CT');
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
    find('[data-prospect-action="facility-profile"]').click();
    const manualReviews = find('[data-facility-reviews]');
    assert.equal(manualReviews.open, true);
    await waitFor(() => find('[data-facility-review-status]').textContent.includes('could not be matched'), 'A saved business should have its own review lookup');
    assert.match(new URL(find('[data-facility-review-link]').href).searchParams.get('query'), /Example Care Prospect/);
    find('[data-facility-profile-close]').click();
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
    assert.doesNotMatch(panel.textContent, /Find headshot/);
    const profile = find('[data-facility-profile]');
    const facts = find('[data-facility-profile-facts]');
    const contact = find('[data-facility-profile-contact]');
    const close = find('[data-facility-profile-close]');
    administrator.querySelector('.prospects-administrator-photo').click();
    assert.equal(profile.open, true);
    assert.match(facts.textContent, /Certified beds170/);
    assert.match(facts.textContent, /Call for Champion Rehab visiting times/);
    const reviewPane = find('[data-facility-reviews]');
    const reviewStatus = find('[data-facility-review-status]');
    const reviewRating = find('[data-facility-review-rating]');
    assert.equal(reviewPane.open, false);
    assert.equal(reviewStatus.textContent, '');
    reviewPane.querySelector('summary').click();
    await waitFor(() => reviewRating.textContent.includes('137 Google ratings'), 'Google rating and review count did not render');
    assert.match(reviewRating.textContent, /4\.2 \/ 5/);
    assert.match(reviewStatus.textContent, /5 reviews.*relevance-ordered sample/);
    assert.equal(reviewPane.querySelectorAll('[data-tone="positive"] li').length, 3);
    assert.equal(reviewPane.querySelectorAll('[data-tone="negative"] li').length, 1);
    assert.equal(reviewPane.querySelectorAll('[data-tone="mixed"] li').length, 1);
    assert.match(reviewPane.querySelector('[data-tone="negative"]').textContent, /questions about visiting hours/);
    assert.ok(reviewPane.querySelector('[data-tone="negative"] a[href="https://www.google.com/maps/reviews/1"]'));
    assert.match(reviewPane.querySelector('.facility-review-summary').textContent, /Fixture summary.*Summarized with Gemini/s);
    assert.equal(find('[data-facility-review-link]').href, 'https://www.google.com/maps/place/Limestone/reviews');
    assert.ok(contact.querySelector('a[href="https://www.linkedin.com/in/sherry-bowling-565401bb"]'));
    const nursing = find('[data-facility-person="Aleshia Teeples"]');
    nursing.click();
    assert.equal(nursing.getAttribute('aria-pressed'), 'true');
    assert.match(contact.textContent, /Director of Nursing.*ateeples@limestonehf\.com/s);
    assert.match(contact.querySelector('img').alt, /Aleshia Teeples/);
    const portrait = contact.querySelector('img');
    const fallback = portrait.previousElementSibling;
    portrait.dispatchEvent(new window.Event('error'));
    assert.equal(contact.querySelector('img'), null);
    assert.equal(fallback.textContent, 'AT');
    const quickEmail = find('[data-facility-outreach]');
    assert.equal(quickEmail.hidden, false);
    quickEmail.click();
    const drafts = find('[data-facility-outreach-list]');
    const draftStatus = find('[data-facility-outreach-status]');
    await waitFor(() => drafts.children.length === 5, 'Quick Email did not prepare individual drafts');
    assert.match(draftStatus.textContent, /5 individual drafts ready. No email sent./);
    const draftLinks = [...drafts.querySelectorAll('a')].map(link => new URL(link.href));
    assert.equal(new Set(draftLinks.map(link => decodeURIComponent(link.pathname))).size, 5);
    assert.equal(decodeURIComponent(draftLinks[0].pathname), 'sbowling@limestonehf.com');
    assert.ok(draftLinks.every(link => link.protocol === 'mailto:' && !link.searchParams.has('cc') && !link.searchParams.has('bcc')));
    assert.match(draftLinks[1].searchParams.get('body'), /Hi Aleshia,.*Director of Nursing/s);
    assert.match(drafts.textContent, /AI draft/);
    const formBody = drafts.querySelector('textarea');
    formBody.value = 'Reviewed message';
    formBody.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(new URL(drafts.querySelector('a').href).searchParams.get('body'), 'Reviewed message');
    const focus = find('[data-facility-review-focus]');
    focus.value = 'family-visits';
    focus.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.match(find('[data-facility-review-example]').textContent, /visiting hours/);
    assert.match(find('[data-facility-review-question]').textContent, /families to get oriented/);
    assert.equal(find('[data-facility-review-draft]').hidden, false);
    find('[data-facility-review-draft]').click();
    await waitFor(() => draftStatus.textContent.includes('Focus · Family visits and contacts'), 'Review focus did not reach the draft composer');
    assert.match(drafts.querySelector('textarea').value, /families to get oriented/);
    assert.doesNotMatch(drafts.querySelector('textarea').value, /Fixture Reviewer|questions about visiting hours/);
    assert.equal((await owner.api('bootstrap')).offices.length, before + 1);
    const reviewedDraft = drafts.querySelector('textarea').value;
    drafts.querySelector('[data-open-workspace-email]').click();
    assert.equal(profile.open, false);
    assert.equal(pageDocument.querySelector('[data-tab-panel="email"]').hidden, false);
    const email = pageDocument.querySelector('[data-email-compose-form]');
    assert.equal(email.elements.to.value, 'sbowling@limestonehf.com');
    assert.equal(email.elements.body.value, reviewedDraft);
    assert.equal(email.querySelector('[data-email-send]').disabled, true);
    assert.equal(pageDocument.querySelector('#sales-identity, [data-mail-connect]'), null);
    assert.ok(pageDocument.querySelector('.sdr-topbar #sdr-header-search'));
    assert.ok(pageDocument.querySelector('.sdr-topbar #sales-logout'));
    const mailApi = async (action, data = {}) => owner.request('/api/sales/mail/v1', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
    const settings = await (await mailApi('rep-email-settings')).json();
    assert.equal(settings.mailbox.provider, 'zoho');
    assert.equal(settings.apiVersion, 1);
    assert.equal((await mailApi('login')).status, 404);
    assert.deepEqual((await owner.api('rep-email-drafts')).drafts, []);
    pageDocument.querySelector('[data-tab="prospects"]').click();
    listing.rows[1].querySelector('[data-open-facility-profile]').click();
    assert.equal(profile.open, true);
    assert.equal(reviewPane.open, false);
    assert.equal(reviewRating.textContent, '');
    assert.match(facts.textContent, /Certified beds75/);
    assert.match(facts.textContent, /52,000 sq ft/);
    assert.ok(facts.querySelector('a[href^="https://www.maxusconstruction.com/"]'));
    assert.equal(find('[data-facility-person="Aleshia Teeples"]'), null);
    assert.equal(quickEmail.hidden, true);
    close.click();
    listing.querySelector('form').requestSubmit();
    await waitFor(() => listing.querySelector('[data-open-facility]'), 'Administrator facility was not saved');
    const limestone = (await owner.api('bootstrap')).offices.find(row => /limestone/i.test(row.town));
    assert.equal(JSON.parse(limestone.notes).facilityAdministrator.name, 'Sherry Bowling');
    const saved = await waitFor(() => find(`[data-prospect-select="${limestone.id}"]`), 'Saved facility did not render in Prospects');
    saved.click();
    find('[data-prospect-action="facility-profile"]').click();
    assert.equal(profile.open, true);
    await waitFor(() => find('[data-facility-person="Aleshia Teeples"]'), 'Saved facility did not reload its leadership');
    const sourceURL = JSON.parse(limestone.notes).facilitySource;
    assert.equal((await differentProject.api('facility-reviews', { sourceURL, state: 'AL', category: 'nursing-home' })).status, 'unconfigured');
    await owner.api('facility-reviews', { sourceURL: 'https://example.test/different-office', state: 'AL', category: 'nursing-home' }, 404);
    const scratch = new DatabaseSync(join(root, 'workspace-data', 'workspace.sqlite'));
    try {
      scratch.prepare('INSERT INTO outreach_suppression(email) VALUES (?)').run('ateeples@limestonehf.com');
    } finally { scratch.close(); }
    const eligible = await owner.api('facility-outreach-drafts', { sourceURL, state: 'AL', category: 'nursing-home' });
    assert.equal(eligible.drafts.length, 4);
    assert.ok(eligible.drafts.every(draft => !draft.ai && draft.to !== 'ateeples@limestonehf.com'));
    close.click();
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
  await agentSession.api('facility-reviews', { state: 'AL', category: 'nursing-home', sourceURL: 'https://example.test/outside-territory' }, 403);
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
  const teamTab = name => pageDocument.querySelector(`[data-team-view="${name}"]`);
  const teamPane = name => pageDocument.getElementById(teamTab(name).getAttribute('aria-controls'));
  assert.equal(teamTab('roster').getAttribute('aria-selected'), 'true');
  assert.equal(teamPane('roster').hidden, false);
  assert.equal(teamPane('profile').hidden, true);
  assert.equal(teamPane('invite').hidden, true);
  assert.equal(teamPane('settings').hidden, true);
  teamTab('roster').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(pageDocument.activeElement, teamTab('profile'));
  assert.equal(teamPane('profile').hidden, false);
  assert.equal(teamPane('roster').hidden, true);
  teamTab('profile').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(pageDocument.activeElement, teamTab('settings'));
  assert.equal(teamTab('settings').getAttribute('aria-selected'), 'true');
  assert.equal(teamPane('settings').hidden, false);
  assert.equal(teamPane('profile').hidden, true);
  const publicContacts = await waitFor(() => teamPane('settings').querySelector('[data-team-app-help] #directory-support-form'),
    'Public app contact details did not mount in Workspace settings');
  const publicContactsSection = publicContacts.closest('details');
  const publicContactsSummary = publicContactsSection.querySelector('summary');
  assert.equal(publicContactsSummary.textContent, 'Public app contact details');
  publicContactsSummary.click();
  assert.equal(publicContactsSection.open, true);
  assert.ok(['roster', 'profile', 'invite'].every(name => !teamPane(name).contains(publicContacts)));
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
  const addRep = pageDocument.querySelector('#sales-team-add-rep');
  assert.equal(addRep.closest('[hidden]'), null);
  assert.match(addRep.textContent.trim(), /^Add sales rep$/);
  addRep.click();
  assert.equal(teamPane('invite').hidden, false);
  assert.equal(teamPane('settings').hidden, true);
  const ownerInvite = pageDocument.querySelector('#sales-create-agent');
  assert.equal(pageDocument.activeElement, ownerInvite.elements.name);
  const teamArtwork = pageDocument.querySelector('.sdr-team-hero img');
  assert.equal(teamArtwork.getAttribute('src'), '/sales-team-territory-planning.webp');
  const artworkResponse = await owner.request(teamArtwork.getAttribute('src'));
  assert.equal(artworkResponse.status, 200);
  assert.match(artworkResponse.headers.get('content-type'), /^image\/webp\b/);
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
  const peerSession = browserSession(first.origin);
  await peerSession.api('login', { email: peer.email, code: createdCode() });
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
  const juniorWindow = await mountConsole(t, first.origin, juniorSession, html);
  const juniorDocument = juniorWindow.document;
  await waitFor(() => !juniorDocument.querySelector('#sales-workspace').hidden, 'The rep console did not load');
  juniorDocument.querySelector('[data-tab="team"]').click();
  juniorDocument.querySelector('[data-team-view="profile"]').click();
  const profileForm = juniorDocument.getElementById('sales-team-profile');
  assert.equal(profileForm.closest('[role="tabpanel"]').hidden, false);
  await waitFor(() => !profileForm.elements.bio.disabled, 'The self-profile form did not load');
  assert.equal(profileForm.elements.name.value, juniorInput.name);
  assert.equal(profileForm.elements.email.value, juniorInput.email);
  const contact = { name: juniorInput.name, email: 'junior-work@example.test', phone: '+1 860 555 0142', bio: 'Hospital and senior care outreach' };
  for (const [key, value] of Object.entries(contact)) profileForm.elements[key].value = value;
  const mockFile = new juniorWindow.File(['portrait'], 'portrait.jpg', {type:'image/jpeg'});
  juniorWindow.SdrHeadshots.encode = async file => {
    assert.equal(file, mockFile);
    return portrait;
  };
  Object.defineProperty(profileForm.elements.headshot, 'files', {value:[mockFile]});
  profileForm.elements.headshot.dispatchEvent(new juniorWindow.Event('change', {bubbles:true}));
  await waitFor(() => profileForm.querySelector('[data-team-profile-preview]').getAttribute('src') === portrait &&
    !profileForm.elements.bio.disabled, 'The rep portrait did not preview');
  profileForm.requestSubmit();
  await waitFor(() => /Profile saved/.test(profileForm.textContent), 'The rep could not save their own contact details, bio and headshot');
  const { progress: initialProgress, ...savedProfile } = (await juniorSession.api('sales-team-profile')).profile;
  assert.deepEqual(savedProfile, { ...contact, photo: portrait, revision: 1 });
  assert.deepEqual(initialProgress, { level: 1, xp: 0, xpIntoLevel: 0, xpPerLevel: 100 });
  juniorDocument.querySelector('[data-team-view="roster"]').click();
  const rosterProfile = `[data-team-member-profile-open="${junior.agent.id}"]`;
  await waitFor(() => juniorDocument.querySelector(`${rosterProfile} img`)?.getAttribute('src') === portrait,
    'Saving the headshot did not refresh the roster');
  for (const [index, [name, facilityType]] of [
    ['Hartford Example Hospital', ''],
    ['Example Senior Residence', 'assisted-living'],
    ['Hartford Example Community Center', '']
  ].entries()) {
    await owner.api('create-office', {
      name, facilityType, state:'CT', city:'Hartford', address:`${30 + index} Example Street`, assignedTo:junior.agent.id
    });
  }
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
  const juniorMember = branch.members.find(member => member.id === junior.agent.id);
  assert.equal(juniorMember.canRevoke, true);
  assert.deepEqual(juniorMember.marketSegments.map(market => [market.label,market.count]),
    [['Community centers',1],['Hospitals',1],['Senior care',1]]);
  const hospital = await agentSession.api('territory-ownership', {state:'CT',query:'Hartford Example Hospital'});
  assert.equal(hospital.matches[0].market.label, 'Hospitals');
  assert.equal(hospital.matches[0].assignee, juniorInput.name);
  assert.equal(branch.members.find(member => member.id === trainee.agent.id).canRevoke, false);
  await agentSession.api('sales-team-revoke', { id: trainee.agent.id }, 403);
  await agentSession.api('sales-team-revoke', { id: peer.id }, 403);
  const agentWindow = await mountConsole(t, first.origin, agentSession, html);
  const agentDocument = agentWindow.document;
  for (let retry = 0; retry < 100 && agentDocument.querySelector('#sales-workspace').hidden; retry++) await delay(20);
  const agentNav = agentDocument.querySelector('[data-tab=team]');
  agentWindow.location.hash = 'view=team&section=settings';
  await waitFor(() => !agentDocument.querySelector('[data-tab-panel="team"]').hidden, 'The direct Sales team link did not open');
  const agentSettings = agentDocument.querySelector('[data-team-view="settings"]');
  assert.equal(agentSettings.hidden, true);
  assert.equal(agentDocument.getElementById('sales-team-pane-settings').hidden, true);
  assert.equal(agentDocument.querySelector('#directory-support-form'), null);
  agentSettings.click();
  assert.equal(agentDocument.querySelector('[data-team-view="roster"]').getAttribute('aria-selected'), 'true');
  const teammate = await waitFor(() => agentDocument.querySelector(rosterProfile), 'The report profile could not be opened from the roster');
  assert.equal(teammate.querySelector('img').getAttribute('src'), portrait);
  const repProgress = teammate.closest('[data-team-member]').querySelector('[data-team-xp]');
  assert.match(repProgress.textContent, /Level 1/);
  assert.equal(repProgress.querySelector('progress').value, 30);
  teammate.focus();
  teammate.click();
  const memberDialog = agentDocument.querySelector('[data-team-member-profile]');
  const memberDetails = memberDialog.querySelector('[data-team-member-profile-content]');
  await waitFor(() => memberDialog.open && !memberDetails.hidden, 'The report profile did not load');
  assert.equal(memberDialog.querySelector('[data-team-member-profile-title]').textContent, contact.name);
  for (const detail of [contact.bio, contact.email, contact.phone]) assert.ok(memberDetails.textContent.includes(detail));
  assert.equal(memberDetails.querySelector('img').getAttribute('src'), portrait);
  assert.equal(memberDialog.querySelector('[data-team-xp] progress').value, 30);
  memberDialog.querySelector('[data-team-member-profile-close]').click();
  assert.equal(memberDialog.open, false);
  await waitFor(() => agentDocument.activeElement === teammate, 'Closing the profile did not restore focus to the report');
  agentDocument.querySelector('#sales-team-territories').click();
  const scopedStatePicker = agentDocument.querySelector('#sales-territory-state');
  assert.deepEqual([...scopedStatePicker.options].filter(option => !option.disabled).map(option => option.value), ['', 'CT']);
  scopedStatePicker.value = 'CT';
  scopedStatePicker.dispatchEvent(new agentWindow.Event('change', { bubbles: true }));
  const capitolId = '09110';
  await waitFor(() => agentDocument.querySelector('[data-county-row="09110"]'), 'Team county roster did not load');
  const teamSelection = agentDocument.querySelector('[data-map-selection]');
  agentDocument.querySelector('[data-county-row="09190"]').click();
  await waitFor(() => /No sales rep currently assigned/.test(teamSelection.textContent), 'The out-of-scope county did not report its assignment status');
  assert.equal(teamSelection.querySelector('[data-county-assign]'), null);
  agentDocument.querySelector('[data-county-row="09110"]').click();
  assert.equal(agentDocument.querySelector('.county-lead-form'), null);
  const assignTeamCounty = await waitFor(() => teamSelection.querySelector('[data-county-assign]'), 'No assignment action for the team lead');
  assert.equal(assignTeamCounty.textContent, 'Assign county');
  assignTeamCounty.click();
  const teamCounty = await waitFor(() => agentDocument.querySelector('[data-county-editor] .county-lead-form'), 'Team assignment action did not open the county editor');
  const choices = [...teamCounty.elements.memberId.options].map(o => o.value);
  assert.ok(choices.includes(junior.agent.id) && choices.includes(trainee.agent.id) && !choices.includes(peer.id));
  teamCounty.elements.memberId.value = junior.agent.id;
  teamCounty.elements.memberId.dispatchEvent(new agentWindow.Event('change', { bubbles: true }));
  assert.ok(teamCounty.elements.photo.disabled, 'Linked rep headshots are managed in their own profile');
  assert.equal(teamCounty.querySelector('.county-rep-preview img').getAttribute('src'), portrait);
  teamCounty.requestSubmit();
  await waitFor(() => agentDocument.querySelector('[data-county-row="09110"]').textContent.includes(juniorInput.name), 'Team lead could not save a county assignment');
  assert.equal(agentDocument.querySelector('[data-county-row="09110"] img').getAttribute('src'), portrait);
  assert.match(teamSelection.textContent, /Hospitals · Example Junior \(1\)/);
  assert.match(teamSelection.textContent, /Senior care · Example Junior \(1\)/);
  const currentCounty = async () => (await owner.api('territory-ownership', {state:'CT',countyIds:[capitolId]})).counties[0];
  assert.equal((await currentCounty()).lead.photo, portrait);
  await juniorSession.api('set-sales-team-profile', {bio:'Updated bio', photo:'', revision:1});
  assert.equal((await currentCounty()).lead.photo, '');
  assert.equal((await currentCounty()).lead.revision, 1, 'Updating a profile does not rewrite the county assignment');
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
  const juniorRow = branchTree.querySelector('[data-team-member="' + junior.agent.id + '"]');
  assert.ok(juniorRow.querySelector(traineeRow));
  assert.match(juniorRow.textContent, /Senior care/);
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
  await t.test('sales reps exchange live channel messages across both CRM views', async t => {
    await browserSession(first.origin).api('chat-sync', {}, 401);
    await juniorSession.api('chat-create-channel', { name: 'Unavailable' }, 403);
    const ownerDoc = window.document;
    if (!ownerDoc.querySelector('#sales-detail-drawer').hidden) ownerDoc.querySelector('#sales-detail-close').click();
    ownerDoc.querySelector('[data-tab=chat]').click();
    assert.equal(ownerDoc.querySelector('[data-tab-panel=chat]').hidden, false);
    await waitFor(() => !ownerDoc.querySelector('#chat-compose textarea').disabled, 'Owner chat did not load');
    assert.deepEqual([...ownerDoc.querySelectorAll('#chat-channels button')].map(b => b.dataset.channel), ['general', 'field-notes', 'wins']);
    ownerDoc.querySelector('#chat-add').click();
    const create = ownerDoc.querySelector('#chat-create');
    create.elements.name.value = 'Deal Desk';
    create.elements.topic.value = 'Coordinate the next steps on deals.';
    create.requestSubmit();
    await waitFor(() => ownerDoc.querySelector('#chat-name').textContent === 'deal-desk' &&
      ownerDoc.querySelector('#chat-topic').textContent === 'Coordinate the next steps on deals.', 'Owner could not open the new channel');
    await owner.api('chat-create-channel', { name: '#deal-desk' }, 409);
    await differentProject.api('chat-sync', { channel: 'deal-desk' }, 404);

    const path = '/sales/senior-care';
    const rep = agentWindow, careRep = await mountConsole(t, first.origin, juniorSession,
      await (await juniorSession.request(path)).text(), path + '#view=chat&channel=deal-desk');
    const find = (win, selector) => win.document.querySelector(selector);
    const channelButton = (win, channel) => find(win, `#chat-channels [data-channel="${channel}"]`);
    function type(win, value) {
      const input = find(win, '#chat-compose textarea');
      input.value = value;
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
      return input;
    }
    find(rep, '[data-tab=chat]').click();
    await waitFor(() => channelButton(rep, 'deal-desk'), 'The new channel did not reach the rep');
    channelButton(rep, 'deal-desk').click();
    for (const win of [rep, careRep]) {
      await waitFor(() => find(win, '#chat-name').textContent === 'deal-desk' && !find(win, '#chat-compose textarea').disabled, 'Rep chat did not open');
      assert.equal(find(win, '#chat-add').hidden, true);
    }
    const message = 'Can someone cover Thursday’s call? <b>10 AM</b>';
    type(rep, message).dispatchEvent(new rep.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitFor(() => find(careRep, '.chat-body')?.textContent === message, 'The other rep did not receive the message live');
    assert.equal(find(careRep, '.chat-body b'), null);
    assert.equal(find(careRep, '.chat-byline strong').textContent, 'Example Agent');
    find(careRep, '.chat-byline button').click();
    assert.match(find(careRep, '#chat-reply').textContent, /Example Agent/);
    type(careRep, 'I can take it.');
    find(careRep, '#chat-compose').requestSubmit();
    await waitFor(() => find(rep, '.chat-quote') && find(rep, '#chat-messages').textContent.includes('I can take it.'), 'The original sender did not receive the reply');
    const received = await agentSession.api('chat-sync', { channel: 'deal-desk' });
    assert.deepEqual(received.messages.map(m => m.authorId), [agent.id, junior.agent.id]);
    assert.equal(received.messages[1].replyId, received.messages[0].id);
    const crossChannel = { channel: 'wins', body: 'A win', requestId: randomUUID(), replyTo: received.messages[0].id };
    await agentSession.api('chat-send', crossChannel, 404);
    const winMessage = { channel: 'wins', body: 'Booked a call.', requestId: randomUUID(), author: 'Wrong author' };
    const copies = await Promise.all([owner.api('chat-send', winMessage), owner.api('chat-send', winMessage)]);
    assert.equal(copies[0].id, copies[1].id);
    type(rep, 'Unfinished handoff');
    await waitFor(() => channelButton(rep, 'wins')?.querySelector('.chat-unread')?.textContent === '1', 'Unread count did not update');
    channelButton(rep, 'wins').click();
    await waitFor(() => find(rep, '.chat-body')?.textContent === 'Booked a call.', 'Channel switch did not load its own history');
    assert.equal(find(rep, '.chat-byline strong').textContent, 'Workspace owner');
    await waitFor(async () => (await agentSession.api('chat-sync')).channels.find(c => c.slug === 'wins').unread === 0, 'Reading the channel did not clear unread');
    channelButton(rep, 'deal-desk').click();
    assert.equal(find(rep, '#chat-compose textarea').value, 'Unfinished handoff');
    assert.equal(rep.location.hash, '#view=chat&channel=deal-desk');
    const reload = await mountConsole(t, first.origin, agentSession, html, '/sales' + rep.location.hash);
    await waitFor(() => find(reload, '#chat-messages')?.textContent.includes('I can take it.'), 'Reload lost the conversation');
    for (const win of [window, rep, careRep, reload]) find(win, '[data-tab=team]').click();
  });
  let privateRoom;
  await t.test('staff in separate reporting branches can exchange private direct messages', async t => {
    const people = (await agentSession.api('chat-people')).people;
    assert.deepEqual(Object.keys(people.find(person => person.id === peer.id)).sort(), ['id', 'name']);
    assert.ok(!people.some(person => person.id === agent.id));
    const path = '/sales/senior-care';
    const recipient = await mountConsole(t, first.origin, peerSession, await (await peerSession.request(path)).text(), path + '#view=chat');
    const mine = agentWindow.document, theirs = recipient.document;
    mine.querySelector('[data-tab=chat]').click();
    mine.querySelector('#chat-new-direct').click();
    const search = mine.querySelector('#chat-person-search');
    await waitFor(() => !search.disabled, 'Teammate search did not load');
    search.value = 'example peer';
    search.dispatchEvent(new agentWindow.Event('input'));
    assert.equal(mine.querySelectorAll('#chat-person-results button').length, 1);
    mine.querySelector('#chat-person-results button').click();
    const compose = mine.querySelector('#chat-compose');
    await waitFor(() => mine.querySelector('#chat-name').textContent === peer.name && !compose.elements.message.disabled, 'The private conversation did not open');
    privateRoom = '@' + new URLSearchParams(agentWindow.location.hash.slice(1)).get('dm');
    assert.ok(privateRoom.startsWith('@') && privateRoom.length > 30);
    assert.equal((await peerSession.api('chat-sync')).directs.length, 0);
    function send(win, body) {
      const form = win.document.querySelector('#chat-compose');
      form.elements.message.value = body;
      form.elements.message.dispatchEvent(new win.Event('input', { bubbles:true }));
      form.requestSubmit();
    }
    send(agentWindow, 'Are you free for a handoff?');
    const opener = await waitFor(() => theirs.querySelector('#chat-directs [data-channel] .chat-unread')?.parentElement, 'First message did not appear in the recipient inbox');
    assert.equal(opener.dataset.channel, privateRoom);
    opener.click();
    await waitFor(() => theirs.querySelector('.chat-body')?.textContent === 'Are you free for a handoff?', 'Recipient could not read the DM');
    theirs.querySelector('.chat-byline button').click();
    send(recipient, 'Yes, let’s talk.');
    await waitFor(() => mine.querySelector('.chat-quote') && mine.querySelector('#chat-messages').textContent.includes('Yes, let’s talk.'), 'Private reply did not arrive');
    const again = await peerSession.api('chat-direct-open', { memberId: agent.id });
    assert.equal(again.slug, privateRoom);
    const history = await agentSession.api('chat-sync', { channel: privateRoom });
    const firstId = history.messages[0].id;
    assert.equal(history.messages.length, 2);
    for (const stranger of [owner, juniorSession, differentProject]) {
      const inbox = await stranger.api('chat-sync');
      assert.ok(![...inbox.channels, ...inbox.directs].some(c => c.slug === privateRoom));
      for (const action of ['chat-sync', 'chat-history', 'chat-seen', 'chat-send']) {
        await stranger.api(action, { channel: privateRoom, before: firstId, through:firstId, body:'Blocked', requestId:randomUUID() }, 404);
      }
    }
    const reload = await mountConsole(t, first.origin, peerSession, html, '/sales' + recipient.location.hash);
    await waitFor(() => reload.document.querySelectorAll('.chat-message').length === 2, 'Reload lost the private conversation');
    for (const win of [agentWindow, recipient, reload]) win.document.querySelector('[data-tab=team]').click();
  });
  const signedOffice = await agentSession.api('office', { id });
  await agentSession.api('record-progress', { id, expectedRevision: signedOffice.pipeline.revision, requestId: randomUUID(), kind: 'replied', channel: 'email', note: 'Synthetic reply recorded.' });
  const { office: extraOffice } = await owner.api('create-office', { name: 'Extra XP Example Office', state: 'CT', city: 'Hartford', address: '99 Example Road', assignedTo: agent.id });
  const levelTwo = { level: 2, xp: 110, xpIntoLevel: 10, xpPerLevel: 100 };
  assert.deepEqual((await agentSession.api('bootstrap')).progress, levelTwo);
  assert.deepEqual((await agentSession.api('sales-team-profile')).profile.progress, levelTwo);
  assert.deepEqual((await owner.api('sales-team-member-profile', { id: agent.id })).profile.progress, levelTwo);
  assert.deepEqual((await owner.api('sales-team-read')).members.find(member => member.id === agent.id).progress, levelTwo);
  agentNav.click();
  agentDocument.querySelector('[data-team-view="profile"]').click();
  const ownProgress = agentDocument.querySelector('[data-team-profile-progress]');
  await waitFor(() => ownProgress.textContent.includes('Level 2') && ownProgress.querySelector('progress').value === 10,
    'Reopening the team did not refresh the rep’s own level and XP');
  const { date: planDate } = await agentSession.api('sales-daily-plan', { timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone });
  await agentSession.api('update-office', { id: String(extraOffice.id), nextFollowup: planDate });
  const start = Date.now(), appointmentId = randomUUID();
  const appointment = { id: appointmentId, host: agent.id, start, end: start + 30 * 60_000, status: 'confirmed',
    title: 'Fixture product demo', type: 'demo', zone: 'America/New_York', revision: 1,
    client: { name: 'Fixture client', company: 'Fixture Demo Facility', email: 'private@example.test' } };
  const fixtureDB = new DatabaseSync(join(root, 'workspace-data', 'workspace.sqlite'));
  try {
    fixtureDB.prepare('INSERT INTO bookings (id, host, request_key, start, end, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(appointmentId, agent.id, randomUUID(), start, appointment.end, appointment.status, JSON.stringify(appointment));
  } finally { fixtureDB.close(); }
  agentDocument.querySelector('[data-tab="today"]').click();
  const agentPlan = agentDocument.querySelector('[data-tab-panel="today"]');
  const followUp = await waitFor(() => [...agentPlan.querySelectorAll('[data-today-schedule] button')].find(button => button.textContent.includes(extraOffice.town)),
    'A recorded same-day follow-up did not appear on the rep’s schedule');
  assert.equal(followUp.querySelector('time').dateTime, planDate);
  assert.equal(agentPlan.querySelector('[data-today-metric="totalProspects"]').textContent, '2');
  const meeting = [...agentPlan.querySelectorAll('[data-today-schedule] button')].find(button => button.textContent.includes(appointment.title));
  assert.ok(meeting);
  assert.match(meeting.textContent, /30 min/);
  assert.equal(agentPlan.querySelector('[data-today-metric="meetingsSet"]').textContent, '1');
  meeting.click();
  await waitFor(() => agentDocument.querySelector('#bk-agenda').textContent.includes(appointment.title),
    'Opening the scheduled meeting did not show it on the rep’s calendar');
  agentDocument.querySelector('[data-tab="today"]').click();
  await waitFor(() => [...agentPlan.querySelectorAll('[data-today-schedule] button')].find(button => button.textContent.includes(extraOffice.town)),
    'The follow-up was not present when reopening Today').then(button => button.click());
  await waitFor(() => agentDocument.querySelector('#sales-detail-title').textContent === extraOffice.town,
    'The schedule entry did not open the real office');
  agentDocument.querySelector('#sales-detail-close').click();
  await agentSession.api('sales-team-revoke', { id: junior.agent.id });
  await juniorSession.api('chat-sync', { channel: 'deal-desk' }, 401);
  await traineeSession.api('chat-send', { channel: 'general', body: 'Blocked', requestId: randomUUID() }, 401);
  await juniorSession.api('bootstrap', {}, 401);
  await traineeSession.api('bootstrap', {}, 401);
  await traineeSession.api('login', { email: traineeInput.email, code: trainee.code }, 401);
  await owner.api('revoke-agent', { id: agent.id });
  await agentSession.api('bootstrap', {}, 401);
  await agentSession.api('chat-sync', { channel: privateRoom }, 401);
  assert.equal((await peerSession.api('chat-sync', { channel: privateRoom })).peer.active, false);
  await peerSession.api('chat-send', { channel: privateRoom, body: 'Inactive', requestId: randomUUID() }, 409);
  const replacement = await owner.api('sales-team-invite', { ...traineeInput, parentId: peer.id });
  assert.notEqual(replacement.agent.id, trainee.agent.id);
  const replacementSession = browserSession(first.origin);
  await replacementSession.api('login', { email: traineeInput.email, code: replacement.code });
  await owner.api('sales-team-revoke', { id: peer.id });
  await replacementSession.api('bootstrap', {}, 401);

  await t.test('the care workspace presents the hospital and stroke boards under Demo', async t => {
    const path = '/sales/senior-care';
    const before = await owner.api('bootstrap');
    const careWindow = await mountConsole(t, first.origin, owner, await (await owner.request(path)).text(), path);
    const doc = careWindow.document;
    const panel = doc.querySelector('[data-tab-panel="demo"]');
    const find = part => panel.querySelector(`[data-demo-${part}]`);
    const tile = label => [...find('tiles').children].find(button => button.lastElementChild.textContent === label);
    const spoken = [];
    careWindow.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    careWindow.speechSynthesis = { getVoices: () => [], cancel() {}, speak: utterance => spoken.push(utterance.text) };

    await waitFor(() => !doc.querySelector('#sales-workspace').hidden, 'The signed-in demo entrypoint did not open');
    assert.ok(panel.hidden);
    assert.equal(doc.querySelector('.sdr-sidebar [data-tab="demo"]'), null);
    doc.querySelector('.sdr-sidebar [data-tab="team"]').click();
    const demoTool = doc.querySelector('[data-team-tools] [data-tab="demo"]');
    assert.equal(demoTool.closest('[hidden]'), null);
    demoTool.click();
    assert.equal(panel.closest('[data-team-workspace]').hidden, false);
    await waitFor(() => !panel.hidden, 'The locations lobby did not open');
    for (const id of ['hospital','nursing-home','senior-center','townhall','directory','college','airport','stroke']) {
      assert.ok(panel.querySelector('[data-care-launch="' + id + '"]'), id);
    }
    for (const [venue, room] of [['hospital','reception'], ['nursing-home','resident-room'], ['senior-center','transportation']]) {
      const entry = await owner.request('/demo/' + venue, { redirect: 'manual' });
      assert.equal(entry.headers.get('location'), '/sales/senior-care#view=demo&venue=' + venue + '&present=1');
      careWindow.location.hash = 'view=demo&venue=' + venue;
      await waitFor(() => panel.querySelector('.cf-room-card[data-room="' + room + '"]'), 'Facility room missing: ' + room);
      const voice = panel.querySelector('[data-care-voice]');
      assert.equal(voice.hidden, false);
      assert.equal(voice.open, false);
      const voiceForm = voice.querySelector('form');
      assert.equal(voiceForm.elements.setting.value, { hospital: 'bedside', 'nursing-home': 'nursing', 'senior-center': 'senior' }[venue]);
      assert.equal(voiceForm.elements.words.value, '');
      voice.open = true;
      voiceForm.elements.words.value = venue === 'senior-center' ? 'Would you like to take a shuttle?' : 'Would you like some water?';
      voiceForm.requestSubmit();
      assert.match(voice.querySelector('[data-training-voice-choices]').textContent, venue === 'senior-center' ? /ride|schedule/ : /water|drink/);
      panel.querySelector('.cf-room-card[data-room="' + room + '"]').click();
      panel.querySelector('.cf-tile').click();
      assert.match(panel.querySelector('.cf-history summary').textContent, /1/);
    }
    careWindow.location.hash = 'view=demo&venue=hospital';
    const tourAction = text => [...panel.querySelectorAll('[data-care-tour] button')].find(b => b.textContent === text);
    await waitFor(() => panel.querySelector('[data-room="discharge"]'), 'Presenter did not reach the hospital directory');
    tourAction('Start guided demo').click();
    await waitFor(() => panel.querySelector('.cf-tile'), 'Presenter did not open admissions');
    panel.querySelector('.cf-tile').click();
    tourAction('Next step').click();
    assert.match(panel.querySelector('.cf-history summary').textContent, /1/);
    tourAction('Next step').click();
    assert.match(panel.querySelector('.cf-room-head').textContent, /Discharge/);
    tourAction('Discuss a pilot').click();
    tourAction('Open pilot planner').click();
    await waitFor(() => panel.querySelector('[data-care-plan] a[href="https://tinkytown.com/start.html?intent=pilot"]'), 'Planner missing pilot request form');
    const pilot = panel.querySelector('[data-care-plan]');
    assert.equal(pilot.hidden, false);
    const lead = pilot.querySelector('input[placeholder="Role or team"]');
    lead.value = 'Practice admissions team';
    lead.dispatchEvent(new careWindow.Event('input', {bubbles: true}));
    panel.querySelector('[data-care-plan-toggle]').click();
    await waitFor(() => pilot.hidden, 'Planner did not return to the live demo');
    panel.querySelector('[data-care-plan-toggle]').click();
    await waitFor(() => !pilot.hidden, 'Planner could not reopen');
    assert.equal(pilot.querySelector('input[placeholder="Role or team"]').value, 'Practice admissions team');

    careWindow.location.hash = 'view=demo&venue=townhall';
    await waitFor(() => panel.querySelector('.cl-board-title'), 'Hartford Town Hall did not load');
    assert.equal(panel.querySelector('[data-care-voice]').hidden, true);
    assert.match(panel.querySelector('.cl-header h3').textContent, /Hartford/);
    careWindow.location.hash = 'view=demo&venue=home';
    await waitFor(() => panel.querySelector('.care-library [data-tile]') || panel.querySelector('[aria-label="TinkySpeak board library"] [data-tile]'), 'Family board did not load');
    careWindow.location.hash = 'view=demo&venue=college';
    await waitFor(() => panel.querySelector('.care-kiosk-tile[data-board-target="uni_academics"]'), 'Campus boards did not open');
    panel.querySelector('.care-kiosk-tile[data-board-target="uni_academics"]').click();
    assert.notEqual(panel.querySelector('[data-board] select').value, 'main');
    careWindow.location.hash = 'view=demo&venue=stroke&mode=boards';
    await waitFor(() => !find('session').hidden, 'The exported demo boards did not load');
    assert.equal(find('setting').textContent, 'Nursing home');
    assert.equal(find('board-picker').options.length, 19);
    tile('BLANKET').click();
    assert.equal(find('message').textContent, "Can I have a blanket? I'm cold.");
    assert.equal(spoken.at(-1), find('message').textContent);
    find('save').click();
    find('board-picker').value = 'saved_phrases';
    find('board-picker').dispatchEvent(new careWindow.Event('change'));
    tile('BLANKET').click();
    find('next').click();
    tile('No').click();
    assert.equal(find('message').textContent, 'No');

    find('scenarios').querySelector('[data-setting="hospital-ward"]').click();
    find('next').click();
    tile('HEAD').click();
    find('next').click();
    tile('5').click();
    assert.match(find('pain').textContent, /HEAD · 5\/10/);
    find('scan').click();
    const scanning = find('tiles').querySelector('[data-scanning]');
    assert.ok(scanning);
    find('tiles').dispatchEvent(new careWindow.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    assert.equal(find('message').textContent, 'I have no pain right now.');
    find('tiles').dispatchEvent(new careWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(find('scan').getAttribute('aria-pressed'), 'false');

    panel.querySelector('[data-demo-product="hospital"]').click();
    assert.equal(find('board-title').textContent, 'Reception kiosk');
    tile('I AM IN PAIN').click();
    assert.equal(find('board-title').textContent, 'Pain assessment');
    tile('5 - DISTRACTING').click();
    assert.equal(find('message').textContent, 'My pain is a five. Hard to ignore.');
    find('back').click();
    assert.ok(tile('WATER'));
    find('reset').click();
    assert.equal(find('history').children.length, 0);

    const main = await mountConsole(t, first.origin, owner, await (await owner.request('/sales')).text(), '/sales#view=demo&product=hospital');
    await waitFor(() => !main.document.querySelector('[data-demo-session]').hidden, 'Hospital direct link did not open in the main workspace');
    assert.equal(main.document.querySelector('[data-demo-board-title]').textContent, 'Reception kiosk');
    assert.equal(main.document.querySelector('[data-tab="demo"]').getAttribute('aria-pressed'), 'true');
    main.document.querySelector('[data-tab="home"]').click();
    main.location.hash = 'view=demo&product=stroke&setting=rehab';
    await waitFor(() => !main.document.querySelector('[data-tab-panel="demo"]').hidden &&
      main.document.querySelector('[data-demo-setting]').textContent === 'Rehab', 'Rehab direct link did not reopen Demo from Overview');
    const after = await owner.api('bootstrap');
    assert.deepEqual(after.offices, before.offices);
    assert.deepEqual(after.contracts, before.contracts);
  });

  await t.test('senior-care and universal views share saved facilities and honor the active pipeline filter', async t => {
    const path = '/sales/senior-care';
    const carePage = await owner.request(path);
    assert.equal(carePage.status, 200);
    assert.ok(pageDocument.querySelector('a[href="/sales/senior-care"]'));
    assert.equal(pageDocument.querySelector('#care-directory-state'), null);
    const careWindow = await mountConsole(t, first.origin, owner, await carePage.text(), path);
    const care = careWindow.document;
    await waitFor(() => !care.querySelector('#sales-workspace').hidden, 'Care view did not reuse the signed-in session');
    assert.equal(care.querySelector('[data-tab-panel="today"]').hidden, false);
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
  assert.deepEqual((await reopen.api('chat-sync', { channel: 'deal-desk' })).messages.map(m => m.author), ['Example Agent', 'Example Junior']);
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

  await t.test('Sales team groups its tools and the Rolodex adds contacts in an empty workspace', async t => {
    const response = await differentProject.request('/sales');
    const contactsWindow = await mountConsole(t, other.origin, differentProject, await response.text(), '/sales#view=contacts');
    const doc = contactsWindow.document;
    const find = selector => doc.querySelector(selector);
    await waitFor(() => !find('[data-tab-panel="contacts"]').hidden, 'The Rolodex did not open');
    const rail = find('.sdr-nav');
    assert.deepEqual([...rail.querySelectorAll('[data-tab]')].map(button => button.dataset.tab),
      ['today', 'home', 'prospects', 'campaigns', 'pipeline', 'contracts', 'team', 'training', 'support']);
    assert.equal(rail.querySelector('[data-tab="team"]').getAttribute('aria-pressed'), 'true');
    const back = find('[data-team-return]');
    assert.equal(back.closest('[hidden]'), null);
    back.click();
    assert.equal(doc.activeElement, find('[data-team-tools] [data-tab="contacts"]'));
    for (const name of ['calendar', 'email', 'mail', 'locations', 'territories', 'chat', 'contacts']) {
      const button = find('[data-team-tools] [data-tab="' + name + '"]');
      assert.equal(button.closest('[hidden]'), null);
      button.click();
      assert.equal(find('[data-tab-panel="' + name + '"]').closest('[hidden]'), null);
      assert.equal(new URLSearchParams(contactsWindow.location.hash.slice(1)).get('view'), name);
      assert.equal(rail.querySelector('[data-tab="team"]').getAttribute('aria-pressed'), 'true');
      if (name !== 'contacts') back.click();
    }
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
