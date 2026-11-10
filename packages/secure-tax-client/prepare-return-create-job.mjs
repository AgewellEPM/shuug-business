#!/usr/bin/env node
// Trusted operator computer only. Prepares an opaque cloud job; no network.
import {writeFileSync} from 'node:fs';
import {selectedJson} from './return-edit-review.mjs';
import {readReviewedReturnCreationKit,creationJobInput} from './return-create-review.mjs';
const usage='Use --confirm-fields-reviewed --public-pins FILE --kit PRIVATE_REVIEW.json --reviewed-sha256 HASH --review-reference OPAQUE_ID --job-id OPAQUE_ID --out NEW_PUBLIC_JOB.json';
try{
  const options=new Map(),args=process.argv.slice(2),names=['--public-pins','--kit','--reviewed-sha256','--review-reference','--job-id','--out'];
  for(let i=0;i<args.length;i++){const key=args[i];if(options.has(key))throw new Error(usage);if(key==='--confirm-fields-reviewed')options.set(key,true);else if(names.includes(key)&&args[i+1]&&!args[i+1].startsWith('--'))options.set(key,args[++i]);else throw new Error(usage);}
  if(!options.has('--confirm-fields-reviewed')||names.some(key=>!options.has(key)))throw new Error(usage);
  const id=value=>typeof value==='string'&&value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]===value;if(!id(options.get('--job-id'))||!id(options.get('--review-reference')))throw new Error(usage);
  const pins=(await selectedJson(options.get('--public-pins'),4096)).value,{kit,reviewedCommitment}=await readReviewedReturnCreationKit(options.get('--kit'),options.get('--reviewed-sha256'),pins),input=creationJobInput(kit,reviewedCommitment,options.get('--review-reference'));
  const job={version:1,jobId:options.get('--job-id'),workspaceId:pins.workspaceId,operation:'approve-return-create',approval:{reviewed:true,reviewReference:options.get('--review-reference'),recipientKeyId:kit.grant.staff.keyId},input:{expectedPins:pins,...input}};
  writeFileSync(options.get('--out'),JSON.stringify(job,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Created an opaque cloud creation job for immutable-version/MFA approval. No private review file was uploaded or copied into the job.');
}catch(error){console.error(error?.message===usage?usage:'Cloud creation job preparation failed. Review the exact private kit, trusted pins and output path. Existing files are never overwritten.');process.exitCode=1;}
