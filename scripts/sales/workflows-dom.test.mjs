import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createHandler } from '../../sales/handler.mjs';
import { digest, metadata, HttpError } from '../../sales/model.mjs';
import { agreement } from '../../sales/terms.mjs';

const origin = 'https://gigtax.pro';
const website = 'https://office.example.test/';
const clone = value => value === undefined ? undefined : structuredClone(value);
const localDay = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

function fixture() {
  const rows = { offices: [], agents: [], events: [], enrollments: [] };
  const requests = [], searches = [], researchCalls = [];
  const failSearches = new Set(), searchGates = new Map(), officeGates = new Map();
  let nextId = 1, cookie = '', support = null;
  const terms = agreement({ business: 'SYNTHETIC UI TEST ONLY', cancellation: 'Synthetic test only. No real agreement, enrollment or payment.', approved: true });
  const db = {
    list: async kind => clone(rows[kind]),
    get: async (kind, id) => { if (kind === 'offices' && officeGates.has(String(id))) await officeGates.get(String(id)).promise; return clone(rows[kind].find(row => String(row.id) === String(id))); },
    create: async (kind, body) => {
      const row = { ...clone(body), id: nextId++, created_at: new Date().toISOString() };
      rows[kind].push(row); return clone(row);
    },
    patch: async (kind, id, body) => {
      const row = rows[kind].find(row => String(row.id) === String(id));
      assert(row, 'The requested synthetic row must exist');
      Object.assign(row, clone(body)); return clone(row);
    },
    patchIfUnchanged: async (kind, id, expectedNotes, body) => {
      const row = rows[kind].find(row => String(row.id) === String(id));
      if (!row || (row.notes ?? null) !== expectedNotes) return { matched: false };
      return db.patch(kind, id, body);
    },
    terms: async () => clone(terms),
    support: async () => clone(support),
    setSupport: async value => { support = clone(value); },
    search: async query => [{ title: 'Possible official site for the synthetic office', url: website, snippet: `Confirm the office identity and location. ${query}` }],
    discover: async (state, city, { offset = 0, limit = 50 } = {}) => {
      searches.push({ state, city, offset, limit });
      if (failSearches.has(`${city}:${offset}`)) throw new HttpError(502, 'Synthetic directory unavailable.');
      if (searchGates.has(`${city}:${offset}`)) await searchGates.get(`${city}:${offset}`).promise;
      const candidates = Array.from({ length: 52 }, (_, index) => ({
        name: `Example <Tax> ${index + 1}`, title: `Example <Tax> ${index + 1}`,
        address: `${100 + index} Example Street`, city: 'Hartford', state: 'CT', zip: '06103',
        contact: `Directory Contact ${index + 1}`, phone: '+18602045588',
        url: 'https://www.irs.gov/pub/irs-efile/ct.zip', snippet: 'Synthetic directory contact; independent ownership needs verification.',
      }));
      return { results: candidates.slice(offset, offset + limit), offset, limit, total: candidates.length,
        hasMore: offset + limit < candidates.length, checkedAt: new Date().toISOString(), message: `Synthetic public-source candidates for ${city}. Verify ownership before inviting.` };
    },
  };
  const env = { GIGTAX_TINKY_KEY: 'synthetic', GIGTAX_SALES_SESSION_KEY: 'a'.repeat(64),
    GIGTAX_SALES_OWNER_HASH: digest('synthetic-workflow-owner'), GIGTAX_SALES_ORIGIN: origin };
  const researcher = async office => {
    researchCalls.push(clone(office));
    return { checkedAt: new Date().toISOString(),
      evidence: [
        { field: 'email', value: 'HELLO@OFFICE.EXAMPLE.TEST', sourceURL: `${website}contact`, excerpt: 'Published business email: hello@office.example.test', confidence: 'high' },
        { field: 'contact', value: 'Published Contact', sourceURL: `${website}about`, excerpt: 'Published Contact, office manager', confidence: 'medium' },
      ],
      ownership: { status: 'unverified', suggestedFinding: 'independent', requiresOwnerConfirmation: true,
        evidence: [{ sourceURL: `${website}about`, excerpt: 'The office describes itself as locally owned.' }] },
      proposedChanges: { email: 'hello@office.example.test' }, pages: [{ url: `${website}contact`, status: 'checked' }], issues: [],
    };
  };
  const handler = createHandler(env, db, { researcher });
  const dom = new JSDOM(readFileSync('deployments/rideshare-tax-pros/.vercel/output/static/sales.html', 'utf8'), { url: `${origin}/sales`, runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  w.fetch = async (url, options) => {
    assert.equal(String(url), '/api/sales', 'The workflow must not make external HTTP requests in this test');
    const body = JSON.parse(options.body);
    let result, status;
    await handler({ method: 'POST', headers: { origin, 'content-type': 'application/json', cookie }, body: options.body }, {
      statusCode: 200,
      setHeader(name, value) { if (name === 'Set-Cookie') cookie = value.split(';')[0]; },
      end(value) { status = this.statusCode; result = JSON.parse(value); },
    });
    requests.push({ action: body.action, status, error: result.error || '', body });
    return { ok: status >= 200 && status < 300, status, json: async () => clone(result) };
  };
  const submit = form => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const waitFor = async (condition, label) => {
    for (let attempt = 0; attempt < 250; attempt++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const failures = requests.filter(request => request.status >= 400 && request.action !== 'bootstrap').map(({ action, status, error }) => ({ action, status, error }));
    assert.fail(`${label}: ${d.querySelector('#sales-message')?.textContent || ''}; API failures: ${JSON.stringify(failures)}`);
  };
  return { rows, requests, searches, researchCalls, failSearches, searchGates, officeGates, w, d, submit, waitFor, close: () => w.close() };
}

test('private sales UI discovers, reviews sourced contacts, verifies ownership and saves drafts/follow-ups through the real handler', async () => {
  const f = fixture(), { w, d, rows, submit, waitFor } = f;
  try {
    for (const file of ['directory-admin.js', 'sales-research.js', 'sales-workflows.js', 'sales-console.js', 'sales.js']) w.eval(readFileSync(`public/rideshare-tax-pros/${file}`, 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(d.querySelector('#sales-workspace').hidden, true);
    const login = d.querySelector('#sales-login-form');
    login.elements.code.value = 'synthetic-workflow-owner'; submit(login);
    await waitFor(() => !d.querySelector('#sales-workspace').hidden, 'Owner sign-in should open the workspace');
    assert.equal(d.querySelector('[data-tab-panel="team"]').hidden, true);

    d.querySelector('[data-tab="discover"]').click();
    const discovery = d.querySelector('#sales-discover'); discovery.elements.city.value = 'Hartford'; discovery.elements.state.value = 'CT'; submit(discovery);
    await waitFor(() => d.querySelectorAll('[data-use-result]').length === 50, 'First discovery page should appear');
    assert.equal(d.querySelector('#sales-results-next').disabled, false);
    d.querySelector('#sales-results-next').click();
    await waitFor(() => d.querySelectorAll('[data-use-result]').length === 2, 'Next discovery page should appear');
    assert.deepEqual(f.searches.map(search => search.offset), [0, 50]);
    assert.match(d.querySelector('#sales-results-range').textContent, /51–52 of 52/);
    assert.equal(d.querySelector('#sales-results-next').disabled, true);
    d.querySelector('[data-use-result="0"]').click();
    const create = d.querySelector('#sales-create-office');
    assert.equal(create.elements.name.value, 'Example <Tax> 51');
    assert.equal(create.elements.postalCode.value, '06103');
    assert.equal(create.elements.independence.value, 'unverified');
    assert.equal(create.elements.email.value, '');
    submit(create);
    await waitFor(() => rows.offices.length === 1 && d.querySelector('#sales-research-form'), 'Candidate should be saved and selected');
    const officeId = rows.offices[0].id;
    assert.equal(metadata(rows.offices[0]).postalCode, '06103');
    assert.equal(metadata(rows.offices[0]).independence, 'unverified');
    assert.equal(d.querySelector('#sales-detail h2').textContent, 'Example <Tax> 51');
    assert.equal(d.querySelector('#sales-detail Tax'), null, 'Office text must stay escaped');
    assert.equal(d.querySelector('#sales-invite button').disabled, true);
    submit(d.querySelector('#sales-invite'));
    await waitFor(() => f.requests.some(request => request.action === 'invite' && request.status === 409), 'Unverified invitation request must be rejected');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(d.querySelector('#sales-invite button').disabled, true, 'A rejected request must preserve the disabled invitation gate');

    submit(d.querySelector('#sales-research-form'));
    await waitFor(() => d.querySelector('[data-research-website]'), 'Possible official websites should be offered');
    assert.equal(f.researchCalls.length, 0, 'Finding a possible website must not automatically read it');
    d.querySelector('[data-research-website]').click();
    assert.equal(d.querySelector('#sales-research-form').elements.website.value, website);
    submit(d.querySelector('#sales-research-form'));
    await waitFor(() => d.querySelector('.sales-research-review'), 'A sealed research review should be rendered');
    assert.equal(f.researchCalls.length, 1);
    assert.equal(d.querySelectorAll('.sales-research-review input[name="selected"]:checked').length, 0);
    const review = d.querySelector('.sales-research-review');
    review.querySelector('[data-research-field="email"]').checked = true;
    submit(review);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(rows.offices[0].contact_email, '', 'Unchecked review must prevent applying a proposal');
    assert.equal(f.requests.filter(request => request.action === 'apply-research').length, 0);
    review.elements.reviewed.checked = true; submit(review);
    await waitFor(() => rows.offices[0].contact_email === 'hello@office.example.test' && d.querySelector('#sales-update-office').elements.email.value === 'hello@office.example.test', 'Reviewed email should persist and rerender');
    assert.equal(metadata(rows.offices[0]).emailVerified, false, 'Importing a public address does not verify it');
    assert.equal(metadata(rows.offices[0]).independence, 'unverified');
    assert.equal(metadata(rows.offices[0]).researchSources.email.sourceURL, `${website}contact`);
    const apply = f.requests.find(request => request.action === 'apply-research');
    assert(apply.body.token && apply.body.reportId);
    assert.deepEqual(apply.body.selected, ['proposal-1']);
    assert.equal(apply.body.reviewed, true);
    assert.equal(apply.body.email, undefined, 'Only sealed proposal IDs should be sent back');

    const ownership = d.querySelector('.sales-ownership-verification');
    ownership.elements.finding.value = 'independent'; ownership.elements.sourceURL.value = `${website}about`;
    ownership.elements.note.value = 'Synthetic source explicitly describes the office as locally owned.'; ownership.elements.reviewed.checked = true; submit(ownership);
    await waitFor(() => metadata(rows.offices[0]).independenceVerification?.reviewed === true && !d.querySelector('#sales-invite button').disabled, 'Ownership proof should be stored before invitations become available');
    assert.equal(metadata(rows.offices[0]).independence, 'independent');
    assert.equal(rows.enrollments.length, 0, 'The test must not create or send an invitation');

    const checks = d.querySelector('.sales-contact-verification');
    checks.elements.contactRole.value = 'owner'; checks.elements.contactVerified.checked = true; checks.elements.emailVerified.checked = true;
    checks.elements.verificationSource.value = `${website}contact`; checks.elements.verificationNote.value = 'Synthetic contact role and business email were checked at the cited source.'; submit(checks);
    await waitFor(() => metadata(rows.offices[0]).contactVerified && metadata(rows.offices[0]).emailVerified && d.querySelector('.sales-contact-verification').elements.emailVerified.checked, 'Source checks should persist');
    assert.equal(metadata(rows.offices[0]).contactRole, 'owner');

    const compose = d.querySelector('.sales-compose-form');
    compose.elements.subject.value = 'Synthetic office conversation'; compose.elements.body.value = 'Synthetic UI test draft only. Nothing is sent.';
    compose.dispatchEvent(new w.Event('input', { bubbles: true }));
    d.querySelector('[data-save-draft]').click(); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(rows.events.filter(row => metadata(row).action === 'outreach_draft').length, 0, 'The explicit draft-review checkbox is required');
    compose.elements.draftReviewed.checked = true; d.querySelector('[data-save-draft]').click();
    await waitFor(() => rows.events.some(row => metadata(row).action === 'outreach_draft') && d.querySelector('.sales-compose-form').elements.body.value === 'Synthetic UI test draft only. Nothing is sent.' && !d.querySelector('.sales-compose-form').elements.draftReviewed.checked, 'Saved draft should be restored for review after refresh');
    const draftEvent = rows.events.find(row => metadata(row).action === 'outreach_draft');
    assert.equal(draftEvent.status, 'draft');
    assert.equal(metadata(draftEvent).detail.status, 'draft');
    assert.equal(metadata(draftEvent).detail.to, 'hello@office.example.test');
    assert.equal(rows.offices[0].status, 'new', 'Draft preparation must not mark the office contacted');
    assert(!rows.events.some(row => ['email', 'call', 'sent'].includes(metadata(row).action)), 'No communication outcome may be fabricated');
    assert(d.querySelector('[data-open-email]').href.startsWith('mailto:hello@office.example.test?'));
    assert.equal(d.querySelector('[data-contact-call]').getAttribute('href'), 'tel:+18602045588');

    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const followup = d.querySelector('.sales-quick-followup'); followup.elements.nextFollowup.value = localDay(yesterday); submit(followup);
    await waitFor(() => rows.offices[0].meeting_date === localDay(yesterday) && d.querySelector('[data-followup-office]'), 'Saved overdue date should populate the follow-up queue');
    assert.equal(d.querySelector('[data-followup-office]').dataset.followupOffice, String(officeId));
    assert.match(d.querySelector('.sales-followup-state').textContent, /Overdue/);

    const update = d.querySelector('#sales-update-office'); update.elements.stage.value = 'do_not_contact'; submit(update);
    await waitFor(() => rows.offices[0].status === 'do_not_contact' && d.querySelector('[data-save-draft]')?.disabled, 'Do-not-contact should suppress contact tools');
    assert.equal(d.querySelector('[data-open-email]'), null);
    assert.equal(d.querySelector('[data-contact-call]'), null);
    assert.equal(d.querySelector('[data-copy-draft]').disabled, true);
    assert.equal(d.querySelector('#sales-research-form'), null, 'Do-not-contact must pause the research UI too');
    assert.equal(d.querySelector('.sales-ownership-verification button').disabled, true);
    assert.equal(d.querySelector('[data-followup-office]'), null);
    const before = f.requests.filter(request => request.action === 'save-outreach-draft').length;
    d.querySelector('[data-save-draft]').dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.requests.filter(request => request.action === 'save-outreach-draft').length, before);
    assert.equal(rows.enrollments.length, 0);
    assert.equal(w.localStorage.length, 0); assert.equal(w.sessionStorage.length, 0);
  } finally { f.close(); }
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function signIn(f) {
  for (const file of ['directory-admin.js', 'sales-research.js', 'sales-workflows.js', 'sales-console.js', 'sales.js']) f.w.eval(readFileSync(`public/rideshare-tax-pros/${file}`, 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 10));
  const login = f.d.querySelector('#sales-login-form'); login.elements.code.value = 'synthetic-workflow-owner'; f.submit(login);
  await f.waitFor(() => !f.d.querySelector('#sales-workspace').hidden, 'Owner sign-in');
}
function seededOffice(id, name = `Synthetic Office ${id}`, info = {}) {
  return { id, town: name, locality: 'Hartford', state: 'CT', status: 'new', assigned_to: 'owner', contact_name: 'Synthetic Contact', contact_email: 'owner@office.example.test', contact_phone: '+18602045588', notes: JSON.stringify({ address: '100 Example Street', postalCode: '06103', website, independence: 'unverified', contactRole: 'unverified', contactVerified: false, emailVerified: false, ...info }) };
}

test('the rich console connects its Census map and board to the guarded office drawer without writing records', async () => {
  const f = fixture(), { w, d, waitFor } = f;
  f.rows.offices.push(seededOffice(40, 'Synthetic console office'));
  const original = clone(f.rows.offices);
  try {
    await signIn(f);
    assert.equal(d.querySelector('#sales-gate').hidden, true);
    assert.equal(d.querySelector('[data-tab-panel="home"]').hidden, false);
    assert.equal(d.querySelector('#sales-view-title').textContent, 'Overview');
    d.querySelector('[data-tab="territories"]').click();
    const paths = [...d.querySelectorAll('[data-sales-state-map] path[data-state]')];
    assert.equal(paths.length, 51);
    const connecticut = paths.find(path => path.dataset.state === 'CT');
    const shape = connecticut.getAttribute('d');
    connecticut.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(d.querySelector('#sales-discover').elements.state.value, 'CT');
    assert.equal(d.querySelector('[data-tab-panel="discover"]').hidden, false);
    assert.equal(connecticut.getAttribute('d'), shape, 'Map interactions preserve the real state boundary');
    d.querySelector('[data-tab="pipeline"]').click();
    assert.equal(d.querySelector('#sales-board').hidden, false);
    d.querySelector('[data-console-office="40"]').click();
    await waitFor(() => d.querySelector('#sales-detail h2')?.textContent === 'Synthetic console office', 'Board card opens the real office handler');
    assert.equal(d.querySelector('#sales-detail-drawer').hidden, false);
    assert.equal(d.querySelector('.sdr-main').inert, true);
    assert.equal(d.activeElement.id, 'sales-detail-close');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(d.querySelector('#sales-detail-drawer').hidden, true);
    assert.equal(d.querySelector('.sdr-main').inert, false);
    assert.equal(d.activeElement.closest('#sales-detail-drawer'), null);
    const slow = deferred(); f.officeGates.set('40', slow);
    d.querySelector('[data-console-office="40"]').click();
    d.querySelector('#sales-detail-close').click(); slow.resolve();
    await waitFor(() => f.requests.filter(request => request.action === 'office').length === 2, 'A closed drawer can finish its pending read');
    assert.equal(d.querySelector('#sales-detail-drawer').hidden, true, 'A late office response cannot reopen a closed drawer');
    assert.deepEqual(f.rows.offices, original); assert.equal(f.rows.events.length, 0);
    assert(f.requests.every(request => ['login', 'bootstrap', 'office', 'directory-settings'].includes(request.action)));
  } finally { f.close(); }
});

test('discovery recovers its paging controls after failure and ignores stale failed searches', async () => {
  const f = fixture(), { d, submit, waitFor } = f;
  try {
    await signIn(f); d.querySelector('[data-tab="discover"]').click();
    const search = d.querySelector('#sales-discover'); search.elements.city.value = 'Hartford'; search.elements.state.value = 'CT'; submit(search);
    await waitFor(() => d.querySelectorAll('[data-use-result]').length === 50, 'Initial discovery page');
    f.failSearches.add('Hartford:50'); d.querySelector('#sales-results-next').click();
    await waitFor(() => f.requests.some(request => request.action === 'search' && request.status === 502), 'Simulated paging failure');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(d.querySelector('#sales-results-next').disabled, false, 'Next should remain available to retry the failed page');
    assert.equal(d.querySelector('#sales-results-prev').disabled, true);
    assert.equal(d.querySelectorAll('[data-use-result]').length, 50, 'The prior successful results remain available');
    f.failSearches.delete('Hartford:50');
    const late = deferred(); f.searchGates.set('Hartford:50', late); d.querySelector('#sales-results-next').click();
    await waitFor(() => f.searches.filter(item => item.city === 'Hartford' && item.offset === 50).length === 2, 'Slow prior paging request');
    search.elements.city.value = 'New Haven'; submit(search);
    await waitFor(() => d.querySelector('#sales-message').textContent.includes('for New Haven'), 'The newer search should succeed');
    late.reject(new HttpError(502, 'Stale synthetic search failure.'));
    await waitFor(() => f.requests.some(request => request.action === 'search' && request.error.includes('Stale synthetic')), 'The older request should finish');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.match(d.querySelector('#sales-message').textContent, /for New Haven/);
    assert.equal(d.querySelector('#sales-results-next').disabled, false);
    assert.equal(d.querySelector('#sales-message').dataset.error, 'false');
  } finally { f.close(); }
});

test('newer office selection wins and changed contact proof requires fresh confirmation', async () => {
  const f = fixture(), { w, d, waitFor } = f;
  const sourceInfo = { contactRole: 'owner', contactVerified: true, emailVerified: true, verificationSource: `${website}contact`, verificationNote: 'Synthetic published details were reviewed.' };
  f.rows.offices.push(seededOffice(40, 'Slow office'), seededOffice(41, 'Latest office', sourceInfo));
  try {
    await signIn(f);
    const slow = deferred(); f.officeGates.set('40', slow);
    d.querySelector('[data-office="40"]').click();
    d.querySelector('[data-office="41"]').click();
    await waitFor(() => d.querySelector('#sales-detail h2')?.textContent === 'Latest office', 'Latest selected office');
    slow.resolve(); await waitFor(() => f.requests.some(request => request.action === 'office' && String(request.body.id) === '40'), 'Slow office result');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(d.querySelector('#sales-detail h2').textContent, 'Latest office');
    assert.equal(d.querySelector('[data-office="41"]').getAttribute('aria-pressed'), 'true');
    const checks = d.querySelector('.sales-contact-verification');
    assert.equal(checks.elements.contactVerified.checked, true); assert.equal(checks.elements.emailVerified.checked, true);
    checks.elements.contactRole.value = 'manager'; checks.elements.contactRole.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(checks.elements.contactVerified.checked, false, 'Changing the role invalidates its old confirmation');
    assert.equal(checks.elements.emailVerified.checked, true);
    checks.elements.verificationSource.value = `${website}different-source`; checks.elements.verificationSource.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(checks.elements.contactVerified.checked, false); assert.equal(checks.elements.emailVerified.checked, false, 'Changing the source invalidates both old confirmations');
    assert.equal(metadata(f.rows.offices[1]).emailVerified, true, 'Editing a proof form alone must not write to the backend');
  } finally { f.close(); }
});

test('reviewed expired-invitation renewal immediately exposes its fresh copyable private link', async () => {
  const f = fixture(), { w, d, submit, waitFor } = f, copied = [];
  f.rows.offices.push(seededOffice(40, 'Renewal office', { independence: 'independent', independenceVerification: { finding: 'independent', sourceURL: `${website}about`, note: 'Synthetic independent ownership was reviewed.', checkedAt: new Date().toISOString(), reviewed: true, by: 'owner' } }));
  f.rows.enrollments.push({ id: 41, status: 'invited', assigned_to: 'owner', contact_name: 'Synthetic Contact', contact_email: 'owner@office.example.test', notes: JSON.stringify({ leadId: '40', expiresAt: Date.now() - 86400000, terms: {}, tokenHash: 'expired-synthetic-token' }) });
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async value => copied.push(value) } });
  try {
    await signIn(f); d.querySelector('[data-office="40"]').click();
    await waitFor(() => d.querySelector('#sales-renew-invitation'), 'Expired invitation review');
    const form = d.querySelector('#sales-renew-invitation'); form.elements.reason.value = 'Synthetic operator reviewed this expired invitation and current ownership.'; form.elements.reviewed.checked = true; submit(form);
    await waitFor(() => d.querySelector('#sales-invitation a')?.textContent.includes('/office-signup#'), 'The fresh invitation should be shown without another invite submission');
    const link = d.querySelector('#sales-invitation a').href;
    assert.equal(new URL(link).pathname, '/office-signup'); assert(new URLSearchParams(new URL(link).hash.slice(1)).get('token'));
    assert.equal(f.requests.filter(request => request.action === 'renew-invitation').length, 1);
    assert.equal(f.requests.filter(request => request.action === 'invite').length, 0, 'No redundant invite request is required to recover the returned link');
    d.querySelector('#sales-copy-invite').click(); await waitFor(() => copied.length === 1 && d.querySelector('#sales-message').textContent === 'Signup link copied.', 'Copy renewed private link');
    assert.equal(copied[0], link);
    assert.equal(f.rows.enrollments.length, 2);
    assert.equal(f.rows.enrollments.find(row => row.id === 41).status, 'expired');
    assert(!f.rows.events.some(row => ['email', 'call', 'sent'].includes(metadata(row).action)));
  } finally { f.close(); }
});

test('local follow-up day stays consistent between the due statistic and queue around midnight', async () => {
  const f = fixture(), { w, d, waitFor } = f;
  f.rows.offices.push({ ...seededOffice(40, 'Due locally today'), meeting_date: '2026-11-08' }, { ...seededOffice(41, 'Due locally tomorrow'), meeting_date: '2026-11-09' });
  w.eval(`{
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [2026, 10, 8, 23, 30, 0])); }
      static now() { return new NativeDate(2026, 10, 8, 23, 30, 0).getTime(); }
    };
  }`);
  try {
    await signIn(f);
    await waitFor(() => d.querySelector('.sales-followup-list [data-followup-office]'), 'Local follow-up queue');
    const stat = [...d.querySelectorAll('.sales-stat')].find(element => element.querySelector('span').textContent === 'Follow-ups due');
    assert.equal(stat.querySelector('strong').textContent, '1');
    assert.equal(d.querySelectorAll('[data-followup-office]').length, 1);
    assert.equal(d.querySelector('[data-followup-office]').dataset.followupOffice, '40');
    assert.match(d.querySelector('.sales-followup-state').textContent, /Today/);
  } finally { f.close(); }
});

test('a do-not-contact office does not expose expired-invitation renewal or contact-research actions', async () => {
  const f = fixture(), { d, waitFor } = f;
  f.rows.offices.push({ ...seededOffice(40, 'Suppressed office'), status: 'do_not_contact' });
  f.rows.enrollments.push({ id: 41, status: 'invited', contact_name: 'Synthetic Contact', contact_email: 'owner@office.example.test', notes: JSON.stringify({ leadId: '40', expiresAt: Date.now() - 86400000 }) });
  try {
    await signIn(f); d.querySelector('[data-office="40"]').click();
    await waitFor(() => d.querySelector('#sales-detail h2')?.textContent === 'Suppressed office', 'Suppressed office record');
    assert.equal(d.querySelector('#sales-renew-invitation'), null);
    assert.equal(d.querySelector('#sales-research-form'), null);
    assert.equal(d.querySelector('.sales-ownership-verification button').disabled, true);
    assert.equal(d.querySelector('[data-open-email]'), null);
    assert.equal(d.querySelector('[data-contact-call]'), null);
    assert.equal(f.requests.some(request => ['renew-invitation', 'invite', 'research-office'].includes(request.action)), false);
  } finally { f.close(); }
});
