// Private operator file handling only. Readable action/evidence never enter a cloud job.
import {createHash} from 'node:crypto';
import {selectedJson} from './return-edit-review.mjs';
import {exactCaseObject} from './case-contract.mjs';
import {privateCaseReviewCommitment,verifyCaseProposalScope} from './case-proposals.mjs';
export async function readReviewedCaseKit(file,reviewedSha256,pins){
  exactCaseObject(pins,['workspaceId','signerPublicKey','firmRecoveryPublicKey']);if(!/^[a-f0-9]{64}$/.test(reviewedSha256))throw new Error('Select the SHA-256 of the exact private case kit whose fields and evidence were reviewed.');
  const {bytes,value:kit}=await selectedJson(file,64*1024*1024);
  try{
    if(createHash('sha256').update(bytes).digest('hex')!==reviewedSha256)throw new Error('The selected private case kit changed after review.');
    exactCaseObject(kit,['version','type','proposal','sourceEnvelope','manifest','grant','expected','privateReview']);if(kit.version!==1||kit.type!=='shuug-private-case-review-kit')throw new Error('Unsupported private case kit.');
    const reviewedCommitment=await privateCaseReviewCommitment(kit.privateReview);if(reviewedCommitment!==kit.proposal.reviewCommitment)throw new Error('The private case review differs from the selected proposal.');
    await verifyCaseProposalScope(kit.proposal,kit.sourceEnvelope,kit.manifest,kit.grant,kit.expected,pins);return {kit,reviewedCommitment};
  }finally{bytes.fill(0);}
}
export const caseJobInput=(kit,reviewedCommitment,reviewReference)=>({proposal:kit.proposal,sourceEnvelope:kit.sourceEnvelope,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment,reviewReference});
