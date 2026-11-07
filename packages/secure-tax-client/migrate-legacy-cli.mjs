#!/usr/bin/env node
// Explicit offline inputs only. Never discover app data, contact an API or purge.
import {constants,openSync,closeSync,fstatSync,readSync} from 'node:fs';
import {unlockFirmBundle} from './firm-recovery.mjs';
import {prepareLegacyMigration} from './migrate-legacy.mjs';

const allowed=['--confirm-off-host','--confirm-copied-backup','--backup','--backup-manifest-sha256','--bundle','--public-pins','--manifest','--expected','--passphrase-fd','--out'];
const options=new Map();
const boundedRead=(fd,maximum)=>{
 const chunks=[];let length=0;
 for(;;){const chunk=Buffer.alloc(Math.min(4096,maximum-length+1));const n=readSync(fd,chunk);if(!n)break;length+=n;if(length>maximum)throw new Error('Input limit');chunks.push(chunk.subarray(0,n));}
 return Buffer.concat(chunks);
};
try{
 for(let index=2;index<process.argv.length;index++){
  const name=process.argv[index];if(!allowed.includes(name)||options.has(name))throw new Error('Arguments');
  if(name.startsWith('--confirm-'))options.set(name,true);
  else {const value=process.argv[++index];if(!value||value.startsWith('--'))throw new Error('Arguments');options.set(name,value);}
 }
 const required=name=>{const value=options.get(name);if(typeof value!=='string')throw new Error('Arguments');return value;};
 if(!options.get('--confirm-off-host')||!options.get('--confirm-copied-backup'))throw new Error('Acknowledgment');
 const readJson=(name,maximum)=>{const fd=openSync(required(name),constants.O_RDONLY|constants.O_NOFOLLOW);try{if(!fstatSync(fd).isFile())throw new Error('Input');return JSON.parse(boundedRead(fd,maximum));}finally{closeSync(fd);}};
 const fd=Number(required('--passphrase-fd'));if(!Number.isInteger(fd)||fd<0||fd>1024)throw new Error('Descriptor');
 const passBytes=boundedRead(fd,1026);let passphrase;
 try{passphrase=new TextDecoder('utf-8',{fatal:true}).decode(passBytes).replace(/\r?\n$/,'');}finally{passBytes.fill(0);}
 try{
  const unlocked=await unlockFirmBundle(readJson('--bundle',16384),passphrase,readJson('--public-pins',4096));
  const report=await prepareLegacyMigration({backupDirectory:required('--backup'),backupManifestSha256:required('--backup-manifest-sha256'),manifest:readJson('--manifest',16384),expected:readJson('--expected',4096),unlocked,outputDirectory:required('--out'),confirmOffHost:true,confirmCopiedBackup:true});
  console.log(JSON.stringify({ok:true,preparedObjects:report.entries.length,supportedCounts:report.supportedCounts,migrationComplete:false,uploaded:false,sourcePurged:false,legacyExposureRemains:true}));
 }finally{passphrase='';}
}catch{
 console.error('Offline copied-backup preparation failed. Explicit offhost/copy confirmations, reviewed backup SHA256, firm bundle/public pins, signed client manifest, expected account/client/manifest/epoch and a new output directory are required. No source purge or upload was performed.');
 process.exitCode=1;
}
