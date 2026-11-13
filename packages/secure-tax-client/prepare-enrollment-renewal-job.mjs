#!/usr/bin/env node
// Public job preparation only; no key or cloud operation runs here.
import {openSync,closeSync,fstatSync,readFileSync,writeFileSync,constants} from 'node:fs';
import {verifyRenewalRequest} from './enrollment-renewal.mjs';
const usage='Usage: node prepare-enrollment-renewal-job.mjs --request FILE --public-pins FILE --review-reference ID --out NEW-FILE --confirm-identity-and-fingerprint';
try{
 const values=new Map();for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(values.has(key))throw new Error();values.set(key,key==='--confirm-identity-and-fingerprint'?true:process.argv[++i]);}
 if(values.size!==5||values.get('--confirm-identity-and-fingerprint')!==true||!['--request','--public-pins','--review-reference','--out'].every(key=>typeof values.get(key)==='string'))throw new Error(usage);
 const read=(name,maximum)=>{const fd=openSync(values.get(name),constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maximum)throw new Error();return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}};
 const pins=read('--public-pins',4096);if(Object.keys(pins).sort().join('|')!==['workspaceId','signerPublicKey','firmRecoveryPublicKey'].sort().join('|'))throw new Error();
 const request=await verifyRenewalRequest(read('--request',16384),pins),reference=values.get('--review-reference');if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(reference))throw new Error();
 const job={version:1,jobId:crypto.randomUUID(),workspaceId:pins.workspaceId,operation:'renew-enrollment',approval:{reviewed:true,reviewReference:reference,recipientKeyId:request.manifest.client.keyId},input:{expectedPins:pins,request,identityAndKeyReviewed:true}};
 writeFileSync(values.get('--out'),JSON.stringify(job,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Prepared public enrollment-renewal job. Review its exact immutable version in the separate key account. No keys or cloud resources were created.');
}catch(error){console.error(error?.message===usage?usage:'Enrollment-renewal preparation failed. Check the explicit files, public pins and review confirmation. Existing outputs are never overwritten.');process.exitCode=1;}
