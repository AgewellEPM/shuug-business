import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRecipientKeyPair} from '../envelope.mjs';
import {openClientOnlyEnvelope,sealClientOnlyEnvelope} from '../client-only.mjs';
import {openedRecordMetadata} from '../browser/opened-record.mjs';
import {autoTaxRecordYear,extractAutoTaxRecords} from '../browser/auto-tax-records.mjs';
import {bytes,scope,income,expense,trip,journal,feed,standalone} from './auto-tax-fixtures.mjs';

test('actual client-only HPKE-opened native Journal enters only its independently selected account scope',async()=>{
  const client=await generateRecipientKeyPair(),trusted={clientPublicKey:client.publicKey},original=journal([income(),expense(),trip()]);
  const context={workspaceId:scope.workspaceId,accountId:scope.accountId,objectId:original.objectId,revision:1,domain:'driver-state'};
  const envelope=await sealClientOnlyEnvelope(original.plaintext,context,trusted,'client',client.privateKey),plaintext=await openClientOnlyEnvelope(envelope,context,trusted,'client',client.privateKey);
  const metadata=await openedRecordMetadata(plaintext,envelope,scope.clientId,{version:2,profile:scope.profile});
  const opened={objectId:original.objectId,revision:1,domain:'driver-state',plaintext,...metadata};
  const result=await extractAutoTaxRecords(new Map([[opened.objectId,opened]]),{scope});
  assert.match(result.digest,/^[a-f0-9]{64}$/);assert.equal(result.records.length,3);assert.deepEqual(result.years,[2025]);assert.deepEqual(result.issues,[]);
  assert.equal(result.records.find(row=>row.kind==='trip').body.startedAt,'2025-01-10T12:00:00.000Z');
  await assert.rejects(()=>extractAutoTaxRecords([opened],{scope:{...scope,accountId:'synthetic-other-account'}}),/binding/);
  await assert.rejects(()=>extractAutoTaxRecords([opened],{scope:{...scope,profile:'firm-recovery-v1'}}),/client-only/);
  await assert.rejects(()=>extractAutoTaxRecords([{...opened,journalBinding:undefined}],{scope}),/binding/);
  await assert.rejects(()=>extractAutoTaxRecords([{...opened,envelopeDigest:undefined}],{scope}),/authenticate/);
});

test('semantic source digest and row decisions survive copied snapshots, capture/chat changes and revision-only updates',async()=>{
  const records=[income(),expense(),trip()],first=await extractAutoTaxRecords(feed(records),{scope});
  const copied=structuredClone(records);for(const row of copied)row.revision=17;copied[2].body.startedAt='2025-01-10T12:00:00Z';copied[2].body.endedAt='2025-01-10T13:00:00.000Z';
  const next=journal(copied,{revision:11,extra:{coachMessages:[{text:'SYNTHETIC unrelated chat'}],goals:{vehicleCostPerMile:99}}});
  const payload=JSON.parse(new TextDecoder().decode(next.plaintext));payload.capturedAt+=500000;next.plaintext=bytes(payload);
  const second=await extractAutoTaxRecords([next,journal(records,{objectId:'synthetic-second-device',revision:8}),standalone(records[0])],{scope});
  assert.equal(second.digest,first.digest);assert.deepEqual(second.records.map(row=>row.fingerprint),first.records.map(row=>row.fingerprint));assert.equal(second.records.find(row=>row.kind==='income').origins.length,3);
  assert.notDeepEqual(second.refs,first.refs);
  const withOwnDraft=await extractAutoTaxRecords([next,{objectId:'synthetic-derived-return',revision:88,domain:'tax-document',plaintext:bytes({version:1,type:'client-auto-tax-draft',input:{private:'SYNTHETIC'}})}],{scope});
  assert.equal(withOwnDraft.digest,first.digest,'derived saves must not create an auto-save/review loop');
});

