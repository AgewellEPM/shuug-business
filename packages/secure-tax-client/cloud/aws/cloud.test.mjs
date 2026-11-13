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
import {prepareReturnProposal} from '../../return-proposals.mjs';
import {prepareReturnCreation} from '../../return-creations.mjs';
import {verifyReturnCreationApproval} from '../../return-create-approval.mjs';
import {prepareCaseTransition} from '../../case-proposals.mjs';
import {verifyCaseApproval} from '../../case-approval.mjs';
import {verifyCasePayload} from '../../case-certificate.mjs';
import {DEFAULT_BOOK_ACCOUNTS,replayCaseBooks,caseBookReport} from '../../case-books.mjs';
import {newReturn} from '../../../tax-engine/index.mjs';
import {officeObjectId,officeSnapshot} from '../../office-model.mjs';
import {prepareAuthorizationInput} from '../../case-authorization.mjs';
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
function fixture(){const provider=new Provider(),handler=createHandler(provider,config);return {provider,handler,async run(operation,input,recipientKeyId=null,reviewReference=crypto.randomUUID()){const job={version:1,jobId:crypto.randomUUID(),workspaceId,operation,approval:{reviewed:true,reviewReference,recipientKeyId},input},bytes=utf8.encode(JSON.stringify(job)),event={version:1,jobId:job.jobId,jobVersionId:'synthetic-job-version',approvedSha256:sha(bytes)};provider.jobs.set(`${job.jobId}:${event.jobVersionId}`,bytes);const response=await handler(event,context);return {response,event,job,result:provider.results.get(job.jobId)?.result};}};}
test('template separates accounts, excludes the data host, requires MFA and has no public endpoint',()=>{
  const value=validateTemplate();assert.equal(value.ok,true);assert.equal(value.awsServiceValidationPerformed,false);
  const t=cloudFormation();assert.equal(t.Resources.Worker.Properties.RuntimeManagementConfig.UpdateRuntimeOn,'FunctionUpdate');
  const undersized=structuredClone(t);undersized.Resources.Worker.Properties.MemorySize=512;assert.throws(()=>validateTemplate(undersized));
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
test('reviewed cloud correction binds decrypted original and proposed values without returning a readable review',async()=>{
  const f=fixture(),pins=(await f.run('initialize',{})).result.publicPins,client=await generateRecipientKeyPair(),staff=await generateRecipientKeyPair();
  const request={version:1,workspaceId,accountId:'synthetic-return-account',clientId:'synthetic-return-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},manifest=(await f.run('enroll',{expectedPins:pins,request,epoch:1},request.client.keyId)).result.manifest;
  const staffRequest={version:1,workspaceId,accountId:request.accountId,clientId:request.clientId,staffAccountId:'synthetic-preparer',staff:{keyId:await publicKeyId(staff.publicKey),publicKey:staff.publicKey}},grant=(await f.run('grant',{expectedPins:pins,request:staffRequest,options:{epoch:1,domains:['tax-document']}},staffRequest.staff.keyId)).result.grant;
  const original=newReturn('1120');original.party.name='SYNTHETIC CLOUD RETURN PRIVATE';original.party.taxId='000123456';original.entity.receiptsCents=10000000;
  const ctx={workspaceId,accountId:request.accountId,objectId:'synthetic-return',revision:1,domain:'tax-document'},recipients={clientPublicKey:client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey},envelope=await sealEnvelope(utf8.encode(JSON.stringify(original)),ctx,recipients,'client',client.privateKey),expected={accountId:request.accountId,clientId:request.clientId,staffAccountId:staffRequest.staffAccountId,staffKeyId:staffRequest.staff.keyId,objectId:ctx.objectId,revision:1,domain:ctx.domain};
  const capsule=(await f.run('share',{expectedPins:pins,envelope,manifest,grant,expected},staffRequest.staff.keyId)).result.capsule,after=structuredClone(original);after.entity.receiptsCents=20000000;
  const prepared=await prepareReturnProposal({envelope,manifest,grant,capsule,expected,pins,staffPrivateKey:staff.privateKey,after}),reviewReference='synthetic-cloud-reviewed',input={expectedPins:pins,proposal:prepared.proposal,sourceEnvelope:envelope,manifest,grant,expected,reviewedCommitment:prepared.proposal.reviewCommitment,reviewReference};
  const approved=await f.run('approve-return-edit',input,staffRequest.staff.keyId,reviewReference);assert.equal(approved.response.ok,true);const packet=approved.result.approvedReturnEdit,opened=await openEnvelope(packet.envelope,{...ctx,revision:2},recipients,'client',client.privateKey);assert.deepEqual(JSON.parse(text.decode(opened)),after);opened.fill(0);
  const publicData=JSON.stringify({job:approved.job,result:approved.result});assert(!publicData.includes('SYNTHETIC CLOUD RETURN PRIVATE'));assert(!publicData.includes('000123456'));assert(!publicData.includes(prepared.privateReview.reviewSalt));
  assert.equal((await f.run('approve-return-edit',{...input,reviewedCommitment:'A'.repeat(43)},staffRequest.staff.keyId,reviewReference)).response.ok,false);
  assert.equal((await f.run('approve-return-edit',input,staffRequest.staff.keyId,'different-review')).response.ok,false);
});
test('reviewed cloud creation issues a new client-readable return and preparer capsule without a source object or readable job values',async()=>{
  const f=fixture(),pins=(await f.run('initialize',{})).result.publicPins,client=await generateRecipientKeyPair(),staff=await generateRecipientKeyPair();
  const request={version:1,workspaceId,accountId:'synthetic-create-account',clientId:'synthetic-create-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},manifest=(await f.run('enroll',{expectedPins:pins,request,epoch:1},request.client.keyId)).result.manifest;
  const staffRequest={version:1,workspaceId,accountId:request.accountId,clientId:request.clientId,staffAccountId:'synthetic-preparer',staff:{keyId:await publicKeyId(staff.publicKey),publicKey:staff.publicKey}},grant=(await f.run('grant',{expectedPins:pins,request:staffRequest,options:{epoch:1,domains:['tax-document']}},staffRequest.staff.keyId)).result.grant;
  const after=newReturn('1120');after.party.name='SYNTHETIC CLOUD CREATION PRIVATE';after.party.taxId='000123456';after.entity.receiptsCents=10000000;
  const expected={accountId:request.accountId,clientId:request.clientId,staffAccountId:staffRequest.staffAccountId,staffKeyId:staffRequest.staff.keyId,objectId:'synthetic-new-return',revision:1,domain:'tax-document'},recipients={clientPublicKey:client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey};
  const prepared=await prepareReturnCreation({after,manifest,grant,expected,pins,staffPrivateKey:staff.privateKey}),reviewReference='synthetic-cloud-create-review',input={expectedPins:pins,proposal:prepared.proposal,manifest,grant,expected,reviewedCommitment:prepared.proposal.reviewCommitment,reviewReference};
  const approved=await f.run('approve-return-create',input,staffRequest.staff.keyId,reviewReference);assert.equal(approved.response.ok,true);const packet=approved.result.approvedReturnCreation;await verifyReturnCreationApproval(packet,pins);
  const clientBytes=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',client.privateKey),staffBytes=await openStaffCapsule(packet.capsule,packet.envelope,manifest,grant,expected,pins,staff.privateKey);try{assert.deepEqual(JSON.parse(text.decode(clientBytes)),after);assert.deepEqual(JSON.parse(text.decode(staffBytes)),after);}finally{clientBytes.fill(0);staffBytes.fill(0);}
  const publicData=JSON.stringify({job:approved.job,result:approved.result});for(const value of ['SYNTHETIC CLOUD CREATION PRIVATE','000123456',prepared.privateReview.reviewSalt])assert(!publicData.includes(value));
  assert.equal((await f.run('approve-return-create',{...input,reviewedCommitment:'A'.repeat(43)},staffRequest.staff.keyId,reviewReference)).response.ok,false);
  assert.equal((await f.run('approve-return-create',input,staffRequest.staff.keyId,'different-review')).response.ok,false);
  assert.equal((await f.run('approve-return-create',{...input,privateReview:prepared.privateReview},staffRequest.staff.keyId,reviewReference)).response.ok,false);
});
test('cloud case transitions keep commands and selected evidence encrypted while issuing client-readable certified history',async()=>{
  const f=fixture(),pins=(await f.run('initialize',{})).result.publicPins,client=await generateRecipientKeyPair(),staff=await generateRecipientKeyPair();
  const request={version:1,workspaceId,accountId:'synthetic-case-account',clientId:'synthetic-case-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},manifest=(await f.run('enroll',{expectedPins:pins,request,epoch:1},request.client.keyId)).result.manifest;
  const staffRequest={version:1,workspaceId,accountId:request.accountId,clientId:request.clientId,staffAccountId:'synthetic-preparer',staff:{keyId:await publicKeyId(staff.publicKey),publicKey:staff.publicKey}},grant=(await f.run('grant',{expectedPins:pins,request:staffRequest,options:{epoch:1,domains:['tax-document']}},staffRequest.staff.keyId)).result.grant,recipients={clientPublicKey:client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey};let packet=null,lastJob,objectId='shuug-case:synthetic-case';
  const perform=async(type,input,evidence=null)=>{
    const expected={accountId:request.accountId,clientId:request.clientId,staffAccountId:staffRequest.staffAccountId,staffKeyId:staffRequest.staff.keyId,objectId,revision:packet?.envelope.context.revision??0,domain:'tax-document'},command={actionId:crypto.randomUUID(),type,input},prepared=await prepareCaseTransition({envelope:packet?.envelope??null,capsule:packet?.capsule??null,manifest,grant,expected,pins,staffPrivateKey:staff.privateKey,command,evidenceEnvelope:evidence?.envelope??null,evidenceCapsule:evidence?.capsule??null}),reviewReference='synthetic-cloud-case-review',jobInput={expectedPins:pins,proposal:prepared.proposal,sourceEnvelope:packet?.envelope??null,manifest,grant,expected,reviewedCommitment:prepared.proposal.reviewCommitment,reviewReference};
    const approved=await f.run('approve-case-transition',jobInput,staffRequest.staff.keyId,reviewReference);assert.equal(approved.response.ok,true);packet=approved.result.approvedCase;await verifyCaseApproval(packet,pins);lastJob={approved,jobInput};const wire=JSON.stringify({job:approved.job,result:approved.result});for(const value of ['SYNTHETIC PRIVATE',type,'synthetic-source-evidence','synthetic-request',prepared.privateReview.reviewSalt])assert(!wire.includes(value));
  };
  await perform('case.create',{title:'SYNTHETIC PRIVATE CLOUD CASE',year:2025,kind:'1120'});await perform('request.add',{requestId:'synthetic-request',title:'SYNTHETIC PRIVATE REQUEST',due:'',notes:'SYNTHETIC PRIVATE NOTES'});
  const bytes=utf8.encode('%PDF-SYNTHETIC PRIVATE CLOUD SOURCE'),payload={version:1,type:'private-file',filename:'source.pdf',mime:'application/pdf',data:Buffer.from(bytes).toString('base64url'),byteLength:bytes.length,purpose:'tax-document',category:'tax',notes:'SYNTHETIC PRIVATE SOURCE',savedAt:new Date().toISOString()},eContext={workspaceId,accountId:request.accountId,objectId:'synthetic-source-evidence',revision:1,domain:'tax-document'},envelope=await sealEnvelope(utf8.encode(JSON.stringify(payload)),eContext,recipients,'client',client.privateKey),expected={accountId:request.accountId,clientId:request.clientId,staffAccountId:staffRequest.staffAccountId,staffKeyId:staffRequest.staff.keyId,objectId:eContext.objectId,revision:1,domain:'tax-document'},capsule=(await f.run('share',{expectedPins:pins,envelope,manifest,grant,expected},staffRequest.staff.keyId)).result.capsule;
  await perform('document.review',{requestId:'synthetic-request',document:{objectId:eContext.objectId,revision:1,envelopeDigest:capsule.envelopeDigest,domain:'tax-document'},decision:'reviewed',notes:'SYNTHETIC PRIVATE REVIEW'},{envelope,capsule});
  const opened=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',client.privateKey);try{const body=await verifyCasePayload(JSON.parse(text.decode(opened)),{...packet.envelope.context,clientId:request.clientId},pins);assert.equal(body.history.length,3);assert.equal(body.requests[0].review.decision,'reviewed');}finally{opened.fill(0);}
  assert.equal((await f.run('approve-case-transition',{...lastJob.jobInput,command:{private:'never clear'}},staffRequest.staff.keyId,'synthetic-cloud-case-review')).response.ok,false);
  assert.equal((await f.run('approve-case-transition',lastJob.jobInput,staffRequest.staff.keyId,'different-review')).response.ok,false);
  await perform('books.open',{title:'SYNTHETIC PRIVATE BOOKS',currency:'USD',from:'2025-01-01',through:'2025-12-31',accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:''});
  await perform('books.journal.post',{date:'2025-06-01',memo:'SYNTHETIC PRIVATE BOOK POSTING',lines:[{accountNumber:1000,debitCents:12345,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:12345}],document:{objectId:eContext.objectId,revision:1,envelopeDigest:capsule.envelopeDigest,domain:'tax-document'},notes:'SYNTHETIC PRIVATE BOOK NOTE'},{envelope,capsule});
  const ledgerBytes=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',client.privateKey);try{const body=await verifyCasePayload(JSON.parse(text.decode(ledgerBytes)),{...packet.envelope.context,clientId:request.clientId},pins),report=caseBookReport(replayCaseBooks(body.history,body.year));assert.equal(report.bankCents,12345);assert.equal(report.netIncomeCents,12345);assert.equal(body.history.length,5);}finally{ledgerBytes.fill(0);}
  const returnContext={workspaceId,accountId:request.accountId,objectId:'synthetic-cloud-return',revision:1,domain:'tax-document'},returnEnvelope=await sealEnvelope(utf8.encode(JSON.stringify(newReturn('1120'))),returnContext,recipients,'client',client.privateKey),returnExpected={...expected,objectId:returnContext.objectId},returnCapsule=(await f.run('share',{expectedPins:pins,envelope:returnEnvelope,manifest,grant,expected:returnExpected},staffRequest.staff.keyId)).result.capsule;
  const bookPlain=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',client.privateKey);let bookVersion;try{bookVersion=replayCaseBooks(JSON.parse(text.decode(bookPlain)).body.history,2025).version;}finally{bookPlain.fill(0);}
  await perform('draft.link',{document:{objectId:returnContext.objectId,revision:1,envelopeDigest:returnCapsule.envelopeDigest,domain:'tax-document'},booksVersion:bookVersion,notes:''},{envelope:returnEnvelope,capsule:returnCapsule});
  const authPlain=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',client.privateKey);let authInput;try{authInput=await prepareAuthorizationInput(JSON.parse(text.decode(authPlain)).body,{workspaceId,...expected,objectId},{objectId:eContext.objectId,revision:1,envelopeDigest:capsule.envelopeDigest,domain:'tax-document',plaintext:utf8.encode(JSON.stringify(payload))},{method:'wet-ink',signedOn:'2026-11-01',signers:[{name:'Synthetic officer',capacity:'Corporate officer'}],signaturesReviewed:true,notes:'SYNTHETIC PRIVATE AUTHORIZATION'});}finally{authPlain.fill(0);}
  await perform('authorization.review',authInput,{envelope,capsule});
  packet=null;objectId=await officeObjectId(request);
  await perform('office.create',{title:'SYNTHETIC PRIVATE FINANCE',notes:''});
  await perform('fee.issue',{invoiceId:'cloud-invoice',number:'CLOUD-001',date:'2025-01-01',due:'2025-02-01',issuer:'SYNTHETIC PRIVATE FIRM',billTo:'SYNTHETIC PRIVATE CLIENT',lines:[{description:'SYNTHETIC PRIVATE SERVICE',quantity:'1',unitCents:12345,discountCents:0,taxCents:0}],terms:'',notes:''});
  await perform('fee.payment',{invoiceId:'cloud-invoice',date:'2025-01-02',amountCents:2345,method:'check',reference:'SYNTHETIC-PAYMENT',document:null,notes:''});
  const financeBytes=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',client.privateKey);try{const body=await verifyCasePayload(JSON.parse(text.decode(financeBytes)),{...packet.envelope.context,clientId:request.clientId},pins);assert.equal(officeSnapshot(body,new Map()).fees.totals.outstandingCents,10000);}finally{financeBytes.fill(0);}

});
