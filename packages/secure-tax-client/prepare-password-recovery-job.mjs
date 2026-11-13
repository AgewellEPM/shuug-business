#!/usr/bin/env node
// Prepare only; no cloud connection or signing operation occurs here.
import {openSync,closeSync,fstatSync,readFileSync,writeFileSync,constants} from 'node:fs';
import {assertPasswordRecoveryInvitation} from './password-recovery.mjs';
import {verifyEnrollmentManifest} from './envelope.mjs';
const usage='Usage: node prepare-password-recovery-job.mjs --invitation FILE --public-pins FILE --review-reference ID --out NEW-FILE --confirm-identity-and-fingerprint';
try{
 const values=new Map();for(let i=2;i<process.argv.length;i++){const name=process.argv[i];if(values.has(name))throw new Error();values.set(name,name==='--confirm-identity-and-fingerprint'?true:process.argv[++i]);}
 if(values.size!==5||values.get('--confirm-identity-and-fingerprint')!==true||!['--invitation','--public-pins','--review-reference','--out'].every(name=>typeof values.get(name)==='string'))throw new Error(usage);
 const read=(name,maximum)=>{const fd=openSync(values.get(name),constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maximum)throw new Error();return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}};
 const pins=read('--public-pins',4096);if(Object.keys(pins).sort().join('|')!==['workspaceId','signerPublicKey','firmRecoveryPublicKey'].sort().join('|'))throw new Error();
 const invitation=assertPasswordRecoveryInvitation(read('--invitation',16384),pins.workspaceId),request=invitation.request,reference=values.get('--review-reference');if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(reference))throw new Error();
 await verifyEnrollmentManifest(invitation.manifest,{accountId:request.accountId,clientId:request.clientId,minimumEpoch:request.manifestEpoch},pins);
 const job={version:1,jobId:crypto.randomUUID(),workspaceId:pins.workspaceId,operation:'approve-password-recovery',approval:{reviewed:true,reviewReference:reference,recipientKeyId:request.clientKeyId},input:{expectedPins:pins,request,manifest:invitation.manifest,identityAndKeyReviewed:true}};
 writeFileSync(values.get('--out'),JSON.stringify(job,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Prepared public password-recovery approval job. The private invitation token is excluded. Review and submit its exact immutable version through the separate key account. No cloud resource was created.');
}catch(error){console.error(error?.message===usage?usage:'Password recovery job preparation failed. Check the explicit files, public pins and review confirmation; existing outputs are never overwritten.');process.exitCode=1;}
