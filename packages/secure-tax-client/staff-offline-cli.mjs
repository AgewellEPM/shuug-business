#!/usr/bin/env node
// Separately trusted firm device only. No network operations or key uploads.
import {readFileSync,readSync,writeFileSync,openSync,closeSync,unlinkSync,fstatSync,constants} from 'node:fs';
import {unlockFirmBundle} from './firm-recovery.mjs';
import {signStaffGrant,createStaffCapsule,revokeStaffGrant} from './firm-staff.mjs';
const usage='Commands: grant | share | recover-device | revoke. All require --confirm-off-host --passphrase-fd N --bundle PATH --public-pins PATH. grant: --request PATH --epoch N --out PATH [--grant-id ID] [--domains CSV]. share: --grant PATH --manifest PATH --envelope PATH --expected PATH --out PATH. recover-device: --prior-grant PATH --request PATH --epoch N --manifest PATH --envelope PATH --expected PATH --grant-out PATH --capsule-out PATH --revoke-out PATH [--prior-valid-at UTC]. revoke: --grant PATH --epoch N --out PATH [--prior-valid-at UTC].';
const options=new Map(),command=process.argv[2];
try{
  for(let i=3;i<process.argv.length;i++){
    const name=process.argv[i];if(!name.startsWith('--')||options.has(name))throw new Error('Invalid arguments.');
    if(name==='--confirm-off-host')options.set(name,true);
    else{const value=process.argv[++i];if(!value||value.startsWith('--'))throw new Error('Missing argument.');options.set(name,value);}
  }
  const common=['--confirm-off-host','--passphrase-fd','--bundle','--public-pins'];
  const extra={grant:['--request','--epoch','--out','--grant-id','--domains'],share:['--grant','--manifest','--envelope','--expected','--out'],'recover-device':['--prior-grant','--request','--epoch','--manifest','--envelope','--expected','--grant-out','--capsule-out','--revoke-out','--prior-valid-at'],revoke:['--grant','--epoch','--out','--prior-valid-at']}[command];
  if(!extra||!options.get('--confirm-off-host')||[...options.keys()].some(key=>![...common,...extra].includes(key)))throw new Error(usage);
  const required=name=>{const value=options.get(name);if(typeof value!=='string')throw new Error('Missing argument.');return value;};
  const readJson=(name,maximum=24*1024*1024)=>{
    const fd=openSync(required(name),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maximum)throw new Error('Invalid selected input.');return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}
  };
  const output=values=>{
    const owned=[];
    try{
      for(const [option,value] of values){const file=required(option),fd=openSync(file,'wx',0o600);owned.push({file,fd});writeFileSync(fd,JSON.stringify(value,null,2)+'\n');}
    }catch(error){for(const item of owned)try{unlinkSync(item.file);}catch{}throw error;}
    finally{for(const item of owned)closeSync(item.fd);}
  };
  const fd=Number(required('--passphrase-fd'));if(!Number.isInteger(fd)||fd<0||fd>1024)throw new Error('Invalid descriptor.');
  const buffer=Buffer.alloc(1027);let length=0,received;
  while(length<buffer.length&&(received=readSync(fd,buffer,length,buffer.length-length,null))>0)length+=received;
  if(length>1026){buffer.fill(0);throw new Error('Passphrase is too long.');}
  let passphrase=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)).replace(/\r?\n$/,'');buffer.fill(0);
  try{
    const unlocked=await unlockFirmBundle(readJson('--bundle',16384),passphrase,readJson('--public-pins',4096));
    if(command==='grant'){
      const grant=await signStaffGrant(readJson('--request',8192),unlocked,{epoch:Number(required('--epoch')),...(options.has('--grant-id')?{grantId:required('--grant-id')}:{}),...(options.has('--domains')?{domains:required('--domains').split(',')}:{})});
      output([['--out',grant]]);
    }else if(command==='revoke'){
      output([['--out',await revokeStaffGrant(readJson('--grant',16384),unlocked,{epoch:Number(required('--epoch')),...(options.has('--prior-valid-at')?{archiveValidAt:required('--prior-valid-at')}:{})})]]);
    }else if(command==='share'){
      const capsule=await createStaffCapsule(readJson('--envelope'),readJson('--manifest',16384),readJson('--grant',16384),unlocked,readJson('--expected',8192));
      output([['--out',capsule]]);
    }else{
      const prior=readJson('--prior-grant',16384),request=readJson('--request',8192),expected=readJson('--expected',8192);
      const revoked=await revokeStaffGrant(prior,unlocked,{epoch:prior.epoch+1,...(options.has('--prior-valid-at')?{archiveValidAt:required('--prior-valid-at')}:{})});
      if(request.workspaceId!==prior.workspaceId||request.accountId!==prior.accountId||request.clientId!==prior.clientId||request.staffAccountId!==prior.staffAccountId||request.staff?.keyId===prior.staff.keyId)throw new Error('Recovery request differs from prior scope or device.');
      const grant=await signStaffGrant(request,unlocked,{epoch:Number(required('--epoch')),domains:prior.domains});
      const capsule=await createStaffCapsule(readJson('--envelope'),readJson('--manifest',16384),grant,unlocked,expected);
      output([['--grant-out',grant],['--capsule-out',capsule],['--revoke-out',revoked]]);
    }
    console.log('Created signed public staff access files. Independently verify identity and fingerprints before owner publication. Private keys and plaintext were not exported.');
  }finally{passphrase='';}
}catch(error){console.error(error?.message===usage?usage:'Offhost staff access operation failed. Check explicit inputs, pins, expected scope and passphrase. Existing output files are never overwritten.');process.exitCode=1;}