test('all competing records, tombstones and native pending conflicts alter review digest without selecting a winner',async()=>{
  const first=await extractAutoTaxRecords(feed([income()]),{scope}),changed=income();changed.body.amountCents+=100;
  const conflict=await extractAutoTaxRecords([journal([income()]),journal([changed],{objectId:'synthetic-copy'})],{scope});
  assert.equal(conflict.records.length,0);assert(conflict.issues.some(row=>row.code==='APP_RECORD_CONFLICT'));assert.notEqual(conflict.digest,first.digest);
  const deleted=income();deleted.deleted=true;
  const tombstone=await extractAutoTaxRecords(feed([deleted]),{scope});assert.equal(tombstone.records.length,0);assert.notEqual(tombstone.digest,first.digest);
  const mixed=await extractAutoTaxRecords([journal([income()]),journal([deleted],{objectId:'synthetic-copy'})],{scope});assert.equal(mixed.records.length,0);assert(mixed.issues.some(row=>row.code==='APP_RECORD_CONFLICT'));
  const pending=await extractAutoTaxRecords(feed([income()],{entryExtra:{pendingMutationId:'synthetic-local-mutation',conflict:{record:changed,sequence:3}}}),{scope});
  assert.equal(pending.records.length,0);assert(pending.issues.some(row=>row.code==='APP_NATIVE_CONFLICT'));assert.notEqual(pending.digest,first.digest);
  const removed=await extractAutoTaxRecords([], {scope});assert.notEqual(removed.digest,first.digest);
  const feedTombstone=await extractAutoTaxRecords([{objectId:'synthetic-journal',revision:2,domain:'driver-state',deleted:true}],{scope});assert.notEqual(feedTombstone.digest,removed.digest);
});

test('unsupported source fields, malformed dates/amounts, business intake and year boundaries remain explicit',async()=>{
  const invalid=income('synthetic-invalid',30000,'2025-02-30');invalid.body.unreviewedGrossOverride=30000;
  const fx=income('synthetic-foreign',50000);fx.body.currency='EUR';
  const result=await extractAutoTaxRecords(feed([income('synthetic-prior',10000,'2024-12-31'),income('synthetic-next',10000,'2026-01-01'),invalid,fx],{extra:{coachIntake:{taxYear:2025,businessType:'partnership',jurisdiction:'SYNTHETIC NY'},bankTransactions:[{amountCents:999999}],gigOffers:[{earningsCents:999999}]}}),{scope});
  assert.deepEqual(result.years,[2024,2025,2026]);assert(result.issues.some(row=>row.code==='APP_RECORD_DATE'));assert(result.issues.some(row=>row.code==='APP_AMOUNT_UNSUPPORTED'));assert(result.issues.some(row=>row.code==='APP_RECORD_FIELDS'));assert.deepEqual(result.intakes,[{taxYear:2025,businessType:'partnership'}]);
  assert.equal(result.records.length,4,'bank downloads and offers are not converted into income');assert.equal(autoTaxRecordYear(result.records.find(row=>row.id==='synthetic-invalid')),null);
  const noIntake=await extractAutoTaxRecords(feed([income()]),{scope}),entity=await extractAutoTaxRecords(feed([income()],{extra:{coachIntake:{taxYear:2025,businessType:'corporation'}}}),{scope});assert.notEqual(noIntake.digest,entity.digest);
});

const profile=(legalName,{objectId='synthetic-client-profile',extra={},...item}={})=>({objectId,revision:1,domain:'tax-identity',scope:{...scope},context:{workspaceId:scope.workspaceId,accountId:scope.accountId},envelopeDigest:'SYNTHETIC authenticated private profile',plaintext:bytes({version:1,type:'client-profile',legalName,email:'SYNTHETIC-contact@example.test',phone:'SYNTHETIC PHONE',mailingAddress:'SYNTHETIC MAILING ADDRESS',...extra}),...item});

