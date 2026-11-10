import { calculateReturn } from '@shuug/tax-engine';
import { encodeJson } from './client.mjs';

/** Reuse the existing encrypted retry cache and exact mutation receipt. A lost
 * response must not create a second return or overwrite a newer revision. */
export async function saveReturn(client,input,objectId,{onPrepared=()=>{}}={}){
  if(!calculateReturn(input).calculationAvailable)throw new Error('Correct the return input before saving.');
  const bytes=encodeJson(input);let prepared=null;
  try{
    for(const entry of await client.pendingUploads()){
      if(entry.domain!=='tax-document')continue;
      const original=await client.previewPrepared(entry);
      try{
        const equal=original.length===bytes.length&&original.every((value,index)=>value===bytes[index]);
        if(objectId===entry.objectId||!objectId&&equal){
          if(!equal)throw new Error('This return has an unresolved encrypted save. Retry its original pending item before saving changed input. Your current input was kept.');
          prepared=entry;break;
        }
      }finally{original.fill(0);}
    }
    if(!prepared)prepared=await client.prepareSave('tax-document',bytes,objectId);
    await client.keepPendingUpload(prepared);onPrepared(prepared.objectId);
    const receipt=await client.savePrepared(prepared);await client.forgetPendingUpload(prepared.mutationId);return receipt;
  }finally{bytes.fill(0);}
}
