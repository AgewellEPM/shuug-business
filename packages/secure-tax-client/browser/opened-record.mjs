import { secureEnvelopeDigest } from '../staff-grants.mjs';
import { isCasePayload, verifyCasePayload } from '../case-certificate.mjs';
import { isCaseObjectId } from '../case-contract.mjs';
import { isOfficeBody } from '../office-model.mjs';

export function assertClientWritablePayload(plaintext,objectId){
  if(isCaseObjectId(objectId))throw new Error('Case work is published only through the reviewed firm workflow. This generic client write was not uploaded.');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));}catch{return;}
  if(['tax-case','client-office'].includes(value?.type))throw new Error('Case work is published only through the reviewed firm workflow. This generic client write was not uploaded.');
}

/** Routing metadata is computed from the authenticated envelope. A claimed tax
 * case becomes trusted UI state only after its separate firm certificate opens. */
export async function openedRecordMetadata(plaintext,envelope,clientId,pins){
  const envelopeDigest=await secureEnvelopeDigest(envelope);let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));}catch{if(isCaseObjectId(envelope.context.objectId))throw new Error('The reserved case record does not contain a verifiable firm review.');return {envelopeDigest};}
  if(!isCaseObjectId(envelope.context.objectId)&&value?.type!=='tax-case'&&!isCasePayload(value))return {envelopeDigest};
  const verifiedCase=await verifyCasePayload(value,{...envelope.context,clientId},pins);
  return isOfficeBody(verifiedCase)?{envelopeDigest,verifiedOffice:verifiedCase}:{envelopeDigest,verifiedCase};
}
