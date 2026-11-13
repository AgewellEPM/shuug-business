// Offhost only. Reconstruct the actual source and evidence; never accept arbitrary after-state.
import {encode64,publicKeyId,sealEnvelope,openEnvelope} from './envelope.mjs';
import {secureEnvelopeDigest} from './staff-grants.mjs';
import {createStaffCapsule} from './firm-staff.mjs';
import {applyCaseTransition} from './case-model.mjs';
import {verifyAuthorizationEvidence} from './case-authorization.mjs';
import {signCasePayload} from './case-certificate.mjs';
import {CASE_BINDING,assertCaseApproval,canonicalCaseApproval} from './case-contract.mjs';
import {verifyCaseProposalScope,openCaseTransition,caseProposalDigest,privateCaseReviewCommitment,checkedCaseBody,selectedCaseEvidence,openFirmCaseSource} from './case-proposals.mjs';
const utf8=new TextEncoder(),fail=()=>{throw new Error('The case transition does not match independently reviewed content, evidence and assignment.');};
export async function approveCaseTransition({proposal,envelope=null,manifest,grant,expected,reviewedCommitment,reviewReference,unlocked,now=Date.now()}){
  if(typeof reviewedCommitment!=='string'||reviewedCommitment!==proposal.reviewCommitment)fail();
  const {binding,enrollment}=await verifyCaseProposalScope(proposal,envelope,manifest,grant,expected,unlocked.publicPins,now),transition=await openCaseTransition(proposal,grant,unlocked.recovery,unlocked.publicPins.firmRecoveryPublicKey),before=await openFirmCaseSource(envelope,manifest,expected,unlocked.publicPins,unlocked.recovery,now);
  const evidence=await selectedCaseEvidence(transition.evidenceEnvelope,transition.evidenceCapsule,manifest,grant,expected,unlocked.publicPins,e=>openEnvelope(e,e.context,enrollment.recipients,'firm-recovery',unlocked.recovery),now);await verifyAuthorizationEvidence(transition.command,before,evidence,{workspaceId:unlocked.publicPins.workspaceId,...expected});
  const after=checkedCaseBody(applyCaseTransition(before,transition.command,{actor:grant.staffAccountId,at:proposal.createdAt,evidence}));
  const review={version:1,type:'shuug-private-case-transition-review',binding,reviewSalt:transition.reviewSalt,before,command:transition.command,after,evidence};if(await privateCaseReviewCommitment(review)!==reviewedCommitment)fail();
  const context={workspaceId:binding.workspaceId,accountId:binding.accountId,clientId:binding.clientId,objectId:binding.objectId,revision:binding.sourceRevision+1,domain:'tax-document'},payload=await signCasePayload(after,context,unlocked,{actor:grant.staffAccountId,now}),plaintext=utf8.encode(JSON.stringify(payload));
  try{
    const {clientId,...nativeContext}=context,next=await sealEnvelope(plaintext,nativeContext,enrollment.recipients,'firm-recovery',unlocked.recovery);
    const approval={version:1,type:'shuug-secure-tax-case-approval',approvalId:crypto.randomUUID(),proposalId:proposal.proposalId,...Object.fromEntries(CASE_BINDING.map(key=>[key,proposal[key]])),proposalDigest:await caseProposalDigest(proposal),reviewCommitment:reviewedCommitment,newEnvelopeDigest:await secureEnvelopeDigest(next),reviewReference,issuedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+86400000,Date.parse(proposal.expiresAt))).toISOString(),signature:{algorithm:'ES256-P1363',signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),value:''}};
    approval.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(canonicalCaseApproval(approval)))));assertCaseApproval(approval);
    const capsule=await createStaffCapsule(next,manifest,grant,unlocked,{...expected,revision:context.revision},{now});return {approval,envelope:next,capsule};
  }finally{plaintext.fill(0);}
}
