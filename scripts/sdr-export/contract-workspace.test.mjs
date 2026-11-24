import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { service } from '../../sales/service.mjs';
import { projectAgreement } from './configuration.mjs';
import { sqliteStore } from './sqlite.mjs';

test('workspace contract drafts preserve scope, exact approval, signatures, renewals and archive', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'sdr-contract-center-'));
  const db = sqliteStore(join(dir, 'workspace.sqlite'));
  t.after(() => { db.close(); rmSync(dir, { recursive:true, force:true }); });
  const env = { GIGTAX_SALES_ORIGIN:'http://127.0.0.1:8740', GIGTAX_SALES_SESSION_KEY:'a'.repeat(64) };
  const app = service(env, db, undefined, { agreementOnly:true, agreement:projectAgreement });
  const owner = { id:'owner', role:'owner', name:'Workspace owner' };
  const rep = { id:'11', role:'agent', name:'Assigned rep', states:['CT'] };
  const other = { ...rep, id:'12' };
  const office = db.create('offices', { town:'Sample Nursing Home', state:'CT', locality:'Hartford', assigned_to:rep.id, status:'interested',
    contact_name:'Example Signer', contact_email:'signer@example.test',
    notes:JSON.stringify({ independence:'independent', independenceVerification:{ reviewed:true, finding:'independent',
      sourceURL:'https://example.test/ownership', note:'Fixture source reviewed.', checkedAt:new Date().toISOString() } }) });
  const text = 'Synthetic test terms describing equipment, staff orientation, implemented services, pilot review and termination conditions.';
  const input = { officeId:String(office.id), requestId:randomUUID(), type:'pilot', title:'Test Pilot', business:'TinkyTown Fixture',
    ownerName:'Example Signer', ownerEmail:'signer@example.test', startDate:'2027-01-10', endDate:'2027-02-24', value:'USD 0 pilot', agreementText:text };
  const action = (user, draft, operation, extra = {}) => app.dispatch(user,'contract-draft-action',{ id:draft.id, revision:draft.revision, operation, ...extra });
  assert.deepEqual((await app.dispatch(owner,'contract-center-read')).templates.map(item => item.id),['pilot','service','extension','renewal']);
  assert.equal((await app.dispatch(other,'contract-center-read')).drafts.length,0);
  await assert.rejects(app.dispatch(other,'contract-draft-save',input),{status:404});
  await assert.rejects(app.dispatch(rep,'contract-draft-save',{...input,startDate:'2027-02-30'}),{status:400});
  const {draft} = await app.dispatch(rep,'contract-draft-save',input);
  assert.equal((await app.dispatch(rep,'contract-draft-save',input)).draft.id,draft.id);
  await assert.rejects(app.dispatch(rep,'contract-draft-save',{...input,value:'USD 20 pilot'}),{status:409});
  const review = (await action(rep,draft,'submit')).draft;
  await assert.rejects(action(other,review,'preview'),{status:404});
  const {terms} = await action(owner,review,'preview');
  assert.ok(terms.text.includes(input.value) && terms.text.includes(input.endDate) && terms.text.includes(input.agreementText));
  await assert.rejects(action(rep,review,'approve',{ reviewed:true, termsHash:terms.hash }),{status:403});
  await assert.rejects(action(owner,review,'approve',{ reviewed:true, termsHash:'changed' }),{status:409});
  const approved = (await action(owner,review,'approve',{ reviewed:true, termsHash:terms.hash })).draft;
  const [prepared, replay] = await Promise.all([action(rep,approved,'prepare'),action(rep,approved,'prepare')]);
  assert.equal(prepared.draft.enrollmentId,replay.draft.enrollmentId);
  assert.equal(db.list('enrollments').length,1);
  const {link} = await app.dispatch(rep,'contract-link',{id:input.officeId,enrollmentId:prepared.draft.enrollmentId});
  const token = Object.fromEntries(new URLSearchParams(new URL(link).hash.slice(1)));
  const signature = { ...token, accepted:true, authorized:true, independent:true, electronicConsent:true,
    signature:input.ownerName, email:input.ownerEmail, termsHash:terms.hash };
  const pending = await app.dispatch(owner,'contracts');
  assert.equal(pending.contracts[0].status,'awaiting_signature');
  await assert.rejects(app.dispatch(owner,'contract-file-archive',{officeId:input.officeId,id:token.id,archived:true}),{status:409});
  assert.equal((await app.signup('sign',signature)).terms.hash,terms.hash);
  const archived = await app.dispatch(owner,'contract-file-archive',{officeId:input.officeId,id:token.id,archived:true});
  assert.equal(archived.contract.archived,true);
  assert.equal((await app.signup('receipt',token)).signature,input.ownerName);
  assert.equal((await app.dispatch(owner,'contract-file-archive',{officeId:input.officeId,id:token.id,archived:false})).contract.archived,false);
  const renewal = {...input,requestId:randomUUID(),type:'renewal',priorId:token.id,endDate:'2028-02-24'};
  await assert.rejects(app.dispatch(rep,'contract-draft-save',renewal),{status:400});
  const newDraft = (await app.dispatch(rep,'contract-draft-save',{...renewal,startDate:'2027-02-25'})).draft;
  const renewalReview = (await action(rep,newDraft,'submit')).draft;
  const renewalTerms = (await action(owner,renewalReview,'preview')).terms;
  const renewalApproval = (await action(owner,renewalReview,'approve',{ reviewed:true, termsHash:renewalTerms.hash })).draft;
  assert.notEqual((await action(rep,renewalApproval,'prepare')).draft.enrollmentId,token.id);
  assert.equal(db.list('enrollments').length,2);
  assert.equal((await app.signup('receipt',token)).terms.hash,terms.hash);
});
