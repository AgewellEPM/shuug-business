import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prospectTools, verificationUpdate, independenceVerified, PROSPECT_ACTIONS } from './prospect-tools.mjs';
import { metadata } from './model.mjs';

const env = { GIGTAX_SALES_SESSION_KEY: 'a'.repeat(64) };
const user = { id: 'agent-1', name: 'Agent One', role: 'agent', states: ['CT'] };
const website = 'https://hartford-tax.com';
const initial = () => ({ id: '12', town: 'Hartford Tax', locality: 'Hartford', state: 'CT', status: 'researching', assigned_to: user.id,
  contact_name: 'Prior Person', contact_email: 'prior@hartford-tax.com', contact_phone: '+18602045588',
  notes: JSON.stringify({ address: '42 Main Street', website, independence: 'unverified', contactVerified: true, emailVerified: true,
    contactRole: 'owner', verificationSource: `${website}/contact`, verificationNote: 'Published business details reviewed.' }) });
const report = () => ({ checkedAt: new Date().toISOString(), proposedChanges: { email: 'untrusted@hartford-tax.com', independence: 'independent' },
  evidence: [
    { field: 'email', value: 'INFO@hartford-tax.com', sourceURL: `${website}/contact`, excerpt: 'Email info@hartford-tax.com', confidence: 'high' },
    { field: 'phone', value: '+18602045599', sourceURL: `${website}/contact`, excerpt: 'Phone +1 860 204 5599', confidence: 'high' },
    { field: 'contact', value: 'Jane Doe', sourceURL: `${website}/about`, excerpt: 'Jane Doe, Manager', confidence: 'medium', role: 'Owner' },
    { field: 'email', value: 'billing@hartford-tax.com', sourceURL: `${website}/contact`, excerpt: 'Billing email', confidence: 'medium' },
  ], ownership: { status: 'independent', suggestedFinding: 'independent', evidence: [] }, pages: [{ url: `${website}/contact`, status: 'checked' }], issues: [] });
function fixture(options = {}) {
  let row = { ...initial(), ...options.row }, clock = Date.now();
  const writes = [], events = [], researchCalls = [], searches = [];
  const db = {
    patch: async (kind, id, patch) => { assert.equal(kind, 'offices'); assert.equal(String(id), String(row.id)); writes.push(structuredClone(patch)); row = { ...row, ...structuredClone(patch) }; return structuredClone(row); },
    create: async (kind, value) => { assert.equal(kind, 'events'); const event = { id: `event-${events.length + 1}`, ...structuredClone(value) }; events.push(event); return structuredClone(event); },
    search: async query => { searches.push(query); return options.searchResults || []; },
  };
  const run = prospectTools(env, db, { placeLookup:options.placeLookup || (()=>({status:'no_match',candidates:[],evidence:[],matches:[]})), now: () => clock, researcher: async lead => { researchCalls.push(structuredClone(lead)); return structuredClone(options.report || report()); } });
  return { writes, events, researchCalls, searches, row: () => structuredClone(row), set: patch => { row = { ...row, ...patch }; },
    advance: milliseconds => { clock += milliseconds; }, run: (action, body = {}, actor = user, target = row) => run(actor, structuredClone(target), action, body),
    research: async () => (await run(user, structuredClone(row), 'research-office', {})).research };
}
const apply = (research, selected, extra = {}) => ({ token: research.token, reportId: research.reportId, reviewed: true, selected, ...extra });
const rejected = (promise, status, pattern) => assert.rejects(promise, error => error.status === status && (!pattern || pattern.test(error.message)));

test('saved offices without websites can review and explicitly save catalogue contacts with immutable source dates',async()=>{
  const placeLookup=()=>({status:'matches',release:'2026-10-21.0',candidates:[],evidence:[{field:'phone',value:'+18602469999',sourceURL:'https://explore.overturemaps.org/',sourceName:'Published place fixture',sourceRelease:'2026-10-21.0',sourceRecordId:'fixture-id',sourceObservedDates:['2026-09-01']}]});
  const f=fixture({row:{notes:JSON.stringify({address:'42 Main Street',independence:'unverified'})},placeLookup});
  const payload=await f.run('research-office'),r=payload.research;
  assert(payload.needsWebsiteSelection);assert.equal(f.writes.length,0);assert.equal(f.researchCalls.length,0);
  assert.equal(r.evidence.length,1);assert.deepEqual(r.evidence[0].sourceObservedDates,['2026-09-01']);
  await rejected(f.run('apply-research',apply(r,['proposal-1'],{reviewed:false})),400);
  const saved=await f.run('apply-research',apply(r,['proposal-1']));
  assert.equal(saved.office.contact_phone,'+18602469999');assert.equal(metadata(saved.office).contactVerified,false);
  assert.deepEqual(metadata(saved.office).researchSources.phone.sourceObservedDates,['2026-09-01']);
});

