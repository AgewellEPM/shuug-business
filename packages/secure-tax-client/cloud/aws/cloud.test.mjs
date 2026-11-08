import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHandler} from './worker.mjs';
import {cloudFormation} from './template.mjs';
import {validateTemplate} from './validate.mjs';
import {buildArtifact} from './build-artifact.mjs';
import {generateRecipientKeyPair,publicKeyId,sealEnvelope,openEnvelope} from '../../envelope.mjs';
import {openStaffCapsule} from '../../staff-grants.mjs';
const workspaceId='synthetic-aws-key-custody',config={workspaceId,keyAccountId:'111111111111',dataHostAccountId:'222222222222'};
const context={invokedFunctionArn:'arn:aws:lambda:us-east-1:111111111111:function:synthetic-key-server:approved'};
const utf8=new TextEncoder(),text=new TextDecoder(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
class Provider{
  jobs=new Map();results=new Map();custody=null;key;calls=[];
  constructor(){this.key=crypto.subtle.importKey('raw',randomBytes(32),'AES-GCM',false,['encrypt','decrypt']);}
  async readJob(id,version){this.calls.push('job');return this.jobs.get(`${id}:${version}`);}
  async readResult(id){return structuredClone(this.results.get(id)??null);}
  async writeResult(id,result){if(this.results.has(id))throw new Error('Existing result.');this.results.set(id,{...structuredClone(result),versionId:'synthetic-result-version'});return 'synthetic-result-version';}
  async readCustody(){return structuredClone(this.custody);}
  async writeCustody(value){if(this.custody)throw new Error('Existing custody.');this.custody=structuredClone(value);}
  async encryptBundle(bytes,ctx){this.calls.push('encrypt');const nonce=randomBytes(12),ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:utf8.encode(JSON.stringify(ctx))},await this.key,bytes);return new Uint8Array(Buffer.concat([nonce,Buffer.from(ciphertext)]));}
  async decryptBundle(bytes,ctx){this.calls.push('decrypt');return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:utf8.encode(JSON.stringify(ctx))},await this.key,bytes.subarray(12)));}
}
function fixture(){const provider=new Provider(),handler=createHandler(provider,config);return {provider,handler,async run(operation,input,recipientKeyId=null){const job={version:1,jobId:crypto.randomUUID(),workspaceId,operation,approval:{reviewed:true,reviewReference:crypto.randomUUID(),recipientKeyId},input},bytes=utf8.encode(JSON.stringify(job)),event={version:1,jobId:job.jobId,jobVersionId:'synthetic-job-version',approvedSha256:sha(bytes)};provider.jobs.set(`${job.jobId}:${event.jobVersionId}`,bytes);const response=await handler(event,context);return {response,event,job,result:provider.results.get(job.jobId)?.result};}};}
test('template separates accounts, excludes the data host, requires MFA and has no public endpoint',()=>{
  const value=validateTemplate();assert.equal(value.ok,true);assert.equal(value.awsServiceValidationPerformed,false);
  const t=cloudFormation();assert.equal(t.Resources.Worker.Properties.RuntimeManagementConfig.UpdateRuntimeOn,'FunctionUpdate');
  const operator=t.Resources.OperatorPolicy.Properties.PolicyDocument.Statement;
  assert(operator.some(s=>s.Effect==='Deny'&&s.Action.includes('kms:Decrypt')));
  assert(!Object.values(t.Resources).some(r=>['AWS::Lambda::Url','AWS::ApiGateway::RestApi','AWS::EC2::Instance'].includes(r.Type)));
  assert.throws(()=>createHandler(new Provider(),{...config,dataHostAccountId:config.keyAccountId}));
});
test('exact reviewed bytes, immutable job version, account context and fingerprint approval fail closed before key use',async()=>{
  const f=fixture();
  const job={version:1,jobId:crypto.randomUUID(),workspaceId,operation:'initialize',approval:{reviewed:true,reviewReference:'synthetic-reviewed',recipientKeyId:null},input:{}};
  const bytes=utf8.encode(JSON.stringify(job)),event={version:1,jobId:job.jobId,jobVersionId:'version-1',approvedSha256:sha(bytes)};
  f.provider.jobs.set(`${job.jobId}:version-1`,bytes);
  assert.deepEqual(await f.handler({...event,approvedSha256:'0'.repeat(64)},context),{ok:false,error:'KEY_JOB_FAILED'});
  assert.deepEqual(await f.handler({...event,jobVersionId:'wrong-version'},context),{ok:false,error:'KEY_JOB_FAILED'});
  assert.deepEqual(await f.handler(event,{invokedFunctionArn:'arn:aws:lambda:us-east-1:222222222222:function:wrong'}),{ok:false,error:'KEY_JOB_FAILED'});
  assert(!f.provider.calls.includes('encrypt'));assert.equal(f.provider.custody,null);
  const bad=await f.run('initialize',{privateKey:'never accepted'});assert.equal(bad.response.ok,false);assert.equal(f.provider.custody,null);
});
test('cloud initialization retains only KMS-wrapped custody and retries never overwrite existing keys',async()=>{
  const f=fixture(),first=await f.run('initialize',{});assert.equal(first.response.ok,true);
  assert.deepEqual(Object.keys(first.result).sort(),['existingCustodyPreserved','publicPins']);
  assert(!JSON.stringify(f.provider.custody).includes('passphrase'));assert(!JSON.stringify(f.provider.custody).includes('"d":'));
  const saved=JSON.stringify(f.provider.custody),replayed=await f.handler(first.event,context);assert.equal(replayed.duplicate,true);
  const again=await f.run('initialize',{});assert.equal(again.result.existingCustodyPreserved,true);assert.deepEqual(again.result.publicPins,first.result.publicPins);assert.equal(JSON.stringify(f.provider.custody),saved);
  assert.equal(f.provider.calls.filter(c=>c==='encrypt').length,1);
  f.provider.decryptBundle=async()=>{throw new Error('synthetic private password or key must not leak');};
  const denied=await f.run('initialize',{});assert.deepEqual(denied.response,{ok:false,error:'KEY_JOB_FAILED'});assert(!JSON.stringify(denied.response).includes('password'));
});
test('approved cloud jobs enroll, share and recover staff access without exposing private keys or changing v2 data',async()=>{
  const f=fixture(),init=await f.run('initialize',{}),pins=init.result.publicPins;
  const client=await generateRecipientKeyPair(),staff=await generateRecipientKeyPair(),replacement=await generateRecipientKeyPair();
  const request={version:1,workspaceId,accountId:'synthetic-client-account',clientId:'synthetic-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}};
  const enrolled=await f.run('enroll',{expectedPins:pins,request,epoch:1},request.client.keyId);assert.equal(enrolled.response.ok,true);const manifest=enrolled.result.manifest;
  const context={workspaceId,accountId:request.accountId,objectId:crypto.randomUUID(),revision:1,domain:'tax-document'},plaintext=utf8.encode('Synthetic cloud recovery 000-12-3456; not a taxpayer');
  const trusted={clientPublicKey:client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey},envelope=await sealEnvelope(plaintext,context,trusted,'client',client.privateKey),original=JSON.stringify(envelope);
  const staffRequest={version:1,workspaceId,accountId:request.accountId,clientId:request.clientId,staffAccountId:'synthetic-staff',staff:{keyId:await publicKeyId(staff.publicKey),publicKey:staff.publicKey}};
  const grantJob=await f.run('grant',{expectedPins:pins,request:staffRequest,options:{epoch:1,domains:['tax-document']}},staffRequest.staff.keyId);assert.equal(grantJob.response.ok,true);const grant=grantJob.result.grant;
  const expected={accountId:request.accountId,clientId:request.clientId,staffAccountId:staffRequest.staffAccountId,staffKeyId:staffRequest.staff.keyId,objectId:context.objectId,revision:1,domain:context.domain};
  const shared=await f.run('share',{expectedPins:pins,envelope,manifest,grant,expected},staffRequest.staff.keyId);assert.equal(shared.response.ok,true);
  assert.deepEqual(await openStaffCapsule(shared.result.capsule,envelope,manifest,grant,expected,pins,staff.privateKey),plaintext);
  const newRequest={...staffRequest,staff:{keyId:await publicKeyId(replacement.publicKey),publicKey:replacement.publicKey}},newExpected={...expected,staffKeyId:newRequest.staff.keyId};
  const recovered=await f.run('recover-device',{expectedPins:pins,grant,request:newRequest,epoch:1,envelope,manifest,expected:newExpected,archiveValidAt:null},newRequest.staff.keyId);assert.equal(recovered.response.ok,true);
  assert.equal(recovered.result.revoked.status,'revoked');assert.equal(recovered.result.revoked.epoch,2);
  assert.deepEqual(await openStaffCapsule(recovered.result.capsule,envelope,manifest,recovered.result.grant,newExpected,pins,replacement.privateKey),plaintext);
  await assert.rejects(()=>openStaffCapsule(recovered.result.capsule,envelope,manifest,recovered.result.grant,newExpected,pins,staff.privateKey));
  assert.equal(JSON.stringify(envelope),original);assert.deepEqual(await openEnvelope(envelope,context,trusted,'client',client.privateKey),plaintext);
  const persisted=JSON.stringify({custody:f.provider.custody,results:[...f.provider.results.values()]});assert(!persisted.includes('000-12-3456'));assert(!persisted.includes('"d":'));assert(!persisted.includes('passphrase'));
  const wrong=await f.run('share',{expectedPins:pins,envelope,manifest,grant,expected},newRequest.staff.keyId);assert.equal(wrong.response.ok,false);
});
test('artifact creation is deterministic, pinned, non-overwriting and readable by a standard ZIP implementation',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'synthetic-aws-custody-artifact-'));
  try{
    const a=await buildArtifact(path.join(dir,'a')),b=await buildArtifact(path.join(dir,'b'));
    assert.equal(a.artifactSha256,b.artifactSha256);assert.equal(a.cloudFormationSha256,b.cloudFormationSha256);assert.deepEqual(a.dependencies,{'@hpke/core':'1.10.0','@hpke/common':'1.11.0'});
    assert.deepEqual(readFileSync(path.join(dir,'a/lambda.zip')),readFileSync(path.join(dir,'b/lambda.zip')));
    assert(!a.files.some(f=>/firm-bundle|[.]env|credentials|[.]aws/.test(f.path)));assert(a.files.some(f=>f.path==='cloud/aws/worker.mjs'));
    await assert.rejects(()=>buildArtifact(path.join(dir,'a')));
    const checked=execFileSync('/usr/bin/python3',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert "cloud/aws/worker.mjs" in z.namelist(); z.extractall(sys.argv[2]); print(len(z.namelist()))',path.join(dir,'a/lambda.zip'),path.join(dir,'extracted')],{encoding:'utf8'});
    assert(Number(checked.trim())>10);
    const loaded=execFileSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(new URL(`file://${path.join(dir,'extracted/cloud/aws/worker.mjs')}`).href)}); if(typeof m.createHandler!=='function')throw new Error('invalid packaged module'); console.log('packaged worker loaded');`],{encoding:'utf8'});
    assert.match(loaded,/packaged worker loaded/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
