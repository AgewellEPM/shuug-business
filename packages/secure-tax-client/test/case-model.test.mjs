import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCaseBody,assertCaseCommand,assertCaseReference,canonicalCaseJson,validateCaseEvidence,applyCaseTransition,caseSnapshot} from '../case-model.mjs';
import {signCasePayload,verifyCasePayload,isCasePayload} from '../case-certificate.mjs';
import {CASE_OBJECT_PREFIX} from '../case-contract.mjs';
import {createFirmBundle,unlockFirmBundle} from '../firm-recovery.mjs';
import {encode64} from '../envelope.mjs';
import {newReturn} from '../../tax-engine/index.mjs';

const actor='synthetic-preparer',at='2026-11-10T12:00:00.000Z',reference={objectId:'synthetic-source-file',revision:1,envelopeDigest:encode64(new Uint8Array(32).fill(7)),domain:'tax-document'};
const file=()=>{const bytes=new TextEncoder().encode('%PDF-1.7\nSYNTHETIC PRIVATE CASE DOCUMENT\n%%EOF');return {version:1,type:'private-file',filename:'synthetic.pdf',mime:'application/pdf',data:encode64(bytes),byteLength:bytes.length,purpose:'tax-document',category:'tax',notes:'Synthetic evidence only',savedAt:at};};
const create=(kind='1040')=>applyCaseTransition(null,{actionId:'synthetic-create',type:'case.create',input:{title:'Synthetic protected tax case',year:2025,kind}},{actor,at});
const request=(body,id='synthetic-request')=>applyCaseTransition(body,{actionId:'add-'+id,type:'request.add',input:{requestId:id,title:'Income records',due:'2026-12-01',notes:''}},{actor,at});
const reviewed=(body,decision='reviewed')=>applyCaseTransition(body,{actionId:'synthetic-review',type:'document.review',input:{requestId:'synthetic-request',document:reference,decision,notes:'Actual synthetic file reviewed'}},{actor,at,evidence:{reference,payload:file()}});
const draftReference={objectId:'synthetic-draft',revision:1,envelopeDigest:encode64(new Uint8Array(32).fill(8)),domain:'tax-document'};
const linked=body=>applyCaseTransition(body,{actionId:'synthetic-draft-link',type:'draft.link',input:{document:draftReference,notes:'Draft identity linked only'}},{actor,at,evidence:{reference:draftReference,payload:newReturn(body.kind)}});
const context=body=>({workspaceId:'synthetic-case-workspace',accountId:'synthetic-account',clientId:'synthetic-client',objectId:CASE_OBJECT_PREFIX+'synthetic-case',revision:body.history.length,domain:'tax-document'});
let custody;
function firm(){return custody??= (async()=>{const passphrase='Synthetic private tax-case custody phrase.',{bundle,publicPins}=await createFirmBundle('synthetic-case-workspace',passphrase);return {unlocked:await unlockFirmBundle(bundle,passphrase,publicPins),pins:publicPins};})();}

