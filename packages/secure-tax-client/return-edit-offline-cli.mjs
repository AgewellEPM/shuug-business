#!/usr/bin/env node
// Approve on the separately trusted firm computer; no network or discovery.
import {readSync,writeFileSync} from 'node:fs';
import {unlockFirmBundle} from './firm-recovery.mjs';
import {approveReturnEdit} from './firm-return-edits.mjs';
import {selectedJson,readReviewedReturnKit,correctionJobInput} from './return-edit-review.mjs';
const usage='Use --confirm-off-host --confirm-fields-reviewed --passphrase-fd N --bundle FILE --public-pins FILE --kit PRIVATE_REVIEW.json --reviewed-sha256 HASH --review-reference OPAQUE_ID --out NEW_ENCRYPTED_APPROVAL.json';
try{
  const args=process.argv.slice(2),options=new Map(),flags=['--confirm-off-host','--confirm-fields-reviewed'],values=['--passphrase-fd','--bundle','--public-pins','--kit','--reviewed-sha256','--review-reference','--out'];
  for(let index=0;index<args.length;index++){const key=args[index];if(options.has(key))throw new Error(usage);if(flags.includes(key))options.set(key,true);else if(values.includes(key)&&args[index+1]&&!args[index+1].startsWith('--'))options.set(key,args[++index]);else throw new Error(usage);}
  if([...flags,...values].some(key=>!options.has(key)))throw new Error(usage);
  const fd=Number(options.get('--passphrase-fd'));if(!Number.isInteger(fd)||fd<0||fd>1024)throw new Error(usage);
  const buffer=Buffer.alloc(1027);let length=0,received;while(length<buffer.length&&(received=readSync(fd,buffer,length,buffer.length-length,null))>0)length+=received;
  if(length>1026){buffer.fill(0);throw new Error('Bound exceeded.');}let passphrase;
  try{
    passphrase=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)).replace(/\r?\n$/,'');buffer.fill(0);
    const pins=(await selectedJson(options.get('--public-pins'),4096)).value,{kit,reviewedCommitment}=await readReviewedReturnKit(options.get('--kit'),options.get('--reviewed-sha256'),pins),bundle=(await selectedJson(options.get('--bundle'),16384)).value,unlocked=await unlockFirmBundle(bundle,passphrase,pins);
    const input=correctionJobInput(kit,reviewedCommitment,options.get('--review-reference')),packet=await approveReturnEdit({...input,envelope:input.sourceEnvelope,unlocked});
    writeFileSync(options.get('--out'),JSON.stringify(packet,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Created an exact signed encrypted correction approval. No taxpayer review data or private keys are included in that output.');
  }finally{buffer.fill(0);passphrase='';}
}catch(error){console.error(error?.message===usage?usage:'Return correction approval failed. Check explicit private inputs, reviewed file hash, pins and passphrase. Existing outputs are never overwritten.');process.exitCode=1;}
