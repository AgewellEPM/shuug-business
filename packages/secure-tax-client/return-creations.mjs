import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {encode64,decode64,verifyEnrollmentManifest} from './envelope.mjs';
import {verifyStaffGrant} from './staff-grants.mjs';
import {checkedReturnDraft} from './return-proposals.mjs';
import {canonicalPrivateReview} from './return-edit-contract.mjs';
import {RETURN_CREATE_BINDING,assertReturnCreationProposal,canonicalReturnCreationProposalAad,canonicalReturnCreationProposal,exactCreateObject} from './return-create-contract.mjs';
const hpke=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()}),utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),info=utf8.encode('shuug/secure-tax-return-create-proposal/v1');
const fail=()=>{throw new Error('The encrypted return creation, assignment or private review does not match.');};
const digest=async value=>encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(value))));
export const returnCreationProposalDigest=value=>digest(canonicalReturnCreationProposal(value));
export async function privateReturnCreationReviewCommitment(review){
  exactCreateObject(review,['version','type','binding','reviewSalt','before','after']);
  if(review.version!==1||review.type!=='shuug-private-return-create-review'||review.before!==null)fail();exactCreateObject(review.binding,RETURN_CREATE_BINDING);decode64(review.reviewSalt,32);checkedReturnDraft(review.after);
  return digest(canonicalPrivateReview([1,'shuug/private-return-create-review',review.binding,review.reviewSalt,null,review.after]));
}
async function creationScope(manifest,grant,expected,pins,now){
  exactCreateObject(expected,['accountId','clientId','staffAccountId','staffKeyId','objectId','revision','domain',...['minimumGrantEpoch','minimumManifestEpoch'].filter(key=>Object.hasOwn(expected,key))]);
  if(expected.revision!==1||expected.domain!=='tax-document')fail();
  const verified=await verifyStaffGrant(grant,expected,pins,now),enrollment=await verifyEnrollmentManifest(manifest,{accountId:expected.accountId,clientId:expected.clientId,minimumEpoch:expected.minimumManifestEpoch??1},pins,now);
  if(verified.status!=='active'||!grant.domains.includes('tax-document'))fail();
  const binding={workspaceId:pins.workspaceId,accountId:expected.accountId,clientId:expected.clientId,objectId:expected.objectId,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,grantId:grant.grantId,grantEpoch:grant.epoch,grantDigest:verified.grantDigest,staffAccountId:expected.staffAccountId,staffKeyId:expected.staffKeyId};
  return {binding,enrollment};
}
export async function verifyReturnCreationScope(proposal,manifest,grant,expected,pins,now=Date.now()){
  assertReturnCreationProposal(proposal);if(Date.parse(proposal.createdAt)>now+60000||Date.parse(proposal.expiresAt)<=now)fail();
  const selected=await creationScope(manifest,grant,expected,pins,now);
  if(RETURN_CREATE_BINDING.some(key=>proposal[key]!==selected.binding[key])||Date.parse(proposal.createdAt)<Math.max(Date.parse(grant.issuedAt),Date.parse(manifest.issuedAt))||Date.parse(proposal.expiresAt)>Math.min(Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt)))fail();return selected;
}
export async function prepareReturnCreation({after,manifest,grant,expected,pins,staffPrivateKey,now=Date.now()}){
  checkedReturnDraft(after);const {binding}=await creationScope(manifest,grant,expected,pins,now);
  const review={version:1,type:'shuug-private-return-create-review',binding,reviewSalt:encode64(crypto.getRandomValues(new Uint8Array(32))),before:null,after:structuredClone(after)},reviewCommitment=await privateReturnCreationReviewCommitment(review);
  const proposal={version:1,type:'shuug-secure-tax-return-create-proposal',proposalId:crypto.randomUUID(),...binding,reviewCommitment,createdAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+86400000,Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt))).toISOString(),wrap:null};
  const sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(pins.firmRecoveryPublicKey,65)),senderKey:{privateKey:staffPrivateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(grant.staff.publicKey,65))},info}),bytes=utf8.encode(JSON.stringify({version:1,type:'shuug-return-creation',reviewSalt:review.reviewSalt,after:review.after}));
  try{proposal.wrap={suite:'HPKE-P256-SHA256-A256GCM',mode:'auth',encapsulatedKey:encode64(new Uint8Array(sender.enc)),ciphertext:encode64(new Uint8Array(await sender.seal(bytes,utf8.encode(canonicalReturnCreationProposalAad(proposal)))))};}finally{bytes.fill(0);}
  await verifyReturnCreationScope(proposal,manifest,grant,expected,pins,now);return {proposal,privateReview:review};
}
export async function openReturnCreation(proposal,grant,recoveryPrivateKey,recoveryPublicKey){
  assertReturnCreationProposal(proposal);const recipient=await hpke.createRecipientContext({recipientKey:{privateKey:recoveryPrivateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(recoveryPublicKey,65))},senderPublicKey:await hpke.kem.deserializePublicKey(decode64(grant.staff.publicKey,65)),enc:decode64(proposal.wrap.encapsulatedKey,65),info});
  const bytes=new Uint8Array(await recipient.open(decode64(proposal.wrap.ciphertext,16,524304),utf8.encode(canonicalReturnCreationProposalAad(proposal))));
  try{const value=JSON.parse(decoder.decode(bytes));exactCreateObject(value,['version','type','reviewSalt','after']);if(value.version!==1||value.type!=='shuug-return-creation')fail();decode64(value.reviewSalt,32);checkedReturnDraft(value.after);return value;}finally{bytes.fill(0);}
}