test('private case transitions retain exact reviewed evidence and fixed draft family without mutating prior history',()=>{
  for(const kind of ['1040','1065','1120S','1120']){
    const before=request(create(kind)),copied=structuredClone(before),after=linked(reviewed(before));
    assert.deepEqual(before,copied);assert.equal(after.requests[0].review.actor,actor);assert.deepEqual(after.requests[0].review.document,reference);assert.deepEqual(after.draft,draftReference);assert.equal(after.history.length,4);assert.deepEqual(after.history.map(event=>event.type),['case.create','request.add','document.review','draft.link']);
    assert.throws(()=>applyCaseTransition(after,{actionId:'other-kind',type:'draft.link',input:{document:draftReference,notes:''}},{actor,at,evidence:{reference:draftReference,payload:newReturn(kind==='1040'?'1120':'1040')}}));
  }
});
test('case readiness distinguishes exact current sources, replacement decisions, stale revisions and unavailable items',()=>{
  const body=linked(reviewed(request(create()))),records=new Map([reference,draftReference].map(value=>[value.objectId,{...value}]));
  const current=caseSnapshot(body,records);assert.equal(current.ready,true);assert.equal(current.filingReady,false);assert.equal(current.requests[0].freshness,'current');
  records.set(reference.objectId,{...reference,revision:2});const changed=caseSnapshot(body,records);assert.equal(changed.ready,false);assert.equal(changed.requests[0].freshness,'stale');
  records.set(reference.objectId,{...reference,envelopeDigest:encode64(new Uint8Array(32).fill(9))});assert.equal(caseSnapshot(body,records).requests[0].freshness,'stale');
  records.set(reference.objectId,{...reference,deleted:true});assert.equal(caseSnapshot(body,records).requests[0].freshness,'unavailable');records.delete(reference.objectId);assert.equal(caseSnapshot(body,records).requests[0].freshness,'unavailable');
  records.set(reference.objectId,{...reference});records.delete(draftReference.objectId);assert.equal(caseSnapshot(body,records).draft.freshness,'unavailable');assert.equal(caseSnapshot(body,records).ready,false);
  const replacement=linked(reviewed(request(create()),'replacement_requested'));records.set(draftReference.objectId,{...draftReference});assert.equal(caseSnapshot(replacement,records).requests[0].freshness,'current');assert.equal(caseSnapshot(replacement,records).ready,false);
  assert.equal(caseSnapshot(request(create()),new Map()).requests[0].freshness,'unreviewed');assert.equal(caseSnapshot(create(),new Map()).ready,false);
});
test('replacement reviews retain exact prior command facts and cannot diverge from certified history',()=>{
  const first=reviewed(request(create())),nextReference={...reference,revision:2,envelopeDigest:encode64(new Uint8Array(32).fill(4))},command={actionId:'second-review',type:'document.review',input:{requestId:'synthetic-request',document:nextReference,decision:'replacement_requested',notes:'Replacement needed'}};
  const next=applyCaseTransition(first,command,{actor,at,evidence:{reference:nextReference,payload:file()}});
  assert.deepEqual(next.history[2].input.document,reference);assert.equal(next.history[2].input.decision,'reviewed');assert.deepEqual(next.history[3].input.document,nextReference);assert.equal(next.requests[0].review.decision,'replacement_requested');
  const rewritten=structuredClone(next);rewritten.requests[0].review.document=reference;assert.throws(()=>assertCaseBody(rewritten));
  const rewrittenHistory=structuredClone(next);rewrittenHistory.history[2].input.requestId='unknown-request';assert.throws(()=>assertCaseBody(rewrittenHistory));
});
test('private evidence validation checks real file bytes and refuses type, size, format and reference substitutions',()=>{
  assert.equal(validateCaseEvidence({reference,payload:file()}).reference,reference);
  for(const patch of [{byteLength:1},{data:encode64(new TextEncoder().encode('not a PDF'))},{mime:'text/html'},{version:2},{type:'tax-case'},{unsupported:'ignored'}])assert.throws(()=>validateCaseEvidence({reference,payload:{...file(),...patch}}));
  const receipt={...reference,domain:'driver-receipt'};assert.throws(()=>validateCaseEvidence({reference:receipt,payload:file()}));assert.doesNotThrow(()=>validateCaseEvidence({reference:receipt,payload:{...file(),purpose:'receipt'}}));
  assert.throws(()=>assertCaseReference({...reference,revision:0}));assert.throws(()=>assertCaseReference({...reference,envelopeDigest:'invalid'}));assert.throws(()=>assertCaseReference({...reference,domain:'driver-record'}));
  const body=request(create()),command={actionId:'review-other-source',type:'document.review',input:{requestId:'synthetic-request',document:{...reference,objectId:'another-file'},decision:'reviewed',notes:''}};
  assert.throws(()=>applyCaseTransition(body,command,{actor,at,evidence:{reference,payload:file()}}));
  assert.throws(()=>applyCaseTransition(body,{...command,input:{...command.input,document:reference}},{actor,at,evidence:{reference,payload:newReturn()}}));
  assert.throws(()=>validateCaseEvidence({reference,payload:{...newReturn(),year:2028}}));
});
test('commands, calendar dates, history actors and creation boundaries fail closed',()=>{
  const first=create(),body=request(first);
  assert.throws(()=>applyCaseTransition(first,{actionId:'again',type:'case.create',input:{title:'Other',year:2025,kind:'1040'}},{actor,at}));
  assert.throws(()=>applyCaseTransition(null,{actionId:'no-case',type:'request.add',input:{requestId:'request',title:'Records',due:'',notes:''}},{actor,at}));
  assert.throws(()=>request(body));assert.throws(()=>applyCaseTransition(first,{actionId:'backdated',type:'request.add',input:{requestId:'request',title:'Records',due:'',notes:''}},{actor,at:'2026-11-09T12:00:00.000Z'}));
  assert.throws(()=>assertCaseCommand({actionId:'bad-date',type:'request.add',input:{requestId:'request',title:'Records',due:'2025-02-29',notes:''}}));
  assert.doesNotThrow(()=>assertCaseCommand({actionId:'leap-date',type:'request.add',input:{requestId:'request',title:'Records',due:'2024-02-29',notes:''}}));
  assert.throws(()=>assertCaseCommand({actionId:'bypass',type:'case.approve',input:{}}));assert.throws(()=>assertCaseBody({...body,approved:true}));
  const inconsistent=structuredClone(reviewed(body));inconsistent.requests[0].review.actor='another-reviewer';assert.throws(()=>assertCaseBody(inconsistent));
  assert.throws(()=>applyCaseTransition(first,{actionId:'no-hidden-evidence',type:'request.add',input:{requestId:'request',title:'Records',due:'',notes:''}},{actor,at,evidence:{reference,payload:file()}}));
});
test('case size and action limits preserve retained history, while bounded private evidence JSON supports a real large file',()=>{
  let body=create();for(let index=0;index<100;index++)body=request(body,'request-'+index);assert.throws(()=>request(body,'one-too-many'));
  const oversized=structuredClone(body);for(const item of oversized.requests)item.notes='x'.repeat(2000);assert.throws(()=>assertCaseBody(oversized));
  let bounded=create(),hitBodyLimit=false;for(let index=0;index<100;index++){
    const command={actionId:'sized-action-'+index,type:'request.add',input:{requestId:'sized-request-'+index,title:'Records',due:'',notes:'x'.repeat(2000)}};
    try{bounded=applyCaseTransition(bounded,command,{actor,at});}catch{hitBodyLimit=true;assert(index<100);assert(new TextEncoder().encode(canonicalCaseJson(bounded)).length<=128*1024);assert.doesNotThrow(()=>applyCaseTransition(bounded,{...command,input:{...command.input,notes:''}},{actor,at}));break;}
  }assert(hitBodyLimit);
  body=request(create());for(let index=0;index<254;index++)body=applyCaseTransition(body,{actionId:'review-'+index,type:'document.review',input:{requestId:'synthetic-request',document:reference,decision:'reviewed',notes:''}},{actor,at,evidence:{reference,payload:file()}});
  assert.equal(body.history.length,256);assert.throws(()=>applyCaseTransition(body,{actionId:'one-too-many',type:'document.review',input:{requestId:'synthetic-request',document:reference,decision:'reviewed',notes:''}},{actor,at,evidence:{reference,payload:file()}}));
  const largeBytes=new Uint8Array(1024*1024).fill(32);largeBytes.set(new TextEncoder().encode('%PDF-'));const large={...file(),data:encode64(largeBytes),byteLength:largeBytes.length};assert.doesNotThrow(()=>validateCaseEvidence({reference,payload:large}));assert(canonicalCaseJson({reference,payload:large}).length>1024*1024);largeBytes.fill(0);
  assert.throws(()=>canonicalCaseJson('x'.repeat(15*1024*1024+1)));assert.throws(()=>canonicalCaseJson(['x'.repeat(11*1024*1024),'x'.repeat(11*1024*1024)]));
  let deep=null;for(let index=0;index<26;index++)deep={next:deep};assert.throws(()=>canonicalCaseJson(deep));assert.throws(()=>canonicalCaseJson({value:undefined}));assert.throws(()=>canonicalCaseJson({value:Number.NaN}));
});
test('private firm certificate binds whole body and full case context, remains historical and returns frozen content',async()=>{
  const {unlocked,pins}=await firm(),body=linked(reviewed(request(create()))),selected=context(body),now=Date.parse(at)+1000,payload=await signCasePayload(body,selected,unlocked,{actor,now});
  assert(isCasePayload(payload));const opened=await verifyCasePayload(payload,selected,pins,now+366*86400000);assert.deepEqual(opened,body);assert(Object.isFrozen(opened));assert(Object.isFrozen(opened.requests[0].review.document));assert.throws(()=>{opened.title='changed';});assert.equal(payload.certificate.actor,body.history.at(-1).actor);
  for(const patch of [{workspaceId:'other-workspace'},{accountId:'other-account'},{clientId:'other-client'},{objectId:CASE_OBJECT_PREFIX+'other-case'},{objectId:'ordinary-item'},{revision:selected.revision+1},{domain:'driver-receipt'}])await assert.rejects(()=>verifyCasePayload(payload,{...selected,...patch},pins,now));
  for(const change of [value=>{value.body.title='Changed signed title';},value=>{value.body.requests[0].review.decision='replacement_requested';},value=>{value.certificate.actor='another-reviewer';},value=>{value.certificate.signature.value=encode64(new Uint8Array(64));}]){const altered=structuredClone(payload);change(altered);await assert.rejects(()=>verifyCasePayload(altered,selected,pins,now));}
  await assert.rejects(()=>verifyCasePayload({...payload,extra:'plaintext'},selected,pins,now));await assert.rejects(()=>verifyCasePayload({version:1,type:'tax-case',body,certificate:null},selected,pins,now));
  await assert.rejects(()=>signCasePayload(body,selected,unlocked,{actor:'other-reviewer',now}));await assert.rejects(()=>verifyCasePayload(payload,selected,pins,now-61001));
  await assert.rejects(()=>signCasePayload(body,{...selected,objectId:'ordinary-item'},unlocked,{actor,now}));
  const mutable=structuredClone(payload),verification=verifyCasePayload(mutable,selected,pins,now);mutable.body.title='Changed while verification awaited';assert.equal((await verification).title,body.title);
});
