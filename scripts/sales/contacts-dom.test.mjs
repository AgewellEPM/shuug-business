import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createHandler } from '../../sales/handler.mjs';
import { contactFixture } from './contact-fixture.mjs';

test('the shipped UI saves owners and staff, searches the Rolodex, sets a primary and archives/restores through its real handler', async () => {
  const f = contactFixture(), office = await f.createOffice();
  const handler = createHandler(f.env, f.db), calls = [];
  let cookie = '';
  function browser() {
    const dom = new JSDOM(readFileSync('deployments/rideshare-tax-pros/.vercel/output/static/sales.html', 'utf8'), { url: 'https://gigtax.pro/sales', runScripts: 'outside-only' });
    const w = dom.window;
    w.fetch = async (_url, options) => {
      let data, code;
      await handler({ method: 'POST', headers: { origin: f.env.GIGTAX_SALES_ORIGIN, 'content-type': 'application/json', cookie }, body: options.body }, {
        statusCode: 200, setHeader(name, value) { if (name === 'Set-Cookie') cookie = value.split(';')[0]; },
        end(body) { code = this.statusCode; data = JSON.parse(body); },
      });
      calls.push({ action: JSON.parse(options.body).action, code });
      return { ok: code < 400, status: code, json: async () => data };
    };
    for (const file of ['sales-contacts.js', 'sales-workflows.js', 'sales.js']) w.eval(readFileSync(`public/rideshare-tax-pros/${file}`, 'utf8'));
    return { w, d: w.document, close: () => w.close() };
  }
  const wait = async condition => { for (let i = 0; i < 160; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Contact UI did not reach the expected state: ' + JSON.stringify(calls.slice(-4))); };
  const submit = (w, form) => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  let b = browser();
  try {
    await wait(() => b.d.querySelector('#sales-login-form'));
    const login = b.d.querySelector('#sales-login-form'); login.elements.code.value = f.code; submit(b.w, login);
    await wait(() => !b.d.querySelector('#sales-workspace').hidden);
    b.d.querySelector('[data-tab="contacts"]').click();
    assert.equal(b.d.querySelector('[data-tab-panel="contacts"]').hidden, false);
    b.d.querySelector('[data-contact-office]').click();
    await wait(() => b.d.querySelector('[data-add-owner]'));
    b.d.querySelector('[data-add-owner]').click();
    let form = b.d.querySelector('#sales-contact-form');
    assert.equal(form.elements.role.value, 'owner');
    for (const [key, value] of Object.entries({ name: 'Synthetic <Owner>', email: 'owner@example.test', phone: '+1 860 555 0100', sourceURL: 'https://example.test/team', sourceNote: 'Synthetic published owner identity.' })) form.elements[key].value = value;
    form.elements.reviewed.checked = true; submit(b.w, form);
    await wait(() => b.d.querySelector('[data-edit-contact]') && !b.d.querySelector('#sales-contact-form'));
    assert.equal(b.d.querySelector('#sales-office-contacts h4').textContent, 'Synthetic <Owner>');
    assert.equal(b.d.querySelector('#sales-office-contacts owner'), null);
    assert.match(b.d.querySelector('.sdr-contact-evidence').textContent, /source checked/);
    b.d.querySelector('[data-add-contact]').click(); form = b.d.querySelector('#sales-contact-form');
    form.elements.name.value = 'Synthetic Manager'; form.elements.role.value = 'manager'; form.elements.preference.value = 'do_not_contact';
    submit(b.w, form);
    await wait(() => b.d.querySelectorAll('#sales-office-contacts [data-edit-contact]').length === 2);
    const manager = [...b.d.querySelectorAll('#sales-office-contacts .sdr-contact-card')].find(c => c.textContent.includes('Synthetic Manager'));
    assert.equal(manager.querySelector('a[href^="mailto:"]'), null);
    manager.querySelector('[data-primary-contact]').click();
    await wait(() => b.d.querySelector('#sales-update-office').elements.contact.value === 'Synthetic Manager');
    assert.equal(b.d.querySelector('[data-open-email]'), null);
    assert.equal(b.d.querySelector('[data-save-draft]').disabled, true);
    b.d.querySelector('#sales-detail-close').click();
    const search = b.d.querySelector('[data-contact-search]'); search.value = 'owner@example.test'; search.dispatchEvent(new b.w.Event('input', { bubbles: true }));
    assert.equal(b.d.querySelectorAll('#sales-rolodex .sdr-contact-card').length, 1);
    assert.match(b.d.querySelector('#sales-rolodex .sdr-contact-card').textContent, /Synthetic <Owner>/);
    const filter = b.d.querySelector('[data-contact-filter]'); filter.value = 'owners'; filter.dispatchEvent(new b.w.Event('change', { bubbles: true }));
    assert.equal(b.d.querySelectorAll('#sales-rolodex .sdr-contact-card').length, 1);
    b.close(); b = browser();
    await wait(() => !b.d.querySelector('#sales-workspace').hidden);
    b.d.querySelector('[data-tab="contacts"]').click();
    assert.equal(b.d.querySelectorAll('#sales-rolodex .sdr-contact-card').length, 2, 'A fresh browser must read the saved contacts');
    b.d.querySelector('[data-contact-office]').click(); await wait(() => b.d.querySelector('[data-add-owner]'));
    const owner = [...b.d.querySelectorAll('#sales-office-contacts .sdr-contact-card')].find(c => c.textContent.includes('Synthetic <Owner>'));
    owner.querySelector('[data-archive-contact]').click();
    await wait(() => b.d.querySelector('[data-restore-contact]'));
    b.d.querySelector('[data-restore-contact]').click();
    await wait(() => b.d.querySelectorAll('#sales-office-contacts [data-edit-contact]').length === 2);
    assert.equal(f.rows.offices.length, 1); assert.equal(f.rows.agents.length, 0); assert.equal(f.rows.enrollments.length, 0);
    assert(calls.some(call => call.action === 'save-contact' && call.code === 200));
    assert(calls.every(call => !['invite', 'signup-accept', 'signup-confirm'].includes(call.action)));
  } finally { b.close(); }
});
