import { secureEnvelopeDigest } from '../staff-grants.mjs';
import { isCasePayload, verifyCasePayload } from '../case-certificate.mjs';
import { isCaseObjectId } from '../case-contract.mjs';
import { isOfficeBody } from '../office-model.mjs';
import { isLegacyBooks,verifyLegacyBooks } from '../legacy-books.mjs';
import { encode64 } from '../envelope.mjs';
import { privacyProtocol } from './privacy-protocol.mjs';

export function assertClientWritablePayload(plaintext,objectId,pins=null){
  if(isCaseObjectId(objectId))throw new Error('Case work is published only through the reviewed firm workflow. This generic client write was not uploaded.');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));}catch{return;}
  if(['tax-case','client-office'].includes(value?.type))throw new Error('Case work is published only through the reviewed firm workflow. This generic client write was not uploaded.');
  if(pins?.profile==='client-only-v1'&&isLegacyBooks(value))throw new Error('Firm-reviewed legacy imports are unavailable for client-only records.');
}

/** Routing metadata is computed from the authenticated envelope. A claimed tax
 * case becomes trusted UI state only after its separate firm certificate opens. */
export async function openedRecordMetadata(plaintext,envelope,clientId,pins){
  const clientOnly=pins?.profile==='client-only-v1';
  if(clientOnly)privacyProtocol(pins).assertDispatch(envelope,envelope.context,{keyId:envelope.author?.keyId,publicKey:envelope.recipients?.[0]?.publicKey});
  const envelopeDigest=clientOnly?encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(envelope))))):await secureEnvelopeDigest(envelope);let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));}catch{if(isCaseObjectId(envelope.context.objectId))throw new Error('The reserved case record does not contain a verifiable firm review.');return {envelopeDigest};}
  if(value?.type==='driver-journal') {
    const expected={workspaceId:envelope.context.workspaceId,accountId:envelope.context.accountId,clientId,objectId:envelope.context.objectId};
    if(value.version!==1||envelope.context.domain!=='driver-state'||!value.binding||Object.keys(expected).some(key=>value.binding[key]!==expected[key])||!Number.isFinite(value.capturedAt)||value.capturedAt<0||value.journal?.version!==1||!Array.isArray(value.journal.entries))throw new Error('The decrypted device journal does not match its authenticated account binding.');
    return {envelopeDigest,journalBinding:expected};
  }
  if(clientOnly&&(isLegacyBooks(value)||isCaseObjectId(envelope.context.objectId)||value?.type==='tax-case'||value?.type==='client-office'||isCasePayload(value)))throw new Error('Firm-authored or firm-recovery records cannot be opened as client-only records.');
  if(isLegacyBooks(value)&&!isCaseObjectId(envelope.context.objectId))return {envelopeDigest,verifiedLegacyBooks:await verifyLegacyBooks(value,{...envelope.context,clientId},pins)};
  if(!isCaseObjectId(envelope.context.objectId)&&value?.type!=='tax-case'&&!isCasePayload(value))return {envelopeDigest};
  const verifiedCase=await verifyCasePayload(value,{...envelope.context,clientId},pins);
  return isOfficeBody(verifiedCase)?{envelopeDigest,verifiedOffice:verifiedCase}:{envelopeDigest,verifiedCase};
}