test('research returns sealed review-only proposals with no database writes or automatic ownership changes', async () => {
  const f = fixture(), before = f.row(), r = await f.research();
  assert(r.token && r.reportId && r.requiresReview); assert.equal(r.evidence.length, 4);
  assert.deepEqual(f.row(), before); assert.equal(f.writes.length, 0); assert.equal(f.events.length, 0);
  assert.equal(f.researchCalls.length, 1); assert.equal(metadata(f.researchCalls[0]).website, website);
  assert.deepEqual(r.evidence.map(e => e.id), ['proposal-1', 'proposal-2', 'proposal-3', 'proposal-4']);
  assert(!r.evidence.some(e => e.field === 'independence')); assert.equal(r.evidence[0].value, 'info@hartford-tax.com');
});

test('sealed approvals are bound to office, agent, report ID and original office fingerprint', async () => {
  for (const mutation of [
    (f, r) => f.run('apply-research', apply(r, ['proposal-1']), { ...user, id: 'agent-2' }),
    (f, r) => f.run('apply-research', apply(r, ['proposal-1']), user, { ...f.row(), id: '13' }),
    (f, r) => f.run('apply-research', apply(r, ['proposal-1'], { reportId: 'other-report' })),
    (f, r) => { f.set({ town: 'Another Office' }); return f.run('apply-research', apply(r, ['proposal-1'])); },
    (f, r) => { f.set({ contact_email: 'changed@hartford-tax.com' }); return f.run('apply-research', apply(r, ['proposal-1'])); },
    (f, r) => { const info = metadata(f.row()); f.set({ notes: JSON.stringify({ ...info, website: 'https://different-office.com' }) }); return f.run('apply-research', apply(r, ['proposal-1'])); },
    (f, r) => { const info = metadata(f.row()); f.set({ notes: JSON.stringify({ ...info, address: 'Different Street' }) }); return f.run('apply-research', apply(r, ['proposal-1'])); },
    (f, r) => { f.set({ state: 'MA' }); return f.run('apply-research', apply(r, ['proposal-1'])); },
    (f, r) => { const info = metadata(f.row()); f.set({ notes: JSON.stringify({ ...info, emailVerified: false }) }); return f.run('apply-research', apply(r, ['proposal-1'])); },
  ]) {
    const f = fixture(), r = await f.research(); await rejected(mutation(f, r), 409); assert.equal(f.writes.length, 0); assert.equal(f.events.length, 0);
  }
});

test('tampered, missing and expired research tokens cannot apply any field', async () => {
  const f = fixture(), r = await f.research();
  for (const token of ['', r.token.slice(0, -12) + 'modifiedxxxx', 'not-a-valid-token']) {
    await rejected(f.run('apply-research', apply(r, ['proposal-1'], { token })), 409);
  }
  f.advance(31 * 60000); await rejected(f.run('apply-research', apply(r, ['proposal-1'])), 409, /expired|research/i);
  assert.equal(f.writes.length, 0); assert.equal(f.events.length, 0);
});

test('apply accepts only selected sealed proposal IDs and ignores client values, roles and ownership claims', async () => {
  const f = fixture(), r = await f.research();
  const result = await f.run('apply-research', apply(r, ['proposal-1', 'proposal-3'], { email: 'attacker@elsewhere.com', contact: 'Injected Name', independence: 'independent', contactRole: 'owner', proposedChanges: { email: 'attacker@elsewhere.com' }, evidence: [{ field: 'email', value: 'attacker@elsewhere.com' }] }));
  assert.deepEqual(result.applied, ['email', 'contact']); assert.equal(result.office.contact_email, 'info@hartford-tax.com'); assert.equal(result.office.contact_name, 'Jane Doe');
  assert.equal(result.office.contact_phone, initial().contact_phone);
  const info = metadata(result.office); assert.equal(info.independence, 'unverified'); assert.equal(info.emailVerified, false); assert.equal(info.contactVerified, false); assert.equal(info.contactRole, 'unverified');
  assert.equal(info.researchSources.email.sourceURL, `${website}/contact`); assert.equal(info.researchSources.contact.value, 'Jane Doe'); assert(info.researchReviewedAt); assert.equal(info.researchReviewedBy, user.id);
  assert.equal(f.events.length, 1); const event = metadata(f.events[0]); assert.equal(event.action, 'research_applied'); assert.equal(event.detail.fields.length, 2);
});

