import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { service } from './service.mjs';
import { createHandler } from './handler.mjs';
import { digest, unseal, seal, metadata, termsValid } from './model.mjs';
import { agreement } from './terms.mjs';
import { parseDirectory, unzipState } from './discovery.mjs';
import { initialBilling } from './billing.mjs';
const env = { GIGTAX_SALES_SESSION_KEY:'a'.repeat(64), GIGTAX_SALES_OWNER_HASH:digest('owner-test-code'), GIGTAX_TINKY_KEY:'synthetic-not-a-real-key', GIGTAX_SALES_ORIGIN:'https://gigtax.pro' };
let db, app, rows, id;
const owner = { id:'owner',name:'Owner',role:'owner',states:[] };
beforeEach(() => {
  rows = { offices:[],agents:[],events:[],enrollments:[] }; id = 1;
  let terms = agreement({business:'Synthetic Company LLC',billingStart:'Only as agreed for this synthetic test',cancellation:'Synthetic test only',approved:true});
  db = {
    list:async kind => structuredClone(rows[kind]),
    get:async (kind,id) => structuredClone(rows[kind].find(r => String(r.id) === String(id))),
    create:async (kind,body) => { const row = { ...structuredClone(body),id:id++,created_at:new Date().toISOString() }; rows[kind].push(row); return structuredClone(row); },
    patch:async (kind,id,body) => { const row = rows[kind].find(r=>String(r.id)===String(id)); Object.assign(row,structuredClone(body)); return structuredClone(row); },
    terms:async () => structuredClone(terms),setTerms:async t => {terms=structuredClone(t);},
    discover:async () => ({results:[]}),
  }; app = service(env,db,{configured:()=>true,create:async()=>({id:"cs_synthetic",url:"https://checkout.stripe.com/c/pay/synthetic"}),verify:async()=>({live:true,checkoutId:"cs_synthetic",subscriptionId:"sub_synthetic",customerId:"cus_synthetic",invoiceId:"in_synthetic",initialAmountCents:50000,currency:'USD',verifiedAt:new Date().toISOString(),billingEndsAt:new Date(Date.now()+365*86400000).toISOString(),paidThroughAt:new Date(Date.now()+30*86400000).toISOString()})}, {
    billingReconciler: async (_env, adapter, enrollmentId) => {
      const row = await adapter.get('enrollments',enrollmentId), info = metadata(row), billing = initialBilling(info.payment);
      return adapter.patch('enrollments',row.id,{status:billing.status,notes:JSON.stringify({...info,billing})});
    },
  });
});
const input = {name:'Synthetic Office',address:'123 Example Way',city:'Hartford',state:'CT',contact:'Test Owner',email:'office@example.test',independence:'independent',website:'https://example.test',source:'https://example.test/about'};
async function newAgent(states = ['CT']) { return app.dispatch(owner,'create-agent',{name:'Test Agent',email:`agent-${id}@example.test`,states}); }
async function agentIdentity(a) { const login = await app.login({code:a.code,email:a.agent.email}); return { user:await app.identity(login.token),token:login.token }; }
async function invite() { const {office} = await app.dispatch(owner,'create-office',input); await app.dispatch(owner,'verify-office',{id:office.id,finding:'independent',sourceURL:'https://example.test/about',note:'Synthetic explicit source reviewed',reviewed:true}); const invitation = await app.dispatch(owner,'invite',{id:office.id,email:input.email,ownerName:'Test Owner'}); const q = new URLSearchParams(new URL(invitation.link).hash.slice(1)); return {office,body:{id:q.get('id'),token:q.get('token')}}; }
test('owner login encrypts the credential and rejects modified or expired sessions',async()=>{
  const result = await app.login({code:'owner-test-code'}); assert.equal((await app.identity(result.token)).role,'owner'); assert(!result.token.includes('owner-test-code'));
  await assert.rejects(app.identity(result.token.slice(0,-3)+'xyz'),/Sign in/);
  assert.equal(unseal(seal({exp:1},env.GIGTAX_SALES_SESSION_KEY),env.GIGTAX_SALES_SESSION_KEY),null);
});
test('agent email and secret must both match; revocation ends an existing session',async()=>{
  const a = await newAgent(), {token} = await agentIdentity(a);
  await assert.rejects(app.login({code:a.code,email:'other@example.test'}),/Check your email/);
  await app.dispatch(owner,'revoke-agent',{id:a.agent.id}); await assert.rejects(app.identity(token),/revoked/);
});
test('agent assignment and state territory restrict reads, edits, activities and invitation creation',async()=>{
  const a = await newAgent(), {user} = await agentIdentity(a), {office} = await app.dispatch(owner,'create-office',input);
  for (const action of ['office','update-office','activity','invite']) await assert.rejects(app.dispatch(user,action,{id:office.id}),/not found/);
  await app.dispatch(owner,'update-office',{id:office.id,assignedTo:user.id});
  assert.equal((await app.dispatch(user,'office',{id:office.id})).office.id,office.id);
  await assert.rejects(app.dispatch(user,'create-office',{...input,state:'MA'}),/territory/);
  await assert.rejects(app.dispatch(user,'search',{state:'MA',city:'Boston'}),/territory/);
});
test('agents cannot create users, publish terms, revoke access or reassign offices',async()=>{
  const a=await newAgent(),{user}=await agentIdentity(a),{office}=await app.dispatch(user,'create-office',input);
  for(const action of ['create-agent','publish-terms','revoke-agent']) await assert.rejects(app.dispatch(user,action,{}),/Only the workspace owner/);
  await assert.rejects(app.dispatch(user,'update-office',{id:office.id,assignedTo:'owner'}),/Only the owner/);
});
test('deduplication opens same office; cross-agent duplication does not reveal its record',async()=>{
  const a=await newAgent(),{user}=await agentIdentity(a);
  await app.dispatch(owner,'create-office',input);
  assert.equal((await app.dispatch(owner,'create-office',input)).duplicate,true);
  await assert.rejects(app.dispatch(user,'create-office',input),/already in the team pipeline/);
});
test('new offices start unverified even when imported fields claim independent ownership or checked contacts',async()=>{
  const {office}=await app.dispatch(owner,'create-office',{...input,contactVerified:true,emailVerified:true,contactRole:'owner'}), info=metadata(office);
  assert.equal(info.independence,'unverified'); assert.equal(info.contactRole,'unverified'); assert.equal(info.contactVerified,false); assert.equal(info.emailVerified,false);
  await assert.rejects(app.dispatch(owner,'update-office',{id:office.id,independence:'independent'}),/ownership verification/);
  await app.dispatch(owner,'verify-office',{id:office.id,finding:'independent',sourceURL:input.source,note:'Synthetic explicit source reviewed',reviewed:true});
  const updated=await app.dispatch(owner,'update-office',{id:office.id,independence:'independent'}); assert.equal(metadata(updated.office).independenceVerification.reviewed,true);
});
test('contact edits invalidate prior verification while preserving explicit ownership evidence',async()=>{
  const {office}=await app.dispatch(owner,'create-office',input);
  await app.dispatch(owner,'verify-office',{id:office.id,finding:'independent',sourceURL:input.source,note:'Synthetic explicit source reviewed',reviewed:true});
  await app.dispatch(owner,'update-office',{id:office.id,contactVerified:true,emailVerified:true,contactRole:'owner',verificationSource:input.source,verificationNote:'Synthetic contact source reviewed'});
  const changed=await app.dispatch(owner,'update-office',{id:office.id,contact:'Another Person',email:'another@example.test'}), info=metadata(changed.office);
  assert.equal(changed.office.contact_email,'another@example.test'); assert.equal(info.contactVerified,false); assert.equal(info.emailVerified,false); assert.equal(info.contactRole,'unverified'); assert.equal(info.independenceVerification.reviewed,true);
});
test('follow-up dates must be real calendar dates and can be cleared',async()=>{
  const {office}=await app.dispatch(owner,'create-office',input);
  for(const nextFollowup of ['2025-02-29','2026-02-30','2026-04-31','2026-13-01','2026-11-00','2026-1-05',null]) await assert.rejects(app.dispatch(owner,'update-office',{id:office.id,nextFollowup}),/valid follow-up date/);
  const leap=await app.dispatch(owner,'update-office',{id:office.id,nextFollowup:'2028-02-29'}); assert.equal(leap.office.meeting_date,'2028-02-29');
  const cleared=await app.dispatch(owner,'update-office',{id:office.id,nextFollowup:''}); assert.equal(cleared.office.meeting_date,null);
});
test('verification and published terms gate invitations; stage edits cannot create activation',async()=>{
  const {office}=await app.dispatch(owner,'create-office',{...input,independence:'unverified'});
  await assert.rejects(app.dispatch(owner,'invite',{id:office.id,email:input.email,ownerName:'Owner'}),/Confirm independent/);
  await assert.rejects(app.dispatch(owner,'update-office',{id:office.id,stage:'active'}),/owner acceptance/);
  await db.setTerms(null); await assert.rejects(app.dispatch(owner,'invite',{id:office.id}),/approve and publish/);
});
test('owner accepts exact terms, durable receipt is written first, and retries repair derived activation',async()=>{
  const {office,body}=await invite(),view=await app.signup('view',body);
  const consent={...body,email:view.email,signature:'Test Owner',accepted:true,authorized:true,independent:true,termsHash:view.terms.hash};
  await assert.rejects(app.signup('accept',{...consent,termsHash:'changed'}),/Review and accept/);
  await assert.rejects(app.signup('accept',{...consent,email:'other@example.test'}),/business email/);
  const pending=await app.signup('accept',consent); assert(pending.pending); assert.equal(rows.offices[0].status,'invited'); assert.equal(rows.enrollments[0].status,'payment_pending');
  const result=await app.signup('confirm',body);
  assert(result.active); assert.equal(rows.offices[0].status,'active');
  const saved=metadata(rows.enrollments[0]); assert.equal(saved.signature,'Test Owner'); assert.equal(saved.terms.text,view.terms.text); assert(saved.acceptedAt);
  await db.patch('offices',office.id,{status:'invited'}); const retry=await app.signup('accept',body); assert.equal(retry.receipt,result.receipt); assert.equal(rows.offices[0].status,'active');
});
test('invitation tokens, expiry and do-not-contact are enforced',async()=>{
  const {office,body}=await invite();
  await assert.rejects(app.signup('view',{...body,token:'x'.repeat(43)}),/not found/);
  const row=rows.enrollments[0],m=metadata(row); row.notes=JSON.stringify({...m,expiresAt:1});
  await assert.rejects(app.signup('view',body),/expired/); row.notes=JSON.stringify(m);
  await db.patch('offices',office.id,{status:'do_not_contact'});await assert.rejects(app.signup('view',body),/no longer available/);
});
test('owner can review and replace an expired unpaid invitation while the old link remains unusable', async () => {
  const { office, body } = await invite();
  const row = rows.enrollments[0]; row.notes = JSON.stringify({ ...metadata(row), expiresAt: 1 });
  await assert.rejects(app.dispatch(owner, 'renew-invitation', { id: office.id, reason: 'Synthetic review' }), /Review the expired/);
  const renewed = await app.dispatch(owner, 'renew-invitation', { id: office.id, reason: 'Synthetic owner rechecked the expired unpaid invitation.', reviewed: true });
  assert.equal(rows.enrollments.length, 2); assert.equal(rows.enrollments[0].status, 'expired');
  await assert.rejects(app.signup('view', body), /not found/);
  const next = Object.fromEntries(new URLSearchParams(new URL(renewed.link).hash.slice(1)));
  assert.notEqual(next.id, body.id); assert.equal((await app.signup('view', next)).terms.upfrontCents, 50000);
});
test('renewal cannot replace an open checkout or renew an existing paid membership', async () => {
  const { office } = await invite(), row = rows.enrollments[0];
  row.notes = JSON.stringify({ ...metadata(row), checkoutId: 'cs_synthetic', expiresAt: 1 });
  const pending = service(env, db, { checkoutState: async () => ({ status: 'open', paymentStatus: 'unpaid' }) });
  await assert.rejects(pending.dispatch(owner, 'renew-invitation', { id: office.id, reviewed: true, reason: 'Synthetic review' }), /still open/);
  assert.equal(rows.enrollments.length, 1); assert.equal(row.status, 'invited');
  row.notes = JSON.stringify({ ...metadata(row), payment: { live: true } });
  await assert.rejects(app.dispatch(owner, 'renew-invitation', { id: office.id, reviewed: true, reason: 'Synthetic review' }), /paid membership/);
  assert.equal(rows.enrollments.length, 1);
});
test('renewal preserves blocked or unverified offices without changing expired invitations', async () => {
  const { office } = await invite(), row = rows.enrollments[0];
  row.notes = JSON.stringify({ ...metadata(row), expiresAt: 1 });
  for (const status of ['do_not_contact', 'not_interested', 'active']) {
    await db.patch('offices', office.id, { status });
    const snapshot = structuredClone(rows);
    await assert.rejects(app.dispatch(owner, 'renew-invitation', { id: office.id, reviewed: true, reason: 'Synthetic review' }), /independent ownership/);
    assert.deepEqual(rows, snapshot);
  }
  await db.patch('offices', office.id, { status: 'invited', notes: JSON.stringify({ ...metadata(rows.offices[0]), independence: 'unverified' }) });
  const snapshot = structuredClone(rows);
  await assert.rejects(app.dispatch(owner, 'renew-invitation', { id: office.id, reviewed: true, reason: 'Synthetic review' }), /independent ownership/);
  assert.deepEqual(rows, snapshot);
});
test('a concurrent invitation attempt cannot create a second enrollment after the first reservation', async () => {
  const { office } = await app.dispatch(owner, 'create-office', input);
  await app.dispatch(owner, 'verify-office', { id: office.id, finding: 'independent', sourceURL: 'https://example.test/about', note: 'Synthetic reviewed source.', reviewed: true });
  db.patchIfUnchanged = async (kind, recordId, expected, patch) => {
    const record = rows[kind].find(value => String(value.id) === String(recordId));
    if (record.notes !== expected) return { matched: false };
    return db.patch(kind, recordId, patch);
  };
  const outcomes = await Promise.allSettled([1,2].map(() => app.dispatch(owner, 'invite', { id: office.id, email: input.email, ownerName: input.contact })));
  assert.equal(rows.enrollments.length, 1);
  assert(outcomes.some(result => result.status === 'fulfilled'));
});
test('separate append-only activities retain both agents entries',async()=>{
  const {office}=await app.dispatch(owner,'create-office',input);
  await Promise.all(['First call','Second note'].map(note=>app.dispatch(owner,'activity',{id:office.id,kind:'note',note})));
  assert.equal((await app.dispatch(owner,'office',{id:office.id})).events.length,3);
});
test('terms require explicit approval and pin the exact text',()=>{
  assert.throws(()=>agreement({business:'Test',billingStart:'Test',cancellation:'Test',approved:false}),/approve/);
  const t=agreement({business:'Test',billingStart:'Test',cancellation:'Test',approved:true}); assert(termsValid(t)); assert(!termsValid({...t,text:t.text+'changed'})); assert.equal(t.monthlyCents,30000);
});
test('directory parser preserves public business contact and does not infer independence',()=>{
  const r=parseDirectory('Test Tax|123 Example Rd|None|Hartford|CT|06101|None|Test|None|Contact|2035550100|X|None|None|None\nBad|row','CT');
  assert.equal(r.length,1);assert.equal(r[0].contact,'Test Contact');assert.equal(r[0].ero,true);assert.equal(r[0].independence,undefined);
  assert.throws(()=>unzipState(Buffer.from('invalid'),'CT'),/supported ZIP/);
});
test('HTTP denies missing session, foreign origin, unsupported method and oversized requests',async()=>{
  const handler=createHandler(env,db);
  async function send(body,headers={},method='POST') { let response;const req={method,headers:{origin:env.GIGTAX_SALES_ORIGIN,'content-type':'application/json',...headers},body}; const res={statusCode:200,setHeader(){},end(value){response={status:this.statusCode,body:JSON.parse(value)};}}; await handler(req,res);return response; }
  assert.equal((await send({action:'bootstrap'})).status,401);
  assert.equal((await send({action:'login',code:'owner-test-code'},{origin:'https://foreign.test'})).status,403);
  assert.equal((await send({}, {},'GET')).status,405);
  assert.equal((await send({action:'login',code:'x'.repeat(17000)})).status,413);
});
