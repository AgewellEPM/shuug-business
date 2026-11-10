// Offhost only. A read grant proposes a new return; only the firm approves it.
import {encode64,publicKeyId,sealEnvelope} from './envelope.mjs';
import {secureEnvelopeDigest} from './staff-grants.mjs';
import {createStaffCapsule} from './firm-staff.mjs';
import {RETURN_CREATE_BINDING,assertReturnCreationApproval,canonicalReturnCreationApproval} from './return-create-contract.mjs';
import {verifyReturnCreationScope,returnCreationProposalDigest,openReturnCreation,privateReturnCreationReviewCommitment} from './return-creations.mjs';
const utf8=new TextEncoder(),fail=()=>{throw new Error('The new return does not match the independently reviewed content and assignment.');};
export async function approveReturnCreation({proposal,manifest,grant,expected,reviewedCommitment,reviewReference,unlocked,now=Date.now()}){
  if(typeof reviewedCommitment!=='string'||reviewedCommitment!==proposal.reviewCommitment)fail();
  const {binding,enrollment}=await verifyReturnCreationScope(proposal,manifest,grant,expected,unlocked.publicPins,now),replacement=await openReturnCreation(proposal,grant,unlocked.recovery,unlocked.publicPins.firmRecoveryPublicKey);
  const review={version:1,type:'shuug-private-return-create-review',binding,reviewSalt:replacement.reviewSalt,before:null,after:replacement.after};if(await privateReturnCreationReviewCommitment(review)!==reviewedCommitment)fail();
  const plaintext=utf8.encode(JSON.stringify(replacement.after));
  try{
    const envelope=await sealEnvelope(plaintext,{workspaceId:binding.workspaceId,accountId:binding.accountId,objectId:binding.objectId,revision:1,domain:'tax-document'},enrollment.recipients,'firm-recovery',unlocked.recovery);
    const approval={version:1,type:'shuug-secure-tax-return-create-approval',approvalId:crypto.randomUUID(),proposalId:proposal.proposalId,...Object.fromEntries(RETURN_CREATE_BINDING.map(key=>[key,proposal[key]])),proposalDigest:await returnCreationProposalDigest(proposal),reviewCommitment:reviewedCommitment,newEnvelopeDigest:await secureEnvelopeDigest(envelope),reviewReference,issuedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+86400000,Date.parse(proposal.expiresAt))).toISOString(),signature:{algorithm:'ES256-P1363',signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),value:''}};
    approval.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(canonicalReturnCreationApproval(approval)))));assertReturnCreationApproval(approval);
    const capsule=await createStaffCapsule(envelope,manifest,grant,unlocked,expected,{now});return {approval,envelope,capsule};
  }finally{plaintext.fill(0);}
}
