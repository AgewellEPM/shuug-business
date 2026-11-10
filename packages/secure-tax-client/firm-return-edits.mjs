// Offhost only. Staff read grants are unchanged; the firm approves one exact
// replacement after reviewing the private before/after file and its commitment.
import {encode64,publicKeyId,openEnvelope,sealEnvelope} from './envelope.mjs';
import {secureEnvelopeDigest} from './staff-grants.mjs';
import {createStaffCapsule} from './firm-staff.mjs';
import {RETURN_EDIT_BINDING,assertReturnEditApproval,canonicalReturnEditApproval} from './return-edit-contract.mjs';
import {verifyReturnProposalSource,returnProposalDigest,openReturnReplacement,privateReturnReviewCommitment,checkedReturnDraft} from './return-proposals.mjs';
const utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),fail=()=>{throw new Error('The selected return correction does not match the independently reviewed content and source.');};
export async function approveReturnEdit({proposal,envelope,manifest,grant,expected,reviewedCommitment,reviewReference,unlocked,now=Date.now()}){
  if(typeof reviewedCommitment!=='string'||reviewedCommitment!==proposal.reviewCommitment)fail();
  const {binding,enrollment}=await verifyReturnProposalSource(proposal,envelope,manifest,grant,expected,unlocked.publicPins,now),context={workspaceId:binding.workspaceId,accountId:binding.accountId,objectId:binding.objectId,revision:binding.sourceRevision,domain:'tax-document'};
  const bytes=await openEnvelope(envelope,context,enrollment.recipients,'firm-recovery',unlocked.recovery);
  let plaintext;
  try{
    const before=checkedReturnDraft(JSON.parse(decoder.decode(bytes))),replacement=await openReturnReplacement(proposal,grant,unlocked.recovery,unlocked.publicPins.firmRecoveryPublicKey);
    const review={version:1,type:'shuug-private-return-edit-review',binding,reviewSalt:replacement.reviewSalt,before,after:replacement.after};if(await privateReturnReviewCommitment(review)!==reviewedCommitment)fail();
    plaintext=utf8.encode(JSON.stringify(replacement.after));const next=await sealEnvelope(plaintext,{...context,revision:context.revision+1},enrollment.recipients,'firm-recovery',unlocked.recovery);
    const approval={version:1,type:'shuug-secure-tax-return-edit-approval',approvalId:crypto.randomUUID(),proposalId:proposal.proposalId,...Object.fromEntries(RETURN_EDIT_BINDING.map(key=>[key,proposal[key]])),proposalDigest:await returnProposalDigest(proposal),reviewCommitment:reviewedCommitment,newEnvelopeDigest:await secureEnvelopeDigest(next),reviewReference,issuedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+86400000,Date.parse(proposal.expiresAt))).toISOString(),signature:{algorithm:'ES256-P1363',signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),value:''}};
    approval.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(canonicalReturnEditApproval(approval)))));assertReturnEditApproval(approval);
    const capsule=await createStaffCapsule(next,manifest,grant,unlocked,{...expected,revision:next.context.revision,domain:'tax-document'},{now});
    return {approval,envelope:next,capsule};
  }finally{bytes.fill(0);plaintext?.fill(0);}
}
