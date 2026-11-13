#!/usr/bin/env node
// Run only on a separately trusted firm device. No network, API or live data
// discovery; all inputs and outputs must be explicitly selected by the operator.
import {recoverClientEncryptionKey} from './firm-client-key-recovery.mjs';
import {renewFirmEnrollment} from './firm-enrollment-renewal.mjs';
import {readFileSync,readSync,writeFileSync,openSync,closeSync,unlinkSync,fstatSync,constants} from 'node:fs';
import {approveAuthenticatorRecovery} from './firm-authenticator-recovery.mjs';
import {assertAuthenticatorRecoveryInvitation} from './authenticator-recovery.mjs';
import {approvePasswordRecovery} from './firm-password-recovery.mjs';
import {assertPasswordRecoveryInvitation} from './password-recovery.mjs';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest,recoverFirmObject} from './firm-recovery.mjs';
const usage='Commands: init | sign | renew | recover | recover-client-key | approve-password-recovery | approve-authenticator-recovery. All require --confirm-off-host, --passphrase-fd N, --bundle PATH and --public-pins PATH. recover-client-key adds --request ENCRYPTED-SNAPSHOT --out PATH --confirm-identity-and-fingerprint. sign adds --request PATH --epoch N --out PATH. renew adds --request PUBLIC-RENEWAL-REQUEST --out PATH --confirm-identity-and-fingerprint. recover adds --manifest PATH --envelope PATH --expected PATH --out PATH. approve-password-recovery and approve-authenticator-recovery add --request PRIVATE-INVITATION --out PATH --confirm-identity-and-fingerprint.';
const options=new Map();const command=process.argv[2];
try{
 for(let i=3;i<process.argv.length;i++){
  const name=process.argv[i];if(!name.startsWith('--')||options.has(name))throw new Error('Invalid arguments.');
  if(['--confirm-off-host','--confirm-identity-and-fingerprint'].includes(name))options.set(name,true);
  else {const value=process.argv[++i];if(!value||value.startsWith('--'))throw new Error('Missing argument.');options.set(name,value);}
 }
 const allowed=['--confirm-off-host','--passphrase-fd','--bundle','--public-pins',...(command==='init'?['--workspace-id']:command==='sign'?['--request','--epoch','--out']:command==='recover'?['--manifest','--envelope','--expected','--out']:['approve-password-recovery','approve-authenticator-recovery','renew','recover-client-key'].includes(command)?['--request','--out','--confirm-identity-and-fingerprint']:[])];
 if(!['init','sign','renew','recover','approve-password-recovery','approve-authenticator-recovery','recover-client-key'].includes(command)||!options.get('--confirm-off-host')||[...options.keys()].some(k=>!allowed.includes(k)))throw new Error(usage);
 const required=n=>{const v=options.get(n);if(typeof v!=='string')throw new Error(`Missing ${n}.`);return v;};
 const readJson=(name,max=24*1024*1024)=>{
  const fd=openSync(required(name),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>max)throw new Error('Input must be a bounded regular file.');return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}
 };
 const fd=Number(required('--passphrase-fd'));if(!Number.isInteger(fd)||fd<0||fd>1024)throw new Error('Invalid passphrase descriptor.');
 const passBytes=Buffer.alloc(1027);let passLength=0,received;
 while(passLength<passBytes.length&&(received=readSync(fd,passBytes,passLength,passBytes.length-passLength,null))>0)passLength+=received;
 if(passLength>1026){passBytes.fill(0);throw new Error('Passphrase input is too long.');}
 let passphrase=new TextDecoder('utf-8',{fatal:true}).decode(passBytes.subarray(0,passLength)).replace(/\r?\n$/,'');passBytes.fill(0);
 const write=(name,bytes)=>writeFileSync(required(name),bytes,{mode:0o600,flag:'wx'});
 try{
  if(command==='init'){
   // Both outputs use exclusive creation; existing keys are never overwritten.
   const result=await createFirmBundle(required('--workspace-id'),passphrase);
   const owned=[];
   try{
    for(const [option,value] of [['--bundle',result.bundle],['--public-pins',result.publicPins]]){
     const output=required(option),descriptor=openSync(output,'wx',0o600);owned.push({output,descriptor});
     writeFileSync(descriptor,JSON.stringify(value,null,2)+'\n');
    }
   }catch(error){for(const item of owned){try{unlinkSync(item.output);}catch{}}throw error;}
   finally{for(const item of owned)closeSync(item.descriptor);}
   console.log('Created encrypted off-host firm bundle and public-only pins. Keep the bundle and its passphrase separate from the hosting service.');
  }else{
   const unlocked=await unlockFirmBundle(readJson('--bundle',16384),passphrase,readJson('--public-pins',4096));
   if(command==='recover-client-key'){
    const packet=await recoverClientEncryptionKey(readJson('--request',768*1024*1024),unlocked,{identityAndKeyReviewed:options.get('--confirm-identity-and-fingerprint')===true});
    write('--out',JSON.stringify(packet)+'\n');console.log('Re-encrypted the complete reviewed snapshot for the replacement client key. Stage this packet through the verified owner, then have the client prove the new key. Existing records remain unchanged until that final atomic completion.');
   }else if(command==='renew'){
    const packet=await renewFirmEnrollment(readJson('--request',16384),unlocked,{identityAndKeyReviewed:options.get('--confirm-identity-and-fingerprint')===true});
    write('--out',JSON.stringify(packet,null,2)+'\n');console.log('Signed enrollment renewal with the same client and firm recovery keys. Publish it through the independent client or verified owner, then refresh staff sharing.');
   }else if(command==='approve-authenticator-recovery'){
    const invitation=assertAuthenticatorRecoveryInvitation(readJson('--request',16384),unlocked.publicPins.workspaceId);
    const approval=await approveAuthenticatorRecovery(invitation.request,invitation.manifest,unlocked,{identityAndKeyReviewed:options.get('--confirm-identity-and-fingerprint')===true});
    write('--out',JSON.stringify(approval,null,2)+'\n');console.log('Signed short-lived authenticator replacement approval. The client must prove the existing password, encryption key and new authenticator code.');
   }else if(command==='approve-password-recovery'){
    const invitation=assertPasswordRecoveryInvitation(readJson('--request',16384),unlocked.publicPins.workspaceId);
    const approval=await approvePasswordRecovery(invitation.request,invitation.manifest,unlocked,{identityAndKeyReviewed:options.get('--confirm-identity-and-fingerprint')===true});
    write('--out',JSON.stringify(approval,null,2)+'\n');console.log('Signed short-lived password recovery for the exact existing account and client key. Authenticator and encryption keys remain unchanged.');
   }else if(command==='sign'){
    const request=readJson('--request',4096),epoch=Number(required('--epoch'));
    const manifest=await signEnrollmentRequest(request,unlocked,{epoch});
    write('--out',JSON.stringify(manifest,null,2)+'\n');console.log('Signed public enrollment manifest. Verify the client identity and key fingerprint independently before delivery.');
   }else{
    const bytes=await recoverFirmObject(readJson('--envelope'),readJson('--manifest',16384),unlocked,readJson('--expected',4096));
    try{write('--out',bytes);}finally{bytes.fill(0);}
    console.log('Recovered the explicitly selected object into the private output file.');
   }
  }
 }finally{passphrase='';}
}catch(error){
 // Never serialize input, key material, passphrases or recovered data in errors.
 console.error(error?.message===usage?usage:'Offline firm operation failed. Check explicit paths, public pins, passphrase and expected client context. Existing output files are never overwritten.');
 process.exitCode=1;
}
