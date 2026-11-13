#!/usr/bin/env node
// Explicit encrypted input only. No cloud connection or plaintext extraction.
import {openSync,closeSync,fstatSync,readFileSync,writeFileSync,constants} from 'node:fs';
import {verifyClientKeyRecoveryRequest,recoveryEnvelopeDigest} from './key-recovery.mjs';
const usage='Usage: node prepare-client-key-recovery-job.mjs --snapshot FILE --public-pins FILE --review-reference ID --out NEW-FILE --confirm-identity-and-fingerprint';
try{
 const values=new Map();for(let i=2;i<process.argv.length;i++){const name=process.argv[i];if(values.has(name))throw new Error();values.set(name,name==='--confirm-identity-and-fingerprint'?true:process.argv[++i]);}
 if(values.size!==5||values.get('--confirm-identity-and-fingerprint')!==true||!['--snapshot','--public-pins','--review-reference','--out'].every(name=>typeof values.get(name)==='string'))throw new Error(usage);
 const read=(name,maximum)=>{const fd=openSync(values.get(name),constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maximum)throw new Error();return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}};
 const pins=read('--public-pins',4096);if(Object.keys(pins).sort().join('|')!==['workspaceId','signerPublicKey','firmRecoveryPublicKey'].sort().join('|'))throw new Error();
 const snapshot=read('--snapshot',30*1024*1024),reference=values.get('--review-reference');if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(reference)||Object.keys(snapshot).sort().join('|')!=='envelopes|request'||!Array.isArray(snapshot.envelopes))throw new Error();
 await verifyClientKeyRecoveryRequest(snapshot.request,pins);if(snapshot.envelopes.length!==snapshot.request.entries.length)throw new Error();for(let i=0;i<snapshot.envelopes.length;i++)if(await recoveryEnvelopeDigest(snapshot.envelopes[i])!==snapshot.request.entries[i].envelopeDigest)throw new Error();
 const job={version:1,jobId:crypto.randomUUID(),workspaceId:pins.workspaceId,operation:'recover-client-key',approval:{reviewed:true,reviewReference:reference,recipientKeyId:snapshot.request.client.keyId},input:{expectedPins:pins,snapshot,identityAndKeyReviewed:true}},bytes=JSON.stringify(job)+'\n';if(Buffer.byteLength(bytes)>30*1024*1024)throw new Error();
 writeFileSync(values.get('--out'),bytes,{mode:0o600,flag:'wx'});console.log('Prepared the complete encrypted client-key recovery job. Review its immutable version in the separate key account. Snapshots above the cloud worker’s 30 MiB job limit use the offline workflow. No resource was created.');
}catch(error){console.error(error?.message===usage?usage:'Recovery job preparation failed. Check exact encrypted snapshot, public pins and review confirmation. The cloud job is limited to 30 MiB; use the offline workflow for larger snapshots. Existing outputs are never overwritten.');process.exitCode=1;}