test('unreviewed, fabricated, duplicate and conflicting proposal selections are denied before writes', async () => {
  const f = fixture(), r = await f.research();
  for (const body of [apply(r, ['proposal-1'], { reviewed: false }), apply(r, []), apply(r, ['proposal-1', 'proposal-1']), apply(r, ['proposal-1', 'proposal-4']), apply(r, ['proposal-99']), apply(r, ['proposal-1', 'phone']), apply(r, Array(9).fill('proposal-1')), apply(r, 'proposal-1')]) await rejected(f.run('apply-research', body), 400);
  assert.equal(f.writes.length, 0); assert.equal(f.events.length, 0);
});

test('do-not-contact and not-interested stages gate research, application, verification and drafts', async () => {
  for (const status of ['do_not_contact', 'not_interested']) {
    const f = fixture({ row: { status } });
    for (const action of PROSPECT_ACTIONS) await rejected(f.run(action, {}), 409, /do not contact|not interested/i);
    assert.equal(f.writes.length, 0); assert.equal(f.researchCalls.length, 0); assert.equal(f.events.length, 0);
  }
});

test('website discovery returns choices without claiming affiliation or saving a website', async () => {
  const f = fixture({ row: { notes: JSON.stringify({ address: '42 Main Street', independence: 'unverified' }) }, searchResults: [{ title: 'Possible office', url: website, snippet: 'Check identity.' }, { title: 'Unsafe', url: 'javascript:alert(1)' }, { title: 'Legacy public website', url: 'http://hartford-tax.com' }] });
  const result = await f.run('research-office'); assert.equal(result.needsWebsiteSelection, true); assert.match(result.message, /do not establish an affiliation/);
  assert.deepEqual(result.candidates.map(c => c.url), [`${website}/`, 'http://hartford-tax.com/']); assert(f.searches[0].includes('Hartford Tax')); assert.equal(f.researchCalls.length, 0); assert.equal(f.writes.length, 0);
});

test('reported evidence is validated and bounded before sealing; invalid fields and unsafe proof are dropped', async () => {
  const sourceReport = report(); sourceReport.evidence = [
    { field: 'independence', value: 'independent', sourceURL: website }, { field: 'email', value: 'invalid-email', sourceURL: website },
    { field: 'phone', value: 'not-a-phone', sourceURL: website }, { field: 'contact', value: 'x'.repeat(141), sourceURL: website },
    { field: 'email', value: 'unsafe@hartford-tax.com', sourceURL: 'javascript:alert(1)' },
    { field: 'email', value: 'overlong@hartford-tax.com', sourceURL: `${website}/${'x'.repeat(701)}` },
    ...Array.from({ length: 10 }, (_, i) => ({ field: 'email', value: `office${i}@hartford-tax.com`, sourceURL: `${website}/contact`, excerpt: 'x'.repeat(600), confidence: 'invented-confidence' })),
  ];
  const f = fixture({ report: sourceReport }), r = await f.research(); assert.equal(r.evidence.length, 8); assert(r.evidence.every(e => e.field === 'email' && e.value.startsWith('office') && e.excerpt.length === 220 && e.confidence === 'published'));
  assert(Buffer.byteLength(JSON.stringify(apply(r, r.evidence.map(e => e.id)))) < 16000);
});

test('changing contact name or email resets the associated verification flags without inventing proof', () => {
  const row = initial(), next = verificationUpdate({ contact: 'Changed Person', email: 'changed@hartford-tax.com' }, row, user, 1700000000000);
  assert.equal(next.contactVerified, false); assert.equal(next.contactRole, 'unverified'); assert.equal(next.emailVerified, false); assert.equal(next.verificationBy, user.id); assert.equal(next.verificationAt, '2023-11-14T22:13:20.000Z');
  assert.equal(verificationUpdate({}, row, user), null); assert.equal(metadata(row).contactVerified, true);
});
test('partial role or proof changes clear stale contact confirmations', () => {
  const row = initial();
  assert.equal(verificationUpdate({ contactRole: 'unverified' }, row, user).contactVerified, false);
  for (const body of [{ verificationSource: `${website}/about` }, { verificationNote: 'A different source review.' }]) {
    const updated = verificationUpdate(body, row, user);
    assert.equal(updated.contactVerified, false); assert.equal(updated.emailVerified, false);
  }
  assert.throws(() => verificationUpdate({ contactRole: 'unverified', contactVerified: true }, row, user), /verified role/);
});