test('an actual client-only HPKE-opened client profile contributes only its exact legal name',async()=>{
  const client=await generateRecipientKeyPair(),trusted={clientPublicKey:client.publicKey},original=profile('SYNTHETIC  María del Río');
  const context={workspaceId:scope.workspaceId,accountId:scope.accountId,objectId:original.objectId,revision:1,domain:'tax-identity'};
  const envelope=await sealClientOnlyEnvelope(original.plaintext,context,trusted,'client',client.privateKey),plaintext=await openClientOnlyEnvelope(envelope,context,trusted,'client',client.privateKey);
  try{
    const metadata=await openedRecordMetadata(plaintext,envelope,scope.clientId,{version:2,profile:scope.profile}),opened={objectId:original.objectId,revision:1,domain:'tax-identity',context,plaintext,...metadata};
    const result=await extractAutoTaxRecords([opened],{scope});assert.equal(result.profileName,'SYNTHETIC  María del Río');assert.deepEqual(result.records,[]);assert.deepEqual(result.issues,[]);
    const serialized=JSON.stringify(result);for(const value of ['SYNTHETIC-contact','SYNTHETIC PHONE','SYNTHETIC MAILING ADDRESS'])assert(!serialized.includes(value));
    await assert.rejects(()=>extractAutoTaxRecords([{...opened,context:{...context,accountId:'workspace-owner'}}],{scope}),/different authenticated workspace or account/);
    await assert.rejects(()=>extractAutoTaxRecords([{...opened,envelopeDigest:undefined}],{scope}),/authenticate/);
  }finally{plaintext.fill(0);}
});

test('only profile legal-name changes affect the digest; contact edits and other identity/document types stay excluded',async()=>{
  const first=await extractAutoTaxRecords([profile('SYNTHETIC CLIENT')],{scope});
  const contact=await extractAutoTaxRecords([profile('SYNTHETIC CLIENT',{revision:8,envelopeDigest:'SYNTHETIC newer encrypted envelope',extra:{email:'changed@example.test',phone:'CHANGED PHONE',mailingAddress:'CHANGED ADDRESS'}})],{scope});
  assert.equal(contact.digest,first.digest);assert.equal(contact.profileName,first.profileName);
  const changed=await extractAutoTaxRecords([profile('SYNTHETIC CHANGED CLIENT')],{scope});assert.notEqual(changed.digest,first.digest);
  const unrelated=profile('SYNTHETIC ADMIN NAME',{objectId:'synthetic-other-identity',extra:{type:'tax-identity',taxId:'000000001'}});
  const owner=profile('SYNTHETIC OWNER NAME',{objectId:'synthetic-owner-profile',extra:{type:'owner-profile'}});
  const derived={objectId:'synthetic-own-draft',revision:2,domain:'tax-document',plaintext:bytes({version:1,type:'client-auto-tax-draft',legalName:'SYNTHETIC DERIVED NAME'})};
  const combined=await extractAutoTaxRecords([profile('SYNTHETIC CLIENT'),unrelated,owner,derived],{scope});assert.equal(combined.digest,first.digest);assert.equal(combined.profileName,'SYNTHETIC CLIENT');assert.deepEqual(combined.issues,[]);
  assert.deepEqual(combined.refs,first.refs);
});

test('missing, conflicting, or invalid profile names never select a guessed identity',async()=>{
  const empty=await extractAutoTaxRecords([],{scope});assert.equal(empty.profileName,null);
  for(const name of [undefined,null,'','  ']){const missing=await extractAutoTaxRecords([profile(name)],{scope});assert.equal(missing.profileName,null);assert.equal(missing.digest,empty.digest);}
  const one=profile('SYNTHETIC CLIENT'),same=profile('SYNTHETIC CLIENT',{objectId:'synthetic-profile-copy'}),different=profile('SYNTHETIC DIFFERENT CLIENT',{objectId:'synthetic-profile-conflict'});
  const unique=await extractAutoTaxRecords([one],{scope}),copied=await extractAutoTaxRecords([one,same],{scope});assert.equal(copied.profileName,'SYNTHETIC CLIENT');assert.equal(copied.digest,unique.digest);
  const conflict=await extractAutoTaxRecords([one,different],{scope});assert.equal(conflict.profileName,null);assert(conflict.issues.some(row=>row.code==='APP_PROFILE_NAME_CONFLICT'));assert.notEqual(conflict.digest,unique.digest);
  for(const name of ['x'.repeat(201),'SYNTHETIC\nCONTROL',123]){const invalid=await extractAutoTaxRecords([one,profile(name,{objectId:'synthetic-invalid-profile'})],{scope});assert.equal(invalid.profileName,null);assert(invalid.issues.some(row=>row.code==='APP_PROFILE_NAME_INVALID'));}
  assert.equal((await extractAutoTaxRecords([profile('SYNTHETIC FUTURE PROFILE',{extra:{version:2}})],{scope})).digest,empty.digest);
});
