import test from 'node:test';
import assert from 'node:assert/strict';
import {encode64} from '../envelope.mjs';
import {applyCaseTransition} from '../case-model.mjs';
import {authorizationPackage,prepareAuthorizationInput,verifyAuthorizationEvidence,assertAuthorizationInput} from '../case-authorization.mjs';
import {newReturn} from '../../tax-engine/index.mjs';
const at='2026-11-12T00:00:00.000Z',scope={workspaceId:'synthetic-workspace',accountId:'synthetic-account',clientId:'synthetic-client',objectId:'shuug-case:synthetic-authorization'};
const reference=id=>({objectId:id,revision:1,envelopeDigest:encode64(new Uint8Array(32).fill(7)),domain:'tax-document'});
const bytes=new TextEncoder().encode('%PDF-SYNTHETIC SIGNED EVIDENCE'),payload={version:1,type:'private-file',filename:'synthetic.pdf',mime:'application/pdf',data:encode64(bytes),byteLength:bytes.length,purpose:'tax-document',category:'tax',notes:'',savedAt:at};
const fields={method:'wet-ink',signedOn:'2026-11-01',signers:[{name:'Synthetic signer',capacity:'Taxpayer'}],signaturesReviewed:true,notes:''};
const act=(body,type,input,evidence=null)=>applyCaseTransition(body,{actionId:crypto.randomUUID(),type,input},{actor:'synthetic-preparer',at,evidence});
function fixture(){
  let body=act(null,'case.create',{title:'Synthetic package',year:2025,kind:'1040'});body=act(body,'request.add',{requestId:'source',title:'Source file',due:'',notes:''});body=act(body,'document.review',{requestId:'source',document:reference('source-file'),decision:'reviewed',notes:''},{reference:reference('source-file'),payload});body=act(body,'draft.link',{document:reference('return'),notes:''},{reference:reference('return'),payload:newReturn('1040')});
  return {body,record:{...reference('signature'),plaintext:new TextEncoder().encode(JSON.stringify(payload))},evidence:{reference:reference('signature'),payload}};
}
test('authorization digest binds scope, actual file bytes and exact content while review history remains appendable',async()=>{
  const {body,record,evidence}=fixture(),input=await prepareAuthorizationInput(body,scope,record,fields),command={actionId:'record-authorization',type:'authorization.review',input};
  await verifyAuthorizationEvidence(command,body,evidence,scope);const after=act(body,command.type,input,evidence);assert.equal((await authorizationPackage(after,scope)).digest,input.packageDigest);
  for(const key of ['workspaceId','accountId','clientId','objectId'])await assert.rejects(()=>verifyAuthorizationEvidence(command,body,evidence,{...scope,[key]:scope[key]+'-other'}),/exact return package/);
  await assert.rejects(()=>verifyAuthorizationEvidence({...command,input:{...input,packageDigest:encode64(new Uint8Array(32))}},body,evidence,scope));
  const changed=new TextEncoder().encode('%PDF-SYNTHETIC MODIFIED SIGNATURE');await assert.rejects(()=>verifyAuthorizationEvidence(command,body,{...evidence,payload:{...payload,data:encode64(changed),byteLength:changed.length}},scope));
  const changedBody=act(after,'draft.link',{document:reference('return'),notes:'Reviewed again after a change'},{reference:reference('return'),payload:newReturn('1040')});const newInput=await prepareAuthorizationInput(changedBody,scope,{...record,objectId:'reuploaded-signature'},fields);
  assert.throws(()=>act(changedBody,'authorization.review',newInput,{reference:reference('reuploaded-signature'),payload}),/earlier package/);
});
test('authorization review requires actual PDF evidence, explicit signature review and valid signer/date facts',async()=>{
  const {body,record,evidence}=fixture(),input=await prepareAuthorizationInput(body,scope,record,fields);
  for(const mutation of [{signaturesReviewed:false},{signers:[]},{signers:[fields.signers[0],fields.signers[0]]},{method:'typed-checkbox'},{signedOn:'2026-02-30'}])assert.throws(()=>assertAuthorizationInput({...input,...mutation}));
  assert.throws(()=>act(body,'authorization.review',{...input,signedOn:'2027-01-01'},evidence),/signature date/);
  await assert.rejects(()=>prepareAuthorizationInput(body,scope,{...record,plaintext:new TextEncoder().encode(JSON.stringify({...payload,mime:'image/png'}))},fields),/actual signed authorization/);
});
