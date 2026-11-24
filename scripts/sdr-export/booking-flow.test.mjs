import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

async function waitFor(find, message) {
  for (let attempt = 0; attempt < 160; attempt++) { const value = find(); if (value) return value; await delay(25); }
  assert.fail(message);
}
async function withWorkspace(focus, run) {
  const scratch = mkdtempSync(join(tmpdir(), 'tinkytown-client-booking-'));
  const dataDir = join(scratch, 'private'), root = process.env.SDR_TEST_INSTALL || join(scratch, 'build');
  const doms = [];
  let child;
  try {
    if (!process.env.SDR_TEST_INSTALL) {
      execFileSync(process.execPath, ['scripts/sdr-export/export.mjs', root]);
      if (focus) {
        const file = join(root, 'workspace.json');
        writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), focus }));
      }
    }
    const reservation = createServer().listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port, origin = 'http://127.0.0.1:' + port;
    await new Promise(resolve => reservation.close(resolve));
    child = spawn(process.execPath, ['scripts/sdr-export/server.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'],
      env: { PATH: process.env.PATH, SDR_PORT: String(port), SDR_DATA_DIR: dataDir } });
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Booking server exited.'); })]);
    function session() {
      let cookie = '';
      const actions = [];
      async function call(path, opts = {}) {
        if (path === '/api/sales' && opts.body) actions.push(JSON.parse(opts.body));
        const response = await fetch(new URL(path, origin), { ...opts, headers: { ...opts.headers, origin, ...(cookie ? { cookie } : {}) } });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return response;
      }
      async function api(action, params = {}, expected = 200) {
        const r = await call('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...params }) });
        const result = await r.json(); assert.equal(r.status, expected, result.error); return result;
      }
      async function page(path) {
        const html = await call(path);
        assert.equal(html.status, 200);
        const dom = new JSDOM(await html.text(), { url: origin + path, runScripts: 'outside-only' }); doms.push(dom);
        const { window } = dom;
        window.fetch = call; window.confirm = () => true;
        window.HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
        window.HTMLDialogElement.prototype.close ??= function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
        for (const script of window.document.querySelectorAll('script[src]')) {
          const r = await call(script.getAttribute('src')); assert.equal(r.status, 200);
          window.eval(await r.text());
        }
        return window;
      }
      return { api, call, page, actions };
    }
    await run({ session, dataDir });
  } finally {
    for (const dom of doms) dom.window.close();
    if (child && child.exitCode === null && !child.signalCode) { const closed = once(child, 'exit'); child.kill('SIGTERM'); await closed; }
    rmSync(scratch, { recursive: true, force: true });
  }
}
test('a client books, moves and cancels a rep demo through the packaged public page and sales calendar', () =>
  withWorkspace(null, async ({ session, dataDir }) => {
    const owner = session(), rep = session(), client = session();
    await owner.api('login', { code: readFileSync(join(dataDir, 'owner-code'), 'utf8').trim() });
    const invite = await owner.api('sales-team-invite', { name: 'Example sales rep', email: 'rep@example.invalid' });
    const host = invite.agent.id;
    await rep.api('login', { code: invite.code, email: invite.agent.email });
    const staff = await rep.page('/sales'), d = staff.document;
    await waitFor(() => !d.querySelector('#sales-workspace').hidden, 'signed-in Overview');
    d.querySelector('[data-overview-action=calendar]').click();
    await waitFor(() => d.querySelector('#bk-settings [name=name]').value === invite.agent.name, 'rep calendar');
    d.querySelector('[data-bk-view=hours]').click();
    const settings = d.querySelector('#bk-settings');
    settings.elements.published.checked = true;
    settings.elements.location.value = 'https://video.example.invalid/demo';
    settings.elements.question.value = 'What would you like to see?';
    settings.requestSubmit();
    await waitFor(() => d.querySelector('#bk-staff-status').textContent === 'Availability saved.', 'published availability');
    d.querySelector('[data-bk-view=agenda]').click();
    assert.equal(d.querySelector('#bk-public-link').pathname + d.querySelector('#bk-public-link').search, '/book?rep=' + host);
    const guest = await client.page('/book?rep=' + host), g = guest.document;
    await waitFor(() => !g.querySelector('#bk-picker').hidden, 'rep-specific booking form');
    assert.equal(g.querySelector('#bk-rep').value, host);
    g.querySelector('#bk-types [value=demo]').click();
    async function timeButtons() {
      await waitFor(() => !g.querySelector('#bk-message').textContent, 'loaded monthly availability');
      if (!g.querySelector('[data-start]')) {
        g.querySelector('#bk-choose [data-next]').click();
        await waitFor(() => g.querySelector('[data-start]'), 'available days next month');
      }
      return [...g.querySelectorAll('[data-start]')];
    }
    const [time] = await timeButtons(); time.click();
    const intake = g.querySelector('#bk-intake');
    intake.elements.name.value = 'Example client'; intake.elements.email.value = 'client@example.invalid';
    intake.elements.company.value = 'Example office'; intake.elements.answer.value = 'The team calendar';
    intake.requestSubmit();
    await waitFor(() => g.querySelector('#bk-receipt-title').textContent === 'Booking confirmed', 'confirmed client appointment');
    const privatePath = guest.location.pathname + guest.location.hash;
    const manage = new URLSearchParams(guest.location.hash.slice(1)).get('manage');
    assert.ok(manage); assert.equal(g.querySelector('#bk-receipt-info a').href, settings.elements.location.value);
    d.querySelector('#bk-refresh').click();
    await waitFor(() => d.querySelector('#bk-agenda details summary')?.textContent.includes('Product demo · Example client'), 'rep sees client demo');
    assert.match(d.querySelector('#bk-agenda details').textContent, /The team calendar/);
    const state = await rep.api('booking-dashboard'); assert.equal(state.entries.length, 1);
    assert.equal((await rep.api('bootstrap')).nextBooking.start, Number(time.dataset.start));
    const button = (doc, text) => [...doc.querySelectorAll('#bk-receipt-actions button')].find(el => el.textContent === text);
    button(g, 'Reschedule').click();
    const newTime = (await timeButtons()).find(el => el.dataset.start !== time.dataset.start); newTime.click(); intake.requestSubmit();
    await waitFor(() => !g.querySelector('#bk-receipt').hidden, 'rescheduled confirmation');
    assert.equal((await rep.api('booking-dashboard')).entries[0].start, Number(newTime.dataset.start));
    const revisit = await client.page(privatePath);
    await waitFor(() => button(revisit.document, 'Cancel appointment'), 'return from private link');
    button(revisit.document, 'Cancel appointment').click();
    await waitFor(() => revisit.document.querySelector('#bk-receipt-title').textContent === 'Booking cancelled', 'cancellation');
    assert.equal((await rep.api('booking-dashboard')).entries[0].status, 'cancelled');
    assert.equal((await rep.api('bootstrap')).nextBooking, null);
    const month = new Date(Number(newTime.dataset.start)).toISOString().slice(0, 7);
    const openings = await (await client.call('/api/booking/slots?host=' + host + '&type=demo&zone=UTC&month=' + month)).json();
    assert.ok(Object.values(openings.days).flat().includes(Number(newTime.dataset.start)));
    assert.equal((await client.call('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'booking-dashboard', host }) })).status, 401);
    assert.ok((await (await client.call('/book/api')).text()).includes('X-Booking-Signature'));
  }));

test('reps use Campaigns for guides and materials, facility records for pilots, and the calendar for demos', () =>
  withWorkspace('senior-care', async ({ session, dataDir }) => {
    const owner = session(), rep = session(), client = session();
    await owner.api('login', { code: readFileSync(join(dataDir, 'owner-code'), 'utf8').trim() });
    const invite = await owner.api('sales-team-invite', { name: 'Example rep', email: 'rep@example.invalid' });
    await rep.api('login', { code: invite.code, email: invite.agent.email });
    const { office } = await rep.api('create-office', { name: 'Example Care', address: '12 Test Way', city: 'Hartford', state: 'CT', facilityType: 'nursing-home' });
    const admin = await owner.page('/sales#view=campaigns');
    await waitFor(() => !admin.document.querySelector('[data-care-campaign]').hidden, 'owner campaign landing');
    const settings = admin.document.querySelector('.cc-outreach');
    assert.equal(settings.hidden, false);
    settings.querySelector('summary').click();
    assert.ok(settings.open && settings.querySelector('#sales-campaign-form'));

    const w = await rep.page('/sales/senior-care#view=campaigns&topic=benefits');
    const d = w.document, el = selector => d.querySelector(selector);
    await waitFor(() => !el('[data-care-campaign]').hidden, 'rep campaign landing');
    assert.equal(el('.sdr-nav [data-tab="campaigns"]').hidden, false);
    assert.equal(el('.cc-outreach').hidden, true);
    assert.equal(el('#cc-tab-benefits').getAttribute('aria-selected'), 'true');
    assert.doesNotMatch(el('[data-care-campaign]').textContent, /Ready to Bring|Start a Pilot|Schedule a Demo/);
    assert.equal(el('[data-care-campaign] a[href^="/book"]'), null);
    assert.equal(el('[data-care-campaign] [download]').closest('[role="tabpanel"]').id, 'cc-topic-materials');
    assert.equal(rep.actions.some(r => r.action === 'campaign-read'), false);
    await rep.api('campaign-read', {}, 403);
    const search = el('#sdr-header-search input');
    search.value = 'worksheet';
    el('#sdr-header-search').requestSubmit();
    const result = el('[data-cc-search-results] button');
    assert.equal(result.textContent, 'Sales Materials');
    result.click();
    assert.equal(el('#cc-topic-materials').hidden, false);
    w.history.back();
    await waitFor(() => !el('#cc-topic-benefits').hidden, 'Back to previous topic');
    el('#cc-tab-benefits').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(d.activeElement, el('#cc-tab-materials'));
    const kit = await client.call(el('#cc-topic-materials a[download]').pathname);
    assert.equal(kit.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await kit.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

    el('.sdr-nav [data-tab="pipeline"]').click();
    el('[data-office="' + office.id + '"]').click();
    const form = await waitFor(() => el('#sales-activity'), 'facility follow-up form');
    form.elements.kind.value = 'care_pilot';
    form.elements.kind.dispatchEvent(new w.Event('change'));
    assert.equal(form.elements.note.disabled, true);
    for (const [key, value] of Object.entries({ unit: 'Activities', start: '2027-02-01', coordinator: 'Unit lead', goal: 'Count choices at lunch.' })) form.elements.namedItem(key).value = value;
    form.requestSubmit();
    await waitFor(() => el('#sales-detail .sales-event') && el('#sales-detail').textContent.includes('Count choices at lunch.'), 'pilot in facility history');
    const written = rep.actions.find(body => body.action === 'start-care-pilot');
    assert.ok(written);
    await rep.api('start-care-pilot', written);
    await rep.api('start-care-pilot', { ...written, goal: 'Different measure' }, 409);
    await rep.api('start-care-pilot', { ...written, start: '2027-02-30' }, 400);
    await client.api('start-care-pilot', written, 401);
    const outside = await owner.api('create-office', { name: 'Another facility', address: '38 Test Avenue', city: 'Hartford', state: 'CT' });
    await rep.api('start-care-pilot', { ...written, id: outside.office.id }, 404);
    const record = await owner.api('office', { id: written.id });
    assert.equal(record.events.filter(row => JSON.parse(row.notes).action === 'care_pilot').length, 1);
    assert.equal(JSON.parse(record.office.notes).facilityType, 'nursing-home');
    assert.equal(el('#sales-activity').elements.note.disabled, false);
    assert.doesNotMatch(search.placeholder, /sales guides/);

    el('#sales-detail-close').click();
    el('.sdr-nav [data-tab="team"]').click();
    el('[data-team-tools] [data-tab="calendar"]').click();
    await waitFor(() => !el('[data-tab-panel="calendar"]').hidden, 'calendar in Sales team');
    const booking = (await client.page('/book?type=demo')).document;
    await waitFor(() => !booking.querySelector('#bk-picker').hidden, 'demo booking picker');
    assert.equal(booking.querySelector('#bk-types input:checked').value, 'demo');
    assert.equal(booking.querySelectorAll('#bk-types input').length, 1);
    const unavailable = (await client.page('/book?rep=unpublished&type=demo')).document;
    await waitFor(() => unavailable.querySelector('#bk-message a'), 'unavailable linked rep');
    assert.ok(unavailable.querySelector('#bk-picker').hidden);
  }));
