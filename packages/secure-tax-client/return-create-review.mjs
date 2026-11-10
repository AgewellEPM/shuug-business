// Operator-only file handling. Never import into the browser or ciphertext API.
import {createHash} from 'node:crypto';
import {selectedJson} from './return-edit-review.mjs';
import {exactCreateObject} from './return-create-contract.mjs';
import {privateReturnCreationReviewCommitment,verifyReturnCreationScope} from './return-creations.mjs';
export async function readReviewedReturnCreationKit(file,reviewedSha256,pins){
  exactCreateObject(pins,['workspaceId','signerPublicKey','firmRecoveryPublicKey']);
  if(!/^[a-f0-9]{64}$/.test(reviewedSha256))throw new Error('Select the SHA-256 of the exact private creation kit whose fields were reviewed.');
  const {bytes,value:kit}=await selectedJson(file);
  try{
    if(createHash('sha256').update(bytes).digest('hex')!==reviewedSha256)throw new Error('The selected private creation kit changed after review.');
    exactCreateObject(kit,['version','type','proposal','manifest','grant','expected','privateReview']);if(kit.version!==1||kit.type!=='shuug-private-return-creation-kit')throw new Error('Unsupported private creation kit.');
    const reviewedCommitment=await privateReturnCreationReviewCommitment(kit.privateReview);if(reviewedCommitment!==kit.proposal.reviewCommitment)throw new Error('The private creation review differs from the selected proposal.');
    await verifyReturnCreationScope(kit.proposal,kit.manifest,kit.grant,kit.expected,pins);return {kit,reviewedCommitment};
  }finally{bytes.fill(0);}
}
export const creationJobInput=(kit,reviewedCommitment,reviewReference)=>({proposal:kit.proposal,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment,reviewReference});
