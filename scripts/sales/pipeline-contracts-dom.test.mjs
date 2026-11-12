import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { contactFixture } from './contact-fixture.mjs';
import { createHandler } from '../../sales/handler.mjs';
import { agreement } from '../../sales/terms.mjs';
import { metadata } from '../../sales/model.mjs';

test('shipped agent UI tracks contact/reply, prepares and records a contract send, and shows a payment-deferred owner signature on the location map', async () => {
  const f = contactFixture(), calls = [];
  const terms = agreement({ business: 'SYNTHETIC UI CONTRACT', cancellation: 'Synthetic test only. No actual agreement or payment.', approved: true });
  f.db.terms = async () => terms;
  const office = await f.createOffice({ contact: 'Synthetic Office Owner', email: 'owner@example.test', postalCode: '06103' });
  await f.app.dispatch(f.owner, 'verify-office', { id: office.id, finding: 'independent', reviewed: true, sourceURL: 'https://example.test/team', note: 'Synthetic ownership reviewed.' });
  const handler = createHandler(f.env, f.db);
  let ownerCookie = '', copied = '';
  function browser(page, url, authenticated = true) {
    const dom = new JSDOM(readFileSync(`deployments/rideshare-tax-pros/.vercel/output/static/${page}.html`, 'utf8'), { url, runScripts: 'outside-only' });
    const w = dom.window, d = w.document;
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
    w.fetch = async (_url, options) => {
      let status, result;
      const body = JSON.parse(options.body);
      await handler({ method: 'POST', headers: { origin: f.env.GIGTAX_SALES_ORIGIN, 'content-type': 'application/json', cookie: authenticated ? ownerCookie : '' }, body: options.body }, {
        statusCode: 200, setHeader(name, value) { if (name === 'Set-Cookie' && authenticated) ownerCookie = value.split(';')[0]; },
        end(value) { status = this.statusCode; result = JSON.parse(value); },
      });
      calls.push({ action: body.action, status, error: result.error });
      return { ok: status < 400, status, json: async () => result };
    };
    const files = page === 'sales' ? ['sales-contacts.js', 'sales-progress.js', 'sales-contracts.js', 'sales-console.js', 'sales-workflows.js', 'sales.js'] : ['contract-signature.js', 'sales.js'];
    for (const file of files) w.eval(readFileSync(`public/rideshare-tax-pros/${file}`, 'utf8'));
    return { w, d, close: () => w.close() };
  }
  const wait = async (condition, label) => { for (let i = 0; i < 250; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail(label + ': ' + JSON.stringify(calls.slice(-6))); };
  const submit = (w, form) => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const agent = browser('sales', 'https://gigtax.pro/sales'); let signer;
  try {
    const { w, d } = agent, login = d.querySelector('#sales-login-form');
    login.elements.code.value = f.code; submit(w, login); await wait(() => !d.querySelector('#sales-workspace').hidden, 'Owner sign-in');
    for (const tab of ['contracts', 'locations', 'mail']) assert(d.querySelector(`[data-tab="${tab}"]`));
    d.querySelector('[data-tab="pipeline"]').click(); d.querySelector('[data-console-office]').click();
    await wait(() => d.querySelector('#sales-progress-form'), 'Office progress form');
    let progress = d.querySelector('#sales-progress-form');
    progress.elements.kind.value = 'contacted'; progress.elements.channel.value = 'call'; progress.elements.note.value = 'Synthetic phone conversation with the office owner.';
    progress.elements.waitingOn.value = 'office'; progress.elements.nextAction.value = 'Wait for the owner callback'; submit(w, progress);
    await wait(() => metadata(f.rows.offices[0]).progress?.nextAction === 'Wait for the owner callback' && d.querySelector('#sales-office-progress')?.textContent.includes('call'), 'Contact record');
    progress = d.querySelector('#sales-progress-form'); progress.elements.kind.value = 'replied'; progress.elements.outcome.value = 'interested'; progress.elements.note.value = 'Synthetic owner replied and asked for an agreement.';
    progress.elements.waitingOn.value = 'us'; progress.elements.nextAction.value = 'Send the agreement'; submit(w, progress);
    await wait(() => f.rows.offices[0].status === 'interested' && d.querySelector('#sales-office-progress')?.textContent.includes('interested'), 'Reply record');
    d.querySelector('#sales-detail-close').click(); d.querySelector('[data-tab="mail"]').click();
    const mailbox = d.querySelector('#sales-mailbox-form'); mailbox.elements.name.value = 'Synthetic Shared Sales'; mailbox.elements.email.value = 'sales@example.test'; mailbox.elements.replyTo.value = 'sales@example.test'; mailbox.elements.approved.checked = true; submit(w, mailbox);
    await wait(() => d.querySelector('#sales-mailboxes').textContent.includes('Synthetic Shared Sales') && f.rows.agents.some(row => row.status === 'mailbox'), 'Shared sender');
    d.querySelector('[data-tab="pipeline"]').click(); d.querySelector('[data-console-office]').click();
    await wait(() => d.querySelector('#sales-invite'), 'Contract preparation');
    submit(w, d.querySelector('#sales-invite'));
    await wait(() => f.rows.enrollments.length === 1 && d.querySelector('#sales-contract-compose'), 'Prepared contract composer');
    const compose = d.querySelector('#sales-contract-compose'); compose.elements.senderId.value = String(f.rows.agents.find(row => row.status === 'mailbox').id); submit(w, compose);
    await wait(() => d.querySelector('[data-contract-email-reviewed]'), 'Exact contract email preview');
    assert.equal(d.querySelector('[data-contract-send]').disabled, true, 'Provider sending remains unavailable without configuration');
    assert(d.querySelector('[data-contract-open-email]').href.startsWith('mailto:owner%40example.test?'));
    assert.equal(f.rows.events.filter(row => metadata(row).delivery?.status === 'manual_sent').length, 0, 'A preview never fabricates a send');
    d.querySelector('[data-contract-email-reviewed]').checked = true; d.querySelector('[data-contract-send-evidence]').value = 'Synthetic test records an actual external-app send.';
    d.querySelector('[data-contract-manual-sent]').click();
    await wait(() => f.rows.events.some(row => metadata(row).delivery?.status === 'manual_sent') && d.querySelector('#sales-office-progress')?.textContent.includes('staff recorded'), 'Recorded manual send');
    d.querySelector('[data-contract-link]').click(); await wait(() => copied.includes('/office-signup#'), 'Private contract link');
    signer = browser('office-signup', copied, false);
    await wait(() => !signer.d.querySelector('#signup-record').hidden, 'Owner agreement page');
    assert.equal(signer.w.location.hash, '');
    const sign = signer.d.querySelector('#signup-form'); assert.equal(sign.querySelector('button').disabled, false, 'Signing works while payments are deferred');
    for (const name of ['accepted', 'authorized', 'independent', 'electronicConsent']) sign.elements[name].checked = true;
    sign.elements.signature.value = 'Synthetic Office Owner'; submit(signer.w, sign);
    await wait(() => !signer.d.querySelector('#signup-receipt').hidden, 'Signed agreement receipt');
    assert.match(signer.d.querySelector('#signup-receipt h3').textContent, /agreement is signed/);
    assert.equal(signer.d.querySelector('#signup-start-checkout').disabled, true);
    assert.equal(metadata(f.rows.enrollments[0]).signature, 'Synthetic Office Owner'); assert.equal(f.rows.offices[0].status, 'contract_signed');
    assert(!calls.some(call => ['signup-accept', 'signup-confirm'].includes(call.action)), 'Signing never initiates checkout or payment');
    d.querySelector('#sales-detail-close').click(); d.querySelector('#sales-refresh').click();
    await wait(() => d.querySelector('[data-console-stage="contract_signed"] .sdr-stage-count')?.textContent === '1', 'Signed conversion pipeline');
    d.querySelector('[data-tab="locations"]').click();
    assert.match(d.querySelector('[data-signup-location-count]').textContent, /1 signed office/);
    assert.match(d.querySelector('[data-signup-office-list]').textContent, /123 Example Street/);
    assert.match(d.querySelector('[data-signup-office-list]').textContent, /payment pending/);
    assert.equal(d.querySelector('svg[data-sales-signup-map] [data-state="CT"]').getAttribute('aria-label'), 'CT: 1 signed offices');
    d.querySelector('[data-tab="contracts"]').click(); assert.match(d.querySelector('#sales-contracts').textContent, /Signed · payment pending/);
    assert.equal(f.rows.offices[0].status, 'contract_signed');
  } finally { signer?.close(); agent.close(); }
});
