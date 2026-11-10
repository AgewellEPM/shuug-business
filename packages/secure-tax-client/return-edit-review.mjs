// Operator-only file handling. Never import this Node module into the browser/API.
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {exactEditObject} from './return-edit-contract.mjs';
import {privateReturnReviewCommitment,verifyReturnProposalSource} from './return-proposals.mjs';
export async function selectedJson(file,maximum=30*1024*1024){
  const descriptor=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const info=await descriptor.stat();if(!info.isFile()||info.size>maximum)throw new Error('Choose a bounded regular file.');const bytes=await descriptor.readFile();return {bytes,value:JSON.parse(bytes.toString('utf8'))};}finally{await descriptor.close();}
}
export async function readReviewedReturnKit(file,reviewedSha256,pins){
  if(!/^[a-f0-9]{64}$/.test(reviewedSha256))throw new Error('Select the SHA-256 of the exact private review kit whose fields were reviewed.');
  const {bytes,value:kit}=await selectedJson(file);
  try{
    if(createHash('sha256').update(bytes).digest('hex')!==reviewedSha256)throw new Error('The selected private review kit changed after review.');
    exactEditObject(kit,['version','type','proposal','sourceEnvelope','manifest','grant','expected','privateReview']);if(kit.version!==1||kit.type!=='shuug-private-return-correction-kit')throw new Error('Unsupported private review kit.');
    const reviewedCommitment=await privateReturnReviewCommitment(kit.privateReview);if(reviewedCommitment!==kit.proposal.reviewCommitment)throw new Error('The private before/after review differs from the selected proposal.');
    await verifyReturnProposalSource(kit.proposal,kit.sourceEnvelope,kit.manifest,kit.grant,kit.expected,pins);
    return {kit,reviewedCommitment};
  }finally{bytes.fill(0);}
}
export const correctionJobInput=(kit,reviewedCommitment,reviewReference)=>({proposal:kit.proposal,sourceEnvelope:kit.sourceEnvelope,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment,reviewReference});
