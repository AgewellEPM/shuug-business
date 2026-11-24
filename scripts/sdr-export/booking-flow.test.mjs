import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
test('a client books, moves and cancels a rep demo through the packaged public page and sales calendar', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'tinkytown-client-booking-'));
  const dataDir = join(scratch, 'private'), root = process.env.SDR_TEST_INSTALL || join(scratch, 'build');
  const doms = [];
  let child;
  try {
    if (!process.env.SDR_TEST_INSTALL) execFileSync(process.execPath, ['scripts/sdr-export/export.mjs', root]);
    const reservation = createServer().listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port, origin = 'http://127.0.0.1:' + port;
    await new Promise(resolve => reservation.close(resolve));
    child = spawn(process.execPath, ['scripts/sdr-export/server.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'],
      env: { PATH: process.env.PATH, SDR_PORT: String(port), SDR_DATA_DIR: dataDir } });
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Booking server exited.'); })]);
    function session() {
      let cookie = '';
      async function call(path, opts = {}) {
        const response = await fetch(new URL(path, origin), { ...opts, headers: { ...opts.headers, origin, ...(cookie ? { cookie } : {}) } });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return response;
      }
      async function api(action, params = {}) {
        const r = await call('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...params }) });
        const result = await r.json(); assert.equal(r.status, 200, result.error); return result;
      }
      async function page(path) {
        const html = await call(path);
        assert.equal(html.status, 200);
        const dom = new JSDOM(await html.text(), { url: origin + path, runScripts: 'outside-only' }); doms.push(dom);
        const { window } = dom;
        window.fetch = call; window.confirm = () => true;
        for (const script of window.document.querySelectorAll('script[src]')) {
          const r = await call(script.getAttribute('src')); assert.equal(r.status, 200);
          window.eval(await r.text());
        }
        return window;
      }
      return { api, call, page };
    }
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
  } finally {
    for (const dom of doms) dom.window.close();
    if (child && child.exitCode === null && !child.signalCode) { const closed = once(child, 'exit'); child.kill('SIGTERM'); await closed; }
    rmSync(scratch, { recursive: true, force: true });
  }
});
