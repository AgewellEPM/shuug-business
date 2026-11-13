import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {encode64,decode64,verifyEnrollmentManifest,openEnvelope} from './envelope.mjs';
import {verifyStaffGrant,secureEnvelopeDigest,openStaffCapsule,verifyStaffCapsuleSignature} from './staff-grants.mjs';
import {assertCaseBody,assertCaseCommand,validateCaseEvidence,applyCaseTransition} from './case-model.mjs';
import {verifyCasePayload} from './case-certificate.mjs';
import {isOfficeBody,OFFICE_MAX_BYTES} from './office-model.mjs';
import {verifyAuthorizationEvidence} from './case-authorization.mjs';
import {CASE_BINDING,MAX_CASE_PROPOSAL_BYTES,assertCaseBinding,assertCaseProposal,canonicalCaseProposalAad,canonicalCaseProposal,canonicalCaseReview,exactCaseObject} from './case-contract.mjs';
const hpke=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()}),utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),info=utf8.encode('shuug/secure-tax-case-proposal/v1');
const fail=()=>{throw new Error('The encrypted case, selected evidence or private transition review does not match.');};
const digest=async value=>encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(value))));
export const caseProposalDigest=value=>digest(canonicalCaseProposal(value));
export function checkedCaseBody(value){assertCaseBody(value);if(utf8.encode(canonicalCaseReview(value)).length>(isOfficeBody(value)?OFFICE_MAX_BYTES:128*1024))fail();return value;}
export const caseContext=(envelope,clientId)=>({...envelope.context,clientId});
export async function privateCaseReviewCommitment(review){
  exactCaseObject(review,['version','type','binding','reviewSalt','before','command','after','evidence']);if(review.version!==1||review.type!=='shuug-private-case-transition-review')fail();exactCaseObject(review.binding,CASE_BINDING);assertCaseBinding(review.binding);decode64(review.reviewSalt,32);
  if(review.binding.sourceRevision===0){if(review.before!==null)fail();}else checkedCaseBody(review.before);checkedCaseBody(review.after);assertCaseCommand(review.command);if(review.evidence!==null)validateCaseEvidence(review.evidence);
  const value=canonicalCaseReview([1,'shuug/private-case-transition-review',review.binding,review.reviewSalt,review.before,review.command,review.after,review.evidence]);if(utf8.encode(value).length>64*1024*1024)fail();return digest(value);
}
async function scope(envelope,manifest,grant,expected,pins,now){
  exactCaseObject(expected,['accountId','clientId','staffAccountId','staffKeyId','objectId','revision','domain',...['minimumGrantEpoch','minimumManifestEpoch'].filter(key=>Object.hasOwn(expected,key))]);
  if(!Number.isSafeInteger(expected.revision)||expected.revision<0||expected.revision>=1000000000||expected.domain!=='tax-document'||(expected.revision===0)!==(envelope===null))fail();
  const verified=await verifyStaffGrant(grant,expected,pins,now),enrollment=await verifyEnrollmentManifest(manifest,{accountId:expected.accountId,clientId:expected.clientId,minimumEpoch:expected.minimumManifestEpoch??1},pins,now);
  if(verified.status!=='active'||!grant.domains.includes('tax-document'))fail();
  if(envelope!==null&&(envelope.context.workspaceId!==pins.workspaceId||envelope.context.accountId!==expected.accountId||envelope.context.objectId!==expected.objectId||envelope.context.revision!==expected.revision||envelope.context.domain!=='tax-document'))fail();
  const binding={workspaceId:pins.workspaceId,accountId:expected.accountId,clientId:expected.clientId,objectId:expected.objectId,sourceRevision:expected.revision,sourceEnvelopeDigest:envelope===null?null:await secureEnvelopeDigest(envelope),manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,grantId:grant.grantId,grantEpoch:grant.epoch,grantDigest:verified.grantDigest,staffAccountId:expected.staffAccountId,staffKeyId:expected.staffKeyId};assertCaseBinding(binding);return {binding,enrollment};
}
export async function verifyCaseProposalScope(proposal,envelope,manifest,grant,expected,pins,now=Date.now()){
  assertCaseProposal(proposal);if(Date.parse(proposal.createdAt)>now+60000||Date.parse(proposal.expiresAt)<=now)fail();const selected=await scope(envelope,manifest,grant,expected,pins,now);
  if(CASE_BINDING.some(key=>proposal[key]!==selected.binding[key])||Date.parse(proposal.createdAt)<Math.max(Date.parse(grant.issuedAt),Date.parse(manifest.issuedAt))||Date.parse(proposal.expiresAt)>Math.min(Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt)))fail();return selected;
}
export async function selectedCaseEvidence(envelope,capsule,manifest,grant,expected,pins,open,now=Date.now()){
  if(envelope===null&&capsule===null)return null;if(envelope===null||capsule===null)fail();
  const context=envelope.context;if(context.workspaceId!==pins.workspaceId||context.accountId!==expected.accountId||!['tax-document','driver-receipt'].includes(context.domain)||!grant.domains.includes(context.domain))fail();
  await verifyStaffCapsuleSignature(capsule,pins,now);const grantProof=await verifyStaffGrant(grant,expected,pins,now),envelopeDigest=await secureEnvelopeDigest(envelope);
  if(capsule.grantId!==grant.grantId||capsule.grantEpoch!==grant.epoch||capsule.grantDigest!==grantProof.grantDigest||capsule.staffKeyId!==grant.staff.keyId||capsule.manifestId!==manifest.manifestId||capsule.manifestEpoch!==manifest.epoch||capsule.envelopeDigest!==envelopeDigest||['workspaceId','accountId','objectId','revision','domain'].some(key=>capsule.context[key]!==context[key])||Date.parse(capsule.issuedAt)<Math.max(Date.parse(grant.issuedAt),Date.parse(manifest.issuedAt))||Date.parse(capsule.expiresAt)>Math.min(Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt)))fail();
  const bytes=await open(envelope,capsule,{...expected,objectId:context.objectId,revision:context.revision,domain:context.domain});
  try{const payload=JSON.parse(decoder.decode(bytes));if(payload?.type==='client-office')await verifyCasePayload(payload,caseContext(envelope,expected.clientId),pins,now);return validateCaseEvidence({reference:{objectId:context.objectId,revision:context.revision,envelopeDigest,domain:context.domain},payload});}finally{bytes.fill(0);}
}
export async function prepareCaseTransition({envelope=null,manifest,grant,capsule=null,expected,pins,staffPrivateKey,command,evidenceEnvelope=null,evidenceCapsule=null,now=Date.now()}){
  command=structuredClone(command);assertCaseCommand(command);const {binding}=await scope(envelope,manifest,grant,expected,pins,now);let before=null;
  if(envelope!==null){const bytes=await openStaffCapsule(capsule,envelope,manifest,grant,expected,pins,staffPrivateKey,now);try{before=checkedCaseBody(await verifyCasePayload(JSON.parse(decoder.decode(bytes)),caseContext(envelope,expected.clientId),pins,now));}finally{bytes.fill(0);}}else if(capsule!==null)fail();
  const evidence=await selectedCaseEvidence(evidenceEnvelope,evidenceCapsule,manifest,grant,expected,pins,(e,c,scope)=>openStaffCapsule(c,e,manifest,grant,scope,pins,staffPrivateKey,now),now);await verifyAuthorizationEvidence(command,before,evidence,{workspaceId:pins.workspaceId,...expected});
  const at=new Date(now).toISOString(),after=checkedCaseBody(applyCaseTransition(before,command,{actor:grant.staffAccountId,at,evidence}));
  const review={version:1,type:'shuug-private-case-transition-review',binding,reviewSalt:encode64(crypto.getRandomValues(new Uint8Array(32))),before,command,after,evidence},reviewCommitment=await privateCaseReviewCommitment(review);
  const proposal={version:1,type:'shuug-secure-tax-case-proposal',proposalId:crypto.randomUUID(),...binding,reviewCommitment,createdAt:at,expiresAt:new Date(Math.min(now+86400000,Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt))).toISOString(),wrap:null};
  const sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(pins.firmRecoveryPublicKey,65)),senderKey:{privateKey:staffPrivateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(grant.staff.publicKey,65))},info}),bytes=utf8.encode(JSON.stringify({version:1,type:'shuug-case-transition',reviewSalt:review.reviewSalt,command,evidenceEnvelope,evidenceCapsule}));
  try{if(bytes.length>MAX_CASE_PROPOSAL_BYTES)fail();proposal.wrap={suite:'HPKE-P256-SHA256-A256GCM',mode:'auth',encapsulatedKey:encode64(new Uint8Array(sender.enc)),ciphertext:encode64(new Uint8Array(await sender.seal(bytes,utf8.encode(canonicalCaseProposalAad(proposal)))))};}finally{bytes.fill(0);}
  await verifyCaseProposalScope(proposal,envelope,manifest,grant,expected,pins,now);return {proposal,privateReview:review};
}
export async function openCaseTransition(proposal,grant,recoveryPrivateKey,recoveryPublicKey){
  assertCaseProposal(proposal);const recipient=await hpke.createRecipientContext({recipientKey:{privateKey:recoveryPrivateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(recoveryPublicKey,65))},senderPublicKey:await hpke.kem.deserializePublicKey(decode64(grant.staff.publicKey,65)),enc:decode64(proposal.wrap.encapsulatedKey,65),info}),bytes=new Uint8Array(await recipient.open(decode64(proposal.wrap.ciphertext,16,MAX_CASE_PROPOSAL_BYTES+16),utf8.encode(canonicalCaseProposalAad(proposal))));
  try{if(bytes.length>MAX_CASE_PROPOSAL_BYTES)fail();const value=JSON.parse(decoder.decode(bytes));exactCaseObject(value,['version','type','reviewSalt','command','evidenceEnvelope','evidenceCapsule']);if(value.version!==1||value.type!=='shuug-case-transition')fail();decode64(value.reviewSalt,32);assertCaseCommand(value.command);return value;}finally{bytes.fill(0);}
}
export async function openFirmCaseSource(envelope,manifest,expected,pins,recovery,now=Date.now()){
  if(envelope===null)return null;const enrollment=await verifyEnrollmentManifest(manifest,{accountId:expected.accountId,clientId:expected.clientId,minimumEpoch:expected.minimumManifestEpoch??1},pins,now),bytes=await openEnvelope(envelope,envelope.context,enrollment.recipients,'firm-recovery',recovery);
  try{return checkedCaseBody(await verifyCasePayload(JSON.parse(decoder.decode(bytes)),caseContext(envelope,expected.clientId),pins,now));}finally{bytes.fill(0);}
}
