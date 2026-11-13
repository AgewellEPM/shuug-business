// Private, reviewed signature evidence. This is not an electronic signature
// provider, identity proofing service, filing approval or transmission receipt.
import {decode64,encode64} from './envelope.mjs';
import {canonicalCaseJson} from './case-json.mjs';
import {exact,identifier,text,date,reference,reject} from './office-validation.mjs';
const utf8=new TextEncoder();
export const AUTHORIZATION_ACTION='authorization.review';
export const caseContentVersion=body=>body.history.findLast(event=>event.type!==AUTHORIZATION_ACTION)?.actionId??null;
export function authorizationContent(body){
  return {title:body.title,year:body.year,kind:body.kind,requests:body.requests,draft:body.draft,history:body.history.filter(event=>event.type!==AUTHORIZATION_ACTION)};
}
export async function authorizationPackage(body,scope){
  const binding={workspaceId:scope.workspaceId,accountId:scope.accountId,clientId:scope.clientId,caseId:scope.objectId};Object.values(binding).forEach(identifier);
  const content=structuredClone(authorizationContent(body)),value={version:1,type:'shuug-private-authorization-package',binding,content};
  const digest=encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(canonicalCaseJson(value)))));
  return {...value,digest,contentVersion:caseContentVersion(body),filingReady:false};
}
export function assertAuthorizationInput(input){
  exact(input,['document','packageDigest','contentVersion','evidenceDigest','method','signedOn','signers','signaturesReviewed','notes']);reference(input.document);if(input.document.domain!=='tax-document')reject();
  decode64(input.packageDigest,32);decode64(input.evidenceDigest,32);identifier(input.contentVersion);date(input.signedOn);text(input.notes,2000,false);
  if(!['wet-ink','external-electronic'].includes(input.method)||input.signaturesReviewed!==true)reject('Review the signed copy and all required signers before recording authorization evidence.');
  if(!Array.isArray(input.signers)||input.signers.length<1||input.signers.length>10)reject('Record the reviewed signers and their capacities.');
  const seen=new Set();for(const signer of input.signers){exact(signer,['name','capacity']);text(signer.name,160);text(signer.capacity,160);const key=signer.name.trim().toLocaleLowerCase('en-US');if(seen.has(key))reject('Do not duplicate a signer.');seen.add(key);}return input;
}
export async function authorizationFileDigest(payload){
  if(payload?.version!==1||payload?.type!=='private-file'||payload.mime!=='application/pdf')reject('Select the uploaded PDF containing the actual signed authorization evidence.');
  const bytes=decode64(payload.data,1,10*1024*1024);
  try{if(bytes.length!==payload.byteLength||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')reject();return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}finally{bytes.fill(0);}
}
export function assertAuthorizationHistory(history){
  const bindings=new Map();let version=null;
  for(const event of history){
    if(event.type!==AUTHORIZATION_ACTION){version=event.actionId;continue;}
    const input=assertAuthorizationInput(event.input);if(input.contentVersion!==version||input.signedOn>event.at.slice(0,10))reject('Authorization evidence does not match the case version or signature date.');
    for(const key of ['file:'+input.evidenceDigest,'object:'+input.document.objectId]){
      const previous=bindings.get(key);if(previous&&previous!==input.packageDigest)reject('This authorization was already bound to an earlier package. Obtain new signed evidence for the changed package.');bindings.set(key,input.packageDigest);
    }
  }
}
export async function verifyAuthorizationEvidence(command,before,evidence,scope){
  if(command.type!==AUTHORIZATION_ACTION)return;
  assertAuthorizationInput(command.input);
  if(!before?.draft||!before.requests?.length||before.requests.some(item=>item.review?.decision!=='reviewed'))reject('Review the requested documents and link the prepared return before recording authorization evidence.');
  const selected=structuredClone(command.input),payload=structuredClone(evidence?.payload),pack=await authorizationPackage(before,scope);
  if(selected.contentVersion!==pack.contentVersion||selected.packageDigest!==pack.digest||selected.evidenceDigest!==await authorizationFileDigest(payload))reject('The authorization evidence or exact return package changed. Review the current signed copy again.');
}
export async function prepareAuthorizationInput(body,scope,record,fields){
  const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(record.plaintext)),selected=structuredClone(fields),document={objectId:record.objectId,revision:record.revision,envelopeDigest:record.envelopeDigest,domain:record.domain},pack=await authorizationPackage(body,scope);
  return assertAuthorizationInput({...selected,document,packageDigest:pack.digest,contentVersion:pack.contentVersion,evidenceDigest:await authorizationFileDigest(payload)});
}
