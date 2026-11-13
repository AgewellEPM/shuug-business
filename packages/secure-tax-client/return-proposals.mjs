import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {encode64,decode64,verifyEnrollmentManifest} from './envelope.mjs';
import {verifyStaffGrant,secureEnvelopeDigest,openStaffCapsule} from './staff-grants.mjs';
import {RETURN_EDIT_BINDING,assertReturnProposal,canonicalReturnProposalAad,canonicalReturnProposal,canonicalPrivateReview,exactEditObject} from './return-edit-contract.mjs';
const hpke=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()}),utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),info=utf8.encode('shuug/secure-tax-return-proposal/v1');
const fail=()=>{throw new Error('The encrypted return proposal, source revision or private review does not match.');};
const digest=async value=>encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(value))));
export const returnProposalDigest=value=>digest(canonicalReturnProposal(value));
// Encrypted source intake is independent of installed annual calculations/forms.
// Keep this contract local so off-host review kits do not import the tax engine.
export const returnIntakeYears=Object.freeze([2023,2024,2025,2026,2027]);
export function checkedReturnDraft(value){
  if(!value||value.version!==1||value.type!=='tax-return'||!returnIntakeYears.includes(value.year)||!['1040','1065','1120S','1120'].includes(value.kind))fail();
  const text=canonicalPrivateReview(value);if(utf8.encode(text).length>250000)fail();return value;
}
export async function privateReturnReviewCommitment(review){
  exactEditObject(review,['version','type','binding','reviewSalt','before','after']);
  if(review.version!==1||review.type!=='shuug-private-return-edit-review')fail();exactEditObject(review.binding,RETURN_EDIT_BINDING);decode64(review.reviewSalt,32);checkedReturnDraft(review.before);checkedReturnDraft(review.after);
  if(review.before.kind!==review.after.kind||review.before.year!==review.after.year)fail();
  return digest(canonicalPrivateReview([1,'shuug/private-return-edit-review',review.binding,review.reviewSalt,review.before,review.after]));
}
export async function verifyReturnProposalSource(proposal,envelope,manifest,grant,expected,pins,now=Date.now()){
  assertReturnProposal(proposal);if(Date.parse(proposal.createdAt)>now+60000||Date.parse(proposal.expiresAt)<=now)fail();
  const verified=await verifyStaffGrant(grant,expected,pins,now),enrollment=await verifyEnrollmentManifest(manifest,{accountId:expected.accountId,clientId:expected.clientId,minimumEpoch:expected.minimumManifestEpoch??1},pins,now);
  const binding={workspaceId:pins.workspaceId,accountId:expected.accountId,clientId:expected.clientId,objectId:expected.objectId,sourceRevision:expected.revision,sourceEnvelopeDigest:await secureEnvelopeDigest(envelope),manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,grantId:grant.grantId,grantEpoch:grant.epoch,grantDigest:verified.grantDigest,staffAccountId:expected.staffAccountId,staffKeyId:expected.staffKeyId};
  if(verified.status!=='active'||expected.domain!=='tax-document'||!grant.domains.includes('tax-document')||RETURN_EDIT_BINDING.some(key=>proposal[key]!==binding[key])||envelope.context.domain!=='tax-document'||envelope.context.objectId!==expected.objectId||envelope.context.revision!==expected.revision||envelope.context.accountId!==expected.accountId||envelope.context.workspaceId!==pins.workspaceId||Date.parse(proposal.createdAt)<Math.max(Date.parse(grant.issuedAt),Date.parse(manifest.issuedAt))||Date.parse(proposal.expiresAt)>Math.min(Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt)))fail();return {binding,enrollment};
}
export async function prepareReturnProposal({envelope,manifest,grant,capsule,expected,pins,staffPrivateKey,after,now=Date.now()}){
  checkedReturnDraft(after);const beforeBytes=await openStaffCapsule(capsule,envelope,manifest,grant,expected,pins,staffPrivateKey);
  try{
    const before=checkedReturnDraft(JSON.parse(decoder.decode(beforeBytes))),verified=await verifyStaffGrant(grant,expected,pins,now),binding={workspaceId:pins.workspaceId,accountId:expected.accountId,clientId:expected.clientId,objectId:expected.objectId,sourceRevision:expected.revision,sourceEnvelopeDigest:await secureEnvelopeDigest(envelope),manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,grantId:grant.grantId,grantEpoch:grant.epoch,grantDigest:verified.grantDigest,staffAccountId:expected.staffAccountId,staffKeyId:expected.staffKeyId};
    const review={version:1,type:'shuug-private-return-edit-review',binding,reviewSalt:encode64(crypto.getRandomValues(new Uint8Array(32))),before,after:structuredClone(after)},reviewCommitment=await privateReturnReviewCommitment(review);
    const proposal={version:1,type:'shuug-secure-tax-return-proposal',proposalId:crypto.randomUUID(),...binding,reviewCommitment,createdAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+86400000,Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt))).toISOString(),wrap:null};
    const sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(pins.firmRecoveryPublicKey,65)),senderKey:{privateKey:staffPrivateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(grant.staff.publicKey,65))},info}),bytes=utf8.encode(JSON.stringify({version:1,type:'shuug-return-replacement',reviewSalt:review.reviewSalt,after:review.after}));
    try{proposal.wrap={suite:'HPKE-P256-SHA256-A256GCM',mode:'auth',encapsulatedKey:encode64(new Uint8Array(sender.enc)),ciphertext:encode64(new Uint8Array(await sender.seal(bytes,utf8.encode(canonicalReturnProposalAad(proposal)))))};}finally{bytes.fill(0);}
    await verifyReturnProposalSource(proposal,envelope,manifest,grant,expected,pins,now);return {proposal,privateReview:review};
  }finally{beforeBytes.fill(0);}
}
export async function openReturnReplacement(proposal,grant,recoveryPrivateKey,recoveryPublicKey){
  assertReturnProposal(proposal);const recipient=await hpke.createRecipientContext({recipientKey:{privateKey:recoveryPrivateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(recoveryPublicKey,65))},senderPublicKey:await hpke.kem.deserializePublicKey(decode64(grant.staff.publicKey,65)),enc:decode64(proposal.wrap.encapsulatedKey,65),info});
  const bytes=new Uint8Array(await recipient.open(decode64(proposal.wrap.ciphertext,16,524304),utf8.encode(canonicalReturnProposalAad(proposal))));
  try{const value=JSON.parse(decoder.decode(bytes));exactEditObject(value,['version','type','reviewSalt','after']);if(value.version!==1||value.type!=='shuug-return-replacement')fail();decode64(value.reviewSalt,32);checkedReturnDraft(value.after);return value;}finally{bytes.fill(0);}
}
