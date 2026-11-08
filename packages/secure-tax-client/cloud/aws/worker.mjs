// IAM-only service in the separately trusted key-custody account.
import {createHash} from 'node:crypto';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../../firm-recovery.mjs';
import {signStaffGrant,createStaffCapsule,revokeStaffGrant} from '../../firm-staff.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const utf8=new TextEncoder(),text=new TextDecoder('utf-8',{fatal:true});
const fail=()=>{throw new Error('Key custody request failed.');};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=v=>typeof v==='string'&&v.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]===v;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function approved(job){
  exact(job,['version','jobId','workspaceId','operation','approval','input']);
  exact(job.approval,['reviewed','reviewReference','recipientKeyId']);
  if(job.version!==1||!id(job.jobId)||!id(job.workspaceId)||job.approval.reviewed!==true||!id(job.approval.reviewReference))fail();
  if(!['initialize','enroll','grant','share','recover-device','revoke'].includes(job.operation))fail();
  const key=job.operation==='initialize'?null:job.operation==='enroll'?job.input.request?.client?.keyId:['grant','recover-device'].includes(job.operation)?job.input.request?.staff?.keyId:job.input.grant?.staff?.keyId;
  if(job.approval.recipientKeyId!==key)fail();
}
function publicPins(pins){exact(pins,['workspaceId','signerPublicKey','firmRecoveryPublicKey']);return {workspaceId:pins.workspaceId,signerPublicKey:pins.signerPublicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey};}
async function perform(job,unlocked){
  const input=job.input;
  if(!same(publicPins(input.expectedPins),unlocked.publicPins))fail();
  if(job.operation==='enroll'){
    exact(input,['expectedPins','request','epoch']);return {manifest:await signEnrollmentRequest(input.request,unlocked,{epoch:input.epoch})};
  }
  if(job.operation==='grant'){
    exact(input,['expectedPins','request','options']);exact(input.options,['epoch','domains']);
    return {grant:await signStaffGrant(input.request,unlocked,input.options)};
  }
  if(job.operation==='share'){
    exact(input,['expectedPins','envelope','manifest','grant','expected']);
    return {capsule:await createStaffCapsule(input.envelope,input.manifest,input.grant,unlocked,input.expected)};
  }
  if(job.operation==='revoke'){
    exact(input,['expectedPins','grant','epoch','archiveValidAt']);
    return {revoked:await revokeStaffGrant(input.grant,unlocked,{epoch:input.epoch,...(input.archiveValidAt===null?{}:{archiveValidAt:input.archiveValidAt})})};
  }
  exact(input,['expectedPins','grant','request','epoch','envelope','manifest','expected','archiveValidAt']);
  const prior=input.grant,request=input.request;
  if(request.workspaceId!==prior.workspaceId||request.accountId!==prior.accountId||request.clientId!==prior.clientId||request.staffAccountId!==prior.staffAccountId||request.staff?.keyId===prior.staff.keyId)fail();
  const revoked=await revokeStaffGrant(prior,unlocked,{epoch:prior.epoch+1,...(input.archiveValidAt===null?{}:{archiveValidAt:input.archiveValidAt})});
  const grant=await signStaffGrant(request,unlocked,{epoch:input.epoch,domains:prior.domains});
  return {grant,capsule:await createStaffCapsule(input.envelope,input.manifest,grant,unlocked,input.expected),revoked};
}
export function createHandler(provider,config){
  if(!config||!id(config.workspaceId)||!/^\d{12}$/.test(config.keyAccountId)||!/^\d{12}$/.test(config.dataHostAccountId)||config.keyAccountId===config.dataHostAccountId)fail();
  return async(event,context)=>{
    let secretBytes,unlocked;
    try{
      exact(event,['version','jobId','jobVersionId','approvedSha256']);
      if(event.version!==1||!id(event.jobId)||typeof event.jobVersionId!=='string'||!event.jobVersionId.length||event.jobVersionId.length>1024||!/^[a-f0-9]{64}$/.test(event.approvedSha256))fail();
      const arn=context?.invokedFunctionArn;
      if(typeof arn!=='string'||arn.split(':')[4]!==config.keyAccountId||!arn.startsWith('arn:aws:lambda:'))fail();
      const bytes=await provider.readJob(event.jobId,event.jobVersionId);
      if(!(bytes instanceof Uint8Array)||bytes.byteLength>30*1024*1024||hash(bytes)!==event.approvedSha256)fail();
      const job=JSON.parse(text.decode(bytes));approved(job);
      if(job.jobId!==event.jobId||job.workspaceId!==config.workspaceId)fail();
      const prior=await provider.readResult(job.jobId);
      if(prior){if(prior.approvedSha256!==event.approvedSha256||prior.jobVersionId!==event.jobVersionId)fail();return {ok:true,jobId:job.jobId,resultVersionId:prior.versionId,duplicate:true};}
      let result;
      const encryptionContext={workspaceId:config.workspaceId,service:'shuug-key-custody-v1'};
      if(job.operation==='initialize'){
        exact(job.input,[]);const existing=await provider.readCustody();
        if(existing){
          exact(existing,['version','workspaceId','ciphertext']);if(existing.version!==1||existing.workspaceId!==config.workspaceId)fail();
          secretBytes=await provider.decryptBundle(Buffer.from(existing.ciphertext,'base64'),encryptionContext);if(secretBytes.length>4096)fail();
          const selected=JSON.parse(text.decode(secretBytes));exact(selected,['bundle','passphrase']);
          const pins={workspaceId:selected.bundle.workspaceId,signerPublicKey:selected.bundle.signerPublicKey,firmRecoveryPublicKey:selected.bundle.firmRecoveryPublicKey};
          await unlockFirmBundle(selected.bundle,selected.passphrase,pins);selected.passphrase='';result={publicPins:pins,existingCustodyPreserved:true};
        }else{
          const passphrase=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
          const created=await createFirmBundle(config.workspaceId,passphrase);
          secretBytes=utf8.encode(JSON.stringify({bundle:created.bundle,passphrase}));if(secretBytes.byteLength>4096)fail();
          const ciphertext=await provider.encryptBundle(secretBytes,encryptionContext);
          await provider.writeCustody({version:1,workspaceId:config.workspaceId,ciphertext:Buffer.from(ciphertext).toString('base64')});
          result={publicPins:created.publicPins,existingCustodyPreserved:false};
        }
      }else{
        const custody=await provider.readCustody();exact(custody,['version','workspaceId','ciphertext']);
        if(custody.version!==1||custody.workspaceId!==config.workspaceId||typeof custody.ciphertext!=='string'||custody.ciphertext.length>16384)fail();
        secretBytes=await provider.decryptBundle(Buffer.from(custody.ciphertext,'base64'),encryptionContext);
        if(!(secretBytes instanceof Uint8Array)||secretBytes.length>4096)fail();
        const selected=JSON.parse(text.decode(secretBytes));exact(selected,['bundle','passphrase']);
        unlocked=await unlockFirmBundle(selected.bundle,selected.passphrase,publicPins(job.input.expectedPins));
        selected.passphrase='';result=await perform(job,unlocked);
      }
      const receipt={version:1,jobId:job.jobId,jobVersionId:event.jobVersionId,approvedSha256:event.approvedSha256,operation:job.operation,reviewReference:job.approval.reviewReference,result};
      const versionId=await provider.writeResult(job.jobId,receipt);
      return {ok:true,jobId:job.jobId,resultVersionId:versionId,duplicate:false};
    }catch{
      // No original error, event, input, key or recovered bytes reach Lambda logs.
      return {ok:false,error:'KEY_JOB_FAILED'};
    }finally{secretBytes?.fill(0);unlocked=null;}
  };
}
export async function handler(event,context){
  try{
    const {createAwsProvider,runtimeInfo}=await import('./aws-provider.mjs');
    if(event?.operation==='runtime-info'){
      exact(event,['version','operation']);if(event.version!==1||context?.invokedFunctionArn?.split(':')[4]!==process.env.KEY_ACCOUNT_ID||process.env.KEY_ACCOUNT_ID===process.env.DATA_HOST_ACCOUNT_ID)fail();
      const runtime=runtimeInfo();return {ok:true,runtime,keyOperationsEnabled:process.env.REVIEWED_S3_SDK_VERSION===runtime.s3&&process.env.REVIEWED_KMS_SDK_VERSION===runtime.kms};
    }
    const provider=await createAwsProvider(process.env);
    return createHandler(provider,{workspaceId:process.env.WORKSPACE_ID,keyAccountId:process.env.KEY_ACCOUNT_ID,dataHostAccountId:process.env.DATA_HOST_ACCOUNT_ID})(event,context);
  }catch{return {ok:false,error:'KEY_JOB_FAILED'};}
}
