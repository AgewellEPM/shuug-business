import test from 'node:test';
import assert from 'node:assert/strict';
import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../firm-recovery.mjs';
import {signStaffGrant,createStaffCapsule,revokeStaffGrant} from '../firm-staff.mjs';
import {generateRecipientKeyPair,publicKeyId,sealEnvelope,openEnvelope,encode64,decode64} from '../envelope.mjs';
import {prepareReturnProposal,privateReturnReviewCommitment} from '../return-proposals.mjs';
import {approveReturnEdit} from '../firm-return-edits.mjs';
import {canonicalReturnProposalAad,canonicalReturnEditApproval} from '../return-edit-contract.mjs';
import {newReturn} from '../../tax-engine/index.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {buildOfflineKit} from '../build-offline-kit.mjs';
import {verifyReturnEditApproval} from '../return-edit-approval.mjs';
const utf8=new TextEncoder();
const nativeProof='/private/tmp/native-secure-tax-envelope-proof';
async function nativeClient(){const value=JSON.parse(execFileSync(nativeProof,['fixture'],{encoding:'utf8',maxBuffer:1024*1024}));assert.equal(value.syntheticOnly,true);const pub=decode64(value.clientPublicKey,65),privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.slice(1,33)),y:encode64(pub.slice(33)),d:value.clientPrivateKey},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);return {publicKey:value.clientPublicKey,privateKey,syntheticPrivate:value.clientPrivateKey};}
async function fixture({native=false,epoch=1,year=2025}={}){
  const passphrase='Synthetic return correction custody passphrase.',{bundle,publicPins:pins}=await createFirmBundle('synthetic-return-edits',passphrase),unlocked=await unlockFirmBundle(bundle,passphrase,pins),client=await(native?nativeClient():generateRecipientKeyPair()),staff=await generateRecipientKeyPair(),now=Date.now();
  const clientId=await publicKeyId(client.publicKey),staffKeyId=await publicKeyId(staff.publicKey),manifest=await signEnrollmentRequest({version:1,workspaceId:pins.workspaceId,accountId:'synthetic-account',clientId:'synthetic-client',client:{keyId:clientId,publicKey:client.publicKey}},unlocked,{epoch,now:now-1000});
  const grant=await signStaffGrant({version:1,workspaceId:pins.workspaceId,accountId:manifest.accountId,clientId:manifest.clientId,staffAccountId:'synthetic-preparer',staff:{keyId:staffKeyId,publicKey:staff.publicKey}},unlocked,{epoch,domains:['tax-document'],now:now-1000}),before={...newReturn('1120'),year};before.party.name='SYNTHETIC PRIVATE RETURN CORRECTION';before.party.taxId='000123456';before.entity.receiptsCents=10000000;
  const context={workspaceId:pins.workspaceId,accountId:manifest.accountId,objectId:'synthetic-return',revision:1,domain:'tax-document'},recipients={clientPublicKey:client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey},envelope=await sealEnvelope(utf8.encode(JSON.stringify(before)),context,recipients,'client',client.privateKey),expected={accountId:manifest.accountId,clientId:manifest.clientId,staffAccountId:grant.staffAccountId,staffKeyId,objectId:context.objectId,revision:context.revision,domain:context.domain,minimumGrantEpoch:1,minimumManifestEpoch:1},capsule=await createStaffCapsule(envelope,manifest,grant,unlocked,expected,{now});
  const after=structuredClone(before);after.entity.receiptsCents=20000000;
  const input={envelope,manifest,grant,capsule,expected,pins,staffPrivateKey:staff.privateKey,after,now},prepared=await prepareReturnProposal(input);
  const approve=(changes={})=>approveReturnEdit({proposal:prepared.proposal,envelope,manifest,grant,expected,reviewedCommitment:prepared.proposal.reviewCommitment,reviewReference:'synthetic-reviewed-return',unlocked,now,...changes});
  return {pins,bundle,passphrase,unlocked,client,staff,manifest,grant,before,after,context,recipients,envelope,expected,input,prepared,approve,now};
}
test('firm approval produces native v2 replacement readable by the original client and firm, without changing read grants',async()=>{
  const f=await fixture(),packet=await f.approve();assert.equal(f.grant.rights,'read');assert.equal(packet.envelope.author.role,'firm-recovery');assert.equal(packet.envelope.context.revision,2);assert.equal(await privateReturnReviewCommitment(f.prepared.privateReview),packet.approval.reviewCommitment);
  for(const [role,key]of [['client',f.client.privateKey],['firm-recovery',f.unlocked.recovery]]){const bytes=await openEnvelope(packet.envelope,{...f.context,revision:2},f.recipients,role,key);try{assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),f.after);}finally{bytes.fill(0);}}
  const pub=await crypto.subtle.importKey('raw',decode64(f.pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,decode64(packet.approval.signature.value,64),utf8.encode(canonicalReturnEditApproval(packet.approval))));
  const wire=JSON.stringify({proposal:f.prepared.proposal,packet});assert(!wire.includes('000123456'));assert(!wire.includes('SYNTHETIC PRIVATE RETURN CORRECTION'));assert(!wire.includes(f.prepared.privateReview.reviewSalt));
});
test('proposal binding rejects changed source, recipient, grant, revision, missing review and expiry before signing',async()=>{
  const f=await fixture();await assert.rejects(()=>f.approve({reviewedCommitment:'not-the-private-review'}));
  const envelope=structuredClone(f.envelope);envelope.ciphertext=envelope.ciphertext.slice(0,-2)+'AA';await assert.rejects(()=>f.approve({envelope}));
  const proposal=structuredClone(f.prepared.proposal);proposal.objectId='other-return';await assert.rejects(()=>f.approve({proposal}));
  await assert.rejects(()=>f.approve({expected:{...f.expected,revision:2}}));await assert.rejects(()=>f.approve({now:Date.parse(f.prepared.proposal.expiresAt)+1}));
  const revoked=await revokeStaffGrant(f.grant,f.unlocked,{epoch:2,now:f.now});await assert.rejects(()=>f.approve({grant:revoked}));
  const corrupted=structuredClone(f.prepared.proposal),bytes=decode64(corrupted.wrap.ciphertext,16,524304);bytes[0]^=1;corrupted.wrap.ciphertext=encode64(bytes);await assert.rejects(()=>f.approve({proposal:corrupted}));
});
test('return corrections preserve the existing maximum signed manifest and grant epoch',async()=>{
  const f=await fixture({epoch:1000000000}),packet=await f.approve();await verifyReturnEditApproval(packet,f.pins,f.now);assert.equal(packet.approval.manifestEpoch,1000000000);assert.equal(packet.capsule.grantEpoch,1000000000);
});
test('a legitimate proposer cannot approve a private review that lies about original taxpayer values',async()=>{
  const f=await fixture(),review=structuredClone(f.prepared.privateReview);review.before.entity.receiptsCents=1;const forgedCommitment=await privateReturnReviewCommitment(review),proposal={...structuredClone(f.prepared.proposal),reviewCommitment:forgedCommitment};
  // Adversarial staff possess their real authorized key and can encrypt a
  // well-authenticated proposal, but cannot change the original client ciphertext.
  const hpke=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()}),sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(f.pins.firmRecoveryPublicKey,65)),senderKey:{privateKey:f.staff.privateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(f.staff.publicKey,65))},info:utf8.encode('shuug/secure-tax-return-proposal/v1')});
  proposal.wrap={suite:'HPKE-P256-SHA256-A256GCM',mode:'auth',encapsulatedKey:encode64(new Uint8Array(sender.enc)),ciphertext:encode64(new Uint8Array(await sender.seal(utf8.encode(JSON.stringify({version:1,type:'shuug-return-replacement',reviewSalt:review.reviewSalt,after:f.after})),utf8.encode(canonicalReturnProposalAad(proposal)))))};
  await assert.rejects(()=>f.approve({proposal,reviewedCommitment:forgedCommitment}),/independently reviewed/);
});
test('private review commitments are salted and cannot silently change the return year or family',async()=>{
  const f=await fixture(),second=await prepareReturnProposal(f.input);assert.notEqual(second.proposal.reviewCommitment,f.prepared.proposal.reviewCommitment);
  await assert.rejects(()=>prepareReturnProposal({...f.input,after:{...f.after,kind:'1065'}}));await assert.rejects(()=>prepareReturnProposal({...f.input,after:{...f.after,year:2026}}));await assert.rejects(()=>prepareReturnProposal({...f.input,after:{...f.after,year:2023}}));
});
test('2026 and 2027 encrypted source corrections preserve the exact year without claiming calculation coverage',async()=>{
  for(const year of [2026,2027]){
    const f=await fixture({year}),packet=await f.approve();await verifyReturnEditApproval(packet,f.pins,f.now);
    for(const [role,key]of [['client',f.client.privateKey],['firm-recovery',f.unlocked.recovery]]){const bytes=await openEnvelope(packet.envelope,{...f.context,revision:2},f.recipients,role,key);try{const value=JSON.parse(new TextDecoder().decode(bytes));assert.deepEqual(value,f.after);assert.equal(value.year,year);}finally{bytes.fill(0);}}
    await assert.rejects(()=>prepareReturnProposal({...f.input,after:{...f.after,year:year===2026?2027:2026}}));
    assert.equal(Object.hasOwn(packet.approval,'filingReady'),false);
  }
});
test('standalone firm kit approves reviewed input locally and prepares cloud jobs without readable review data',async()=>{
  const f=await fixture({year:2027}),directory=await mkdtemp(path.join(tmpdir(),'shuug-return-operator-')),kitPath=path.join(directory,'tools');
  try{
    await buildOfflineKit(kitPath);const kit={version:1,type:'shuug-private-return-correction-kit',proposal:f.prepared.proposal,sourceEnvelope:f.envelope,manifest:f.manifest,grant:f.grant,expected:f.expected,privateReview:f.prepared.privateReview},kitFile=path.join(directory,'private-review.json'),bundle=path.join(directory,'firm.json'),pins=path.join(directory,'pins.json'),out=path.join(directory,'approved.json'),jobOut=path.join(directory,'job.json'),bytes=Buffer.from(JSON.stringify(kit)),sha=createHash('sha256').update(bytes).digest('hex');await writeFile(kitFile,bytes);await writeFile(bundle,JSON.stringify(f.bundle));await writeFile(pins,JSON.stringify(f.pins));
    const run=async(script,args,passphrase)=>{const child=spawn(process.execPath,[path.join(kitPath,script),...args],{cwd:directory,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe','pipe']});let error='';child.stderr.on('data',data=>{error+=data;});child.stdio[3].end(passphrase??'');const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{const [code]=await once(child,'exit');return {code,error};}finally{clearTimeout(timer);}};
    const localArgs=['--confirm-off-host','--confirm-fields-reviewed','--passphrase-fd','3','--bundle',bundle,'--public-pins',pins,'--kit',kitFile,'--reviewed-sha256',sha,'--review-reference','synthetic-operator-review','--out',out];
    const local=await run('return-edit-offline-cli.mjs',localArgs,f.passphrase);assert.equal(local.code,0,local.error);const packet=JSON.parse(await readFile(out,'utf8'));await verifyReturnEditApproval(packet,f.pins);const plain=await openEnvelope(packet.envelope,{...f.context,revision:2},f.recipients,'client',f.client.privateKey);assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)),f.after);plain.fill(0);
    assert.equal((await run('return-edit-offline-cli.mjs',localArgs,f.passphrase)).code,1);const prior=await readFile(out);bytes[bytes.length-2]^=1;await writeFile(kitFile,bytes);assert.equal((await run('return-edit-offline-cli.mjs',localArgs,f.passphrase)).code,1);assert.deepEqual(await readFile(out),prior);await writeFile(kitFile,JSON.stringify(kit));
    const cloud=await run('prepare-return-edit-job.mjs',['--confirm-fields-reviewed','--public-pins',pins,'--kit',kitFile,'--reviewed-sha256',sha,'--review-reference','synthetic-operator-review','--job-id','synthetic-cloud-job','--out',jobOut]);assert.equal(cloud.code,0,cloud.error);const jobText=await readFile(jobOut,'utf8'),job=JSON.parse(jobText);assert.equal(job.operation,'approve-return-edit');assert(!jobText.includes('SYNTHETIC PRIVATE RETURN CORRECTION'));assert(!jobText.includes('000123456'));assert(!jobText.includes(f.prepared.privateReview.reviewSalt));assert(!Object.hasOwn(job.input,'privateReview'));
    await assert.rejects(()=>verifyReturnEditApproval(kit,f.pins));
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('actual Swift client decrypts the approved Node firm-authored replacement',{skip:!existsSync(nativeProof)},async()=>{
  const f=await fixture({native:true}),packet=await f.approve(),result=JSON.parse(execFileSync(nativeProof,['open'],{input:JSON.stringify({syntheticOnly:true,context:packet.envelope.context,clientPublicKey:f.client.publicKey,firmRecoveryPublicKey:f.pins.firmRecoveryPublicKey,privateKey:f.client.syntheticPrivate,role:'client',envelope:packet.envelope}),encoding:'utf8',maxBuffer:1024*1024}));
  assert.equal(result.ok,true);const bytes=decode64(result.plaintext,1,1024*1024);try{assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),f.after);}finally{bytes.fill(0);}
});
