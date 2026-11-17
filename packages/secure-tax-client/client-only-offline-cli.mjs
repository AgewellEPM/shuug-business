// Offline public-binding approval only. No client records or client private keys.
import {constants,openSync,closeSync,fstatSync,readFileSync,readSync,writeFileSync} from 'node:fs';
import {unlockFirmBundle} from './firm-recovery.mjs';
import {signClientOnlyEnrollment} from './client-only-signing.mjs';
import {PROFILE,verifyClientOnlyManifest} from './client-only.mjs';

const usage='Use --bundle ENCRYPTED-FIRM-BUNDLE --public-pins PUBLIC-PINS --request PUBLIC-CLIENT-REQUEST --epoch N --out NEW-PUBLIC-MANIFEST --passphrase-fd N --confirm-off-host --confirm-client-key. Passphrases never belong in arguments.';
try{
  const args=process.argv.slice(2),options=new Map(),flags=['--confirm-off-host','--confirm-client-key'];
  const named=['--bundle','--public-pins','--request','--epoch','--out','--passphrase-fd'];
  for(let i=0;i<args.length;i++){
    const key=args[i];if(options.has(key)||![...flags,...named].includes(key))throw new Error(usage);
    if(flags.includes(key))options.set(key,true);
    else{if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(usage);options.set(key,args[++i]);}
  }
  if(options.size!==flags.length+named.length)throw new Error(usage);
  const required=name=>{const value=options.get(name);if(typeof value!=='string')throw new Error(usage);return value;};
  const read=(name,maximum)=>{
    const fd=openSync(required(name),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maximum)throw new Error('Use bounded regular input files.');return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}
  };
  const descriptor=Number(required('--passphrase-fd')),epoch=Number(required('--epoch'));
  if(!Number.isInteger(descriptor)||descriptor<0||descriptor>1024||!Number.isInteger(epoch)||epoch<1||epoch>1e9)throw new Error(usage);
  const buffer=Buffer.alloc(4097);let length=0,count;
  while(length<buffer.length&&(count=readSync(descriptor,buffer,length,buffer.length-length,null))>0)length+=count;
  let passphrase;
  try{if(length===buffer.length)throw new Error('Passphrase input is too long.');passphrase=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)).replace(/\r?\n$/,'');}finally{buffer.fill(0);}
  try{
    const unlocked=await unlockFirmBundle(read('--bundle',16384),passphrase,read('--public-pins',4096));
    const input=read('--request',16384),renewal=Object.hasOwn(input,'request'),request=renewal?input.request:input;
    if(renewal){
      if(Object.keys(input).sort().join('|')!==['profile','minimumEpoch','previous','request'].sort().join('|')||input.profile!==PROFILE||!Number.isInteger(input.minimumEpoch)||input.minimumEpoch<1||input.minimumEpoch>1e9||epoch<input.minimumEpoch)throw new Error('Use the exact renewal request and meet the client’s requested minimum epoch.');
      const previous=input.previous,expires=Date.parse(previous?.expiresAt);
      if(!Number.isFinite(expires)||epoch<=previous.epoch)throw new Error('Renewal must advance the previous signed epoch without changing the original client key.');
      await verifyClientOnlyManifest(previous,{accountId:request?.accountId,clientId:request?.clientId,clientPublicKey:request?.client?.publicKey},{version:2,profile:PROFILE,workspaceId:unlocked.publicPins.workspaceId,signerPublicKey:unlocked.publicPins.signerPublicKey},Math.min(Date.now(),expires-1));
      if(previous.workspaceId!==request.workspaceId||previous.client.keyId!==request.client.keyId||previous.client.publicKey!==request.client.publicKey)throw new Error('Renewal must preserve the original workspace, account, client and client key.');
    }
    const manifest=await signClientOnlyEnrollment(unlocked,request,{epoch});
    writeFileSync(required('--out'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('Signed a client-only public enrollment. No recovery recipient was added and no client record was opened.');
  }finally{passphrase='';}
}catch(error){console.error(error instanceof Error?error.message:'Public client-only approval failed.');process.exitCode=1;}