test('confirming contact/email requires explicit source evidence and contact role', () => {
  const row = { ...initial(), notes: JSON.stringify({ website, independence: 'unverified' }) };
  for (const body of [ { emailVerified: true }, { contactVerified: true }, { contactVerified: true, verificationSource: website, verificationNote: 'Reviewed person.' }, { emailVerified: true, verificationSource: 'file:///etc/passwd', verificationNote: 'Unsafe proof.' }, { emailVerified: 'true' }, { contactRole: 'guessed-owner' } ]) assert.throws(() => verificationUpdate(body, row, user), error => error.status === 400);
  const confirmed = verificationUpdate({ contactVerified: true, emailVerified: true, contactRole: 'manager', verificationSource: `${website}/contact`, verificationNote: 'Name, published role and business email checked.' }, row, user);
  assert(confirmed.contactVerified && confirmed.emailVerified); assert.equal(confirmed.contactRole, 'manager'); assert.equal(confirmed.verificationSource, `${website}/contact`);
});

test('removing the recorded source or check note cannot leave contact details verified', () => {
  for (const body of [{ verificationSource: '' }, { verificationNote: '' }]) {
    let result;
    try { result = verificationUpdate(body, initial(), user); } catch (error) { assert.equal(error.status, 400); continue; }
    assert.equal(result.contactVerified, false); assert.equal(result.emailVerified, false);
  }
});

test('independent/chain findings require explicit review, public source proof and a note; unverified is safe to record', async () => {
  const f = fixture();
  for (const body of [ { reviewed: false, finding: 'independent', sourceURL: website, note: 'Checked.' }, { reviewed: true, finding: 'independent', note: 'Checked.' }, { reviewed: true, finding: 'chain', sourceURL: website }, { reviewed: true, finding: 'independent', sourceURL: 'file:///etc/passwd', note: 'Checked.' }, { reviewed: true, finding: 'guessed' } ]) await rejected(f.run('verify-office', body), 400);
  assert.equal(f.writes.length, 0);
  const result = await f.run('verify-office', { reviewed: true, finding: 'independent', sourceURL: `${website}/about`, note: 'Office owner explicitly confirmed independent ownership.' });
  const info = metadata(result.office); assert(independenceVerified(info)); assert.equal(info.independenceVerification.by, user.id); assert.equal(info.independenceVerification.reviewed, true); assert.equal(f.events.length, 1);
  const pending = await f.run('verify-office', { reviewed: true, finding: 'unverified' }); assert.equal(metadata(pending.office).independence, 'unverified'); assert.equal(independenceVerified(metadata(pending.office)), false);
  assert.equal(independenceVerified({ independence: 'independent' }), false);
});

test('drafts require stored recipient and review, persist as draft, and never mark a message sent', async () => {
  const f = fixture();
  for (const body of [{ reviewed: false, to: initial().contact_email, subject: 'Hello', message: 'Review this.' }, { reviewed: true, to: 'different@hartford-tax.com', subject: 'Hello', message: 'Review this.' }, { reviewed: true, to: 'invalid', subject: 'Hello', message: 'Review this.' }]) await assert.rejects(f.run('save-outreach-draft', body));
  assert.equal(f.events.length, 0); const result = await f.run('save-outreach-draft', { reviewed: true, to: initial().contact_email.toUpperCase(), subject: 'Office invitation', message: 'A reviewed draft.', status: 'sent', sent: true });
  assert.equal(result.sent, false); assert.equal(result.draft.status, 'draft'); assert.equal(result.draft.sourceChecked, true); assert.equal(result.event.status, 'draft'); assert.equal(f.writes.length, 0);
  const event = metadata(result.event); assert.equal(event.action, 'outreach_draft'); assert.equal(event.detail.status, 'draft'); assert.equal(event.detail.to, initial().contact_email); assert(!event.detail.sentAt);
});

test('drafting to an unverified but stored email records that limitation rather than asserting verification', async () => {
  const f = fixture({ row: { notes: JSON.stringify({ website, emailVerified: false, independence: 'unverified' }) } });
  const result = await f.run('save-outreach-draft', { reviewed: true, to: initial().contact_email, subject: 'Review', message: 'Draft only.' });
  assert.equal(result.draft.sourceChecked, false); assert.equal(result.sent, false); assert.equal(result.event.status, 'draft');
});
