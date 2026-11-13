import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareAuthorizationInput} from '../packages/secure-tax-client/case-authorization.mjs';
import {caseSnapshot,caseBookVersion} from '../packages/secure-tax-client/case-model.mjs';
import {officeLedgers} from '../packages/secure-tax-client/office-model.mjs';

export async function proveAuthorizationEvidence({scope,readers,remote,caseIds,taxReturns,sourceId,finance,caseAction,reference,shareLatest,restoreStaff,marker}){
  const staff=readers[1],signed=new Map(),fields={method:'wet-ink',signedOn:'2026-11-01',signers:[{name:'Synthetic signer',capacity:'Synthetic authorized signer'}],signaturesReviewed:true,notes:marker};
  async function uploadSignature(item,generation){
    const bytes=new TextEncoder().encode(`%PDF-SYNTHETIC SIGNED ${item.kind} ${generation} ${marker}`),payload={version:1,type:'private-file',filename:'synthetic-authorization.pdf',mime:'application/pdf',data:Buffer.from(bytes).toString('base64url'),byteLength:bytes.length,purpose:'tax-document',category:'tax',notes:marker,savedAt:new Date().toISOString()};
    const saved=await remote.save('tax-document',new TextEncoder().encode(JSON.stringify(payload)));await shareLatest(saved.objectId);return saved.objectId;
  }
  async function record(item,fileId){const input=await prepareAuthorizationInput(staff.records.get(item.id).verifiedCase,{...scope,objectId:item.id},staff.records.get(fileId),fields);await caseAction(item.id,'authorization.review',input,fileId);return input;}
  const check=status=>{for(const reader of readers)for(const item of caseIds){const snapshot=caseSnapshot(reader.records.get(item.id).verifiedCase,reader.records);assert.equal(snapshot.authorization.freshness,status);assert.equal(snapshot.filingReady,false);}};
  for(const item of caseIds){
    await caseAction(item.id,'document.review',{requestId:item.requestId,document:reference(sourceId),decision:'reviewed',notes:'Synthetic current source review'},sourceId);
    const fileId=await uploadSignature(item,1);signed.set(item.id,fileId);await record(item,fileId);
  }check('current');
  const invoiceId=randomUUID();await caseAction(finance.id,'fee.issue',{invoiceId,number:'SYNTHETIC-VOID-002',date:'2026-11-01',due:'2026-12-01',issuer:'Synthetic firm',billTo:'Synthetic client',lines:[{description:'Synthetic voidable fee',quantity:'1',unitCents:100,discountCents:0,taxCents:0}],terms:'',notes:''});check('current');await caseAction(finance.id,'fee.void',{invoiceId,date:'2026-11-01',reason:'Synthetic unused invoice',notes:''});check('current');
  let ledger=officeLedgers(staff.records.get(finance.id).verifiedOffice.history)[0];await caseAction(finance.id,'ledger.account.add',{ledgerId:ledger.id,account:{number:1060,name:'Synthetic shared book adjustment',classification:'bank'},notes:''});check('stale');ledger=officeLedgers(staff.records.get(finance.id).verifiedOffice.history)[0];
  for(const item of caseIds){
    await caseAction(item.id,'books.link',{document:reference(finance.id),ledgerId:ledger.id,ledgerVersion:ledger.version,notes:'Synthetic changed books reviewed'},finance.id);
    const body=staff.records.get(item.id).verifiedCase,draft=taxReturns.find(value=>value.kind===item.kind);await caseAction(item.id,'draft.link',{document:reference(draft.objectId),booksVersion:caseBookVersion(body.history,body.year),notes:'Synthetic return and changed books reviewed'},draft.objectId);
    const reused=await prepareAuthorizationInput(staff.records.get(item.id).verifiedCase,{...scope,objectId:item.id},staff.records.get(signed.get(item.id)),fields);
    await assert.rejects(()=>staff.prepareCaseAction(item.id,{actionId:randomUUID(),type:'authorization.review',input:reused},signed.get(item.id)),/earlier package/);await restoreStaff();
    await record(item,await uploadSignature(item,2));
  }check('current');finance.body=structuredClone(readers[0].records.get(finance.id).verifiedOffice);
  return {kinds:caseIds.map(item=>item.kind),reviewedEvidenceCurrent:true,signedPdfBytesBound:true,exactPackageBound:true,businessBookChangeInvalidatesAuthorization:true,feeOnlyChangesPreserveAuthorization:true,priorSignatureReuseRejected:true,newSignatureRequiredAfterChange:true,clientAndStaffAgree:true,filingReady:false,identityProofingPerformed:false,electronicSignaturesCreated:false,realSignatureUsed:false};
}

export function verifyRestoredAuthorizations(caseIds,readers,proof){
  for(const reader of readers)for(const item of caseIds){const snapshot=caseSnapshot(reader.records.get(item.id).verifiedCase,reader.records);assert.equal(snapshot.authorization.freshness,'current');assert.equal(snapshot.authorization.verification,'staff-reviewed-signed-evidence');assert.equal(snapshot.filingReady,false);}
  proof.cleanRestoreVerified=true;
}
