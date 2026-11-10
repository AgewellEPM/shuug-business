/** Local synthetic resource evidence only. The parent prepares a 10-MiB case
 * review; a fresh child measures only key-worker job approval. No AWS or app
 * service is contacted. No fixture, key, job or readable source is printed. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,chmod,rm,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const script=fileURLToPath(import.meta.url),utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
let phase='startup';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),selectedBytes=10*1024*1024;
async function privateJson(file,maximum){
  const descriptor=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const info=await descriptor.stat();if(!info.isFile()||info.size>maximum||(info.mode&0o077)!==0)throw new Error('Unsupported private fixture.');return JSON.parse((await descriptor.readFile()).toString('utf8'));}finally{await descriptor.close();}
}

async function runWorker(directory){
  phase='worker-fixture';
  const {createHandler}=await import('../packages/secure-tax-client/cloud/aws/worker.mjs');
  const fixture=await privateJson(path.join(directory,'custody-fixture.json'),65536);assert.equal(fixture.syntheticOnly,true);
  const encryptionContext={workspaceId:fixture.config.workspaceId,service:'shuug-key-custody-v1'},keyBytes=Buffer.from(fixture.wrappingKey,'base64'),wrappingKey=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['decrypt']);keyBytes.fill(0);fixture.wrappingKey='';
  let jobBytes=0,resultWritten=false;
  const provider={
    async readJob(id,version){assert.equal(id,fixture.event.jobId);assert.equal(version,fixture.event.jobVersionId);const bytes=await readFile(path.join(directory,'job.json'));assert(bytes.length<=30*1024*1024);jobBytes=bytes.length;return bytes;},
    async readResult(){return null;},
    async readCustody(){return structuredClone(fixture.custody);},
    async decryptBundle(bytes,context){assert.deepEqual(context,encryptionContext);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:utf8.encode(JSON.stringify(context))},wrappingKey,bytes.subarray(12)));},
    async writeResult(id,result){assert.equal(id,fixture.event.jobId);assert.equal(result.operation,'approve-case-transition');assert(result.result.approvedCase);await writeFile(path.join(directory,'worker-result.json'),JSON.stringify(result),{mode:0o600,flag:'wx'});resultWritten=true;return 'synthetic-resource-result-version';},
    async writeCustody(){throw new Error('Initialization is outside this measurement.');},
    async encryptBundle(){throw new Error('Initialization is outside this measurement.');},
  };
  phase='worker-approval';const began=performance.now(),result=await createHandler(provider,fixture.config)(fixture.event,fixture.context);
  assert.equal(result.ok,true);assert(resultWritten);assert.equal(result.duplicate,false);
  console.log(JSON.stringify({ok:true,measurement:'fresh-process worker approval only',jobBytes,elapsedMs:Math.round(performance.now()-began),maxRssKiB:process.resourceUsage().maxRSS,resultWritten,syntheticOnly:true,awsInvoked:false}));
}

async function prepareFixture(directory,checkInterrupted){
  const {createFirmBundle,unlockFirmBundle,signEnrollmentRequest}=await import('../packages/secure-tax-client/firm-recovery.mjs');
  const {signStaffGrant,createStaffCapsule}=await import('../packages/secure-tax-client/firm-staff.mjs');
  const {generateRecipientKeyPair,publicKeyId,sealEnvelope,encode64}=await import('../packages/secure-tax-client/envelope.mjs');
  const {secureEnvelopeDigest}=await import('../packages/secure-tax-client/staff-grants.mjs');
  const {prepareCaseTransition}=await import('../packages/secure-tax-client/case-proposals.mjs');
  const {approveCaseTransition}=await import('../packages/secure-tax-client/firm-cases.mjs');
  const {CASE_OBJECT_PREFIX}=await import('../packages/secure-tax-client/case-contract.mjs');
  const passphrase='Synthetic case resource custody '+randomBytes(24).toString('hex'),{bundle,publicPins:pins}=await createFirmBundle('synthetic-case-resource-workspace',passphrase),unlocked=await unlockFirmBundle(bundle,passphrase,pins),client=await generateRecipientKeyPair(),staff=await generateRecipientKeyPair();
  const now=Date.now()-1000,manifest=await signEnrollmentRequest({version:1,workspaceId:pins.workspaceId,accountId:'synthetic-resource-account',clientId:'synthetic-resource-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},unlocked,{epoch:1,now}),staffKeyId=await publicKeyId(staff.publicKey),grant=await signStaffGrant({version:1,workspaceId:pins.workspaceId,accountId:manifest.accountId,clientId:manifest.clientId,staffAccountId:'synthetic-resource-preparer',staff:{keyId:staffKeyId,publicKey:staff.publicKey}},unlocked,{epoch:1,domains:['tax-document'],now});
  const objectId=CASE_OBJECT_PREFIX+'synthetic-resource-case',recipients={clientPublicKey:client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey};
  const expected=(id=objectId,revision=0)=>({accountId:manifest.accountId,clientId:manifest.clientId,staffAccountId:grant.staffAccountId,staffKeyId,minimumGrantEpoch:1,minimumManifestEpoch:1,objectId:id,revision,domain:'tax-document'}),command=(type,input)=>({actionId:crypto.randomUUID(),type,input});
  let packet=null;
  for(const action of [command('case.create',{title:'SYNTHETIC RESOURCE CASE',year:2025,kind:'1120'}),command('request.add',{requestId:'synthetic-resource-request',title:'SYNTHETIC RESOURCE SOURCE',due:'',notes:''})]){
    checkInterrupted();const request={envelope:packet?.envelope??null,capsule:packet?.capsule??null,manifest,grant,expected:expected(objectId,packet?.envelope.context.revision??0),pins,staffPrivateKey:staff.privateKey,command:action},prepared=await prepareCaseTransition(request);
    packet=await approveCaseTransition({proposal:prepared.proposal,envelope:request.envelope,manifest,grant,expected:request.expected,reviewedCommitment:prepared.proposal.reviewCommitment,reviewReference:'synthetic-resource-prior-review',unlocked});
  }
  checkInterrupted();const sourceBytes=new Uint8Array(selectedBytes).fill(32);sourceBytes.set(utf8.encode('%PDF-SYNTHETIC RESOURCE EVIDENCE\n'));
  let file;
  try{file={version:1,type:'private-file',filename:'synthetic-resource.pdf',mime:'application/pdf',data:encode64(sourceBytes),byteLength:sourceBytes.length,purpose:'tax-document',category:'tax',notes:'Synthetic source only',savedAt:new Date().toISOString()};}finally{sourceBytes.fill(0);}
  const evidenceContext={workspaceId:pins.workspaceId,accountId:manifest.accountId,objectId:'synthetic-resource-evidence',revision:1,domain:'tax-document'},plaintext=utf8.encode(JSON.stringify(file));let evidenceEnvelope;
  try{evidenceEnvelope=await sealEnvelope(plaintext,evidenceContext,recipients,'client',client.privateKey);}finally{plaintext.fill(0);file=null;}
  const evidenceCapsule=await createStaffCapsule(evidenceEnvelope,manifest,grant,unlocked,expected(evidenceContext.objectId,1)),reference={objectId:evidenceContext.objectId,revision:1,envelopeDigest:await secureEnvelopeDigest(evidenceEnvelope),domain:'tax-document'},target=expected(objectId,packet.envelope.context.revision);
  checkInterrupted();const prepared=await prepareCaseTransition({envelope:packet.envelope,capsule:packet.capsule,manifest,grant,expected:target,pins,staffPrivateKey:staff.privateKey,command:command('document.review',{requestId:'synthetic-resource-request',document:reference,decision:'reviewed',notes:'Synthetic file reviewed'}),evidenceEnvelope,evidenceCapsule});
  const reviewReference='synthetic-resource-reviewed-file',job={version:1,jobId:'synthetic-case-resource-job',workspaceId:pins.workspaceId,operation:'approve-case-transition',approval:{reviewed:true,reviewReference,recipientKeyId:staffKeyId},input:{expectedPins:pins,proposal:prepared.proposal,sourceEnvelope:packet.envelope,manifest,grant,expected:target,reviewedCommitment:prepared.proposal.reviewCommitment,reviewReference}},jobBytes=Buffer.from(JSON.stringify(job));
  assert(jobBytes.length<=30*1024*1024);assert(!jobBytes.includes(Buffer.from('SYNTHETIC RESOURCE SOURCE')));assert(!jobBytes.includes(Buffer.from(evidenceContext.objectId)));
  const wrappingBytes=randomBytes(32),wrappingKey=await crypto.subtle.importKey('raw',wrappingBytes,'AES-GCM',false,['encrypt']),nonce=randomBytes(12),encryptionContext={workspaceId:pins.workspaceId,service:'shuug-key-custody-v1'},secret=utf8.encode(JSON.stringify({bundle,passphrase}));assert(secret.length<=4096);let ciphertext;
  try{ciphertext=Buffer.concat([nonce,Buffer.from(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:utf8.encode(JSON.stringify(encryptionContext))},wrappingKey,secret))]);}finally{secret.fill(0);}
  const config={workspaceId:pins.workspaceId,keyAccountId:'111111111111',dataHostAccountId:'222222222222'},context={invokedFunctionArn:'arn:aws:lambda:us-east-1:111111111111:function:synthetic-case-resource:approved'},event={version:1,jobId:job.jobId,jobVersionId:'synthetic-resource-job-version',approvedSha256:sha(jobBytes)},fixture={syntheticOnly:true,config,context,event,custody:{version:1,workspaceId:pins.workspaceId,ciphertext:ciphertext.toString('base64')},wrappingKey:wrappingBytes.toString('base64')};
  try{await writeFile(path.join(directory,'job.json'),jobBytes,{mode:0o600,flag:'wx'});await writeFile(path.join(directory,'custody-fixture.json'),JSON.stringify(fixture),{mode:0o600,flag:'wx'});}finally{wrappingBytes.fill(0);jobBytes.fill(0);fixture.wrappingKey='';}
  return {pins,recipients,clientKey:client.privateKey,clientId:manifest.clientId,reference};
}

async function measure(){
  if(process.platform!=='darwin')throw new Error('This checked time accounting format targets macOS.');
  const directory=await mkdtemp(path.join(tmpdir(),'shuug-case-worker-resources-'));await chmod(directory,0o700);
  let child=null,interrupted=false,timer;
  const killOwned=()=>{if(child?.pid&&child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}};
  const onSignal=()=>{interrupted=true;killOwned();},checkInterrupted=()=>{if(interrupted)throw new Error('Measurement interrupted.');};
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
  try{
    phase='parent-preparation';const selected=await prepareFixture(directory,checkInterrupted);checkInterrupted();
    // The child receives only an opaque job and simulated wrapped firm custody.
    // Preparer/client keys and readable evidence remain in this parent process.
    phase='child-approval';const childStarted=performance.now();child=spawn(process.execPath,[script,'--worker',directory],{cwd:path.dirname(script),env:{PATH:process.env.PATH,LANG:'C',LC_ALL:'C'},detached:true,stdio:['ignore','pipe','pipe']});
    let output='',accounting='';child.stdout.on('data',bytes=>{output+=bytes;if(output.length>65536)killOwned();});child.stderr.on('data',bytes=>{accounting+=bytes;if(accounting.length>65536)killOwned();});
    timer=setTimeout(()=>{interrupted=true;killOwned();},60000);const [code]=await once(child,'close'),childElapsedMs=Math.round(performance.now()-childStarted);clearTimeout(timer);timer=null;checkInterrupted();assert.equal(code,0);
    phase='resource-accounting';
    // Node exposes the process's OS high-water resident set in KiB. No external
    // accounting helper or elevated kernel-accounting access is needed.
    const worker=JSON.parse(output);assert(worker.ok&&worker.resultWritten);const maxRssBytes=worker.maxRssKiB*1024;assert(Number.isSafeInteger(maxRssBytes)&&maxRssBytes>0);
    phase='client-result-verification';const result=await privateJson(path.join(directory,'worker-result.json'),1024*1024),packet=result.result.approvedCase;
    const {verifyCaseApproval}=await import('../packages/secure-tax-client/case-approval.mjs'),{openEnvelope}=await import('../packages/secure-tax-client/envelope.mjs'),{verifyCasePayload}=await import('../packages/secure-tax-client/case-certificate.mjs');
    await verifyCaseApproval(packet,selected.pins);const opened=await openEnvelope(packet.envelope,packet.envelope.context,selected.recipients,'client',selected.clientKey);
    try{const body=await verifyCasePayload(JSON.parse(decoder.decode(opened)),{...packet.envelope.context,clientId:selected.clientId},selected.pins);assert.deepEqual(body.requests[0].review.document,selected.reference);assert.equal(body.requests[0].review.decision,'reviewed');}finally{opened.fill(0);}
    return {ok:true,syntheticOnly:true,measurement:'Fresh child createHandler approval; fixture preparation excluded',accounting:'Node process.resourceUsage().maxRSS (OS process high-water RSS, KiB)',selectedDocumentBytes:selectedBytes,jobBytes:worker.jobBytes,workerElapsedMs:worker.elapsedMs,childElapsedMs,maxRssBytes,maxRssMiB:Math.round(maxRssBytes/1024/1024*10)/10,independentAccountingComparison:false,originalClientOpenedCertifiedResult:true,awsInvoked:false,awsMemoryQualified:false,temporaryPrivateFixtureRemoved:true};
  }finally{
    clearTimeout(timer);process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);killOwned();if(child&&child.exitCode===null&&child.signalCode===null)await once(child,'close');await rm(directory,{recursive:true,force:true});
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  try{
    if(process.argv.length===4&&process.argv[2]==='--worker')await runWorker(path.resolve(process.argv[3]));
    else if(process.argv.length===2)console.log(JSON.stringify(await measure(),null,2));
    else throw new Error('Unsupported arguments.');
  }catch{console.error(JSON.stringify({ok:false,stage:phase,error:'Synthetic case worker resource check failed. No private inputs were printed.'}));process.exitCode=1;}
}
