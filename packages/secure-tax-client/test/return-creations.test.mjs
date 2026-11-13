import test from 'node:test';
import assert from 'node:assert/strict';
import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../firm-recovery.mjs';
import {signStaffGrant,revokeStaffGrant} from '../firm-staff.mjs';
import {generateRecipientKeyPair,publicKeyId,openEnvelope,encode64,decode64} from '../envelope.mjs';
import {openStaffCapsule} from '../staff-grants.mjs';
import {prepareReturnCreation,privateReturnCreationReviewCommitment} from '../return-creations.mjs';
import {approveReturnCreation} from '../firm-return-creations.mjs';
import {canonicalReturnCreationProposalAad} from '../return-create-contract.mjs';
import {verifyReturnCreationApproval} from '../return-create-approval.mjs';
import {verifyReturnEditApproval} from '../return-edit-approval.mjs';
import {newReturn} from '../../tax-engine/index.mjs';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {existsSync} from 'node:fs';
import {buildOfflineKit} from '../build-offline-kit.mjs';
const utf8=new TextEncoder(),nativeProof='/private/tmp/native-secure-tax-envelope-proof';
async function nativeClient(){const value=JSON.parse(execFileSync(nativeProof,['fixture'],{encoding:'utf8',maxBuffer:1024*1024}));assert.equal(value.syntheticOnly,true);const pub=decode64(value.clientPublicKey,65),privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.slice(1,33)),y:encode64(pub.slice(33)),d:value.clientPrivateKey},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);return {publicKey:value.clientPublicKey,privateKey,syntheticPrivate:value.clientPrivateKey};}
async function fixture({kind='1120',year=2025,epoch=1,native=false}={}){
  const passphrase='Synthetic return creation custody passphrase.',{bundle,publicPins:pins}=await createFirmBundle('synthetic-return-creation',passphrase),unlocked=await unlockFirmBundle(bundle,passphrase,pins),client=await(native?nativeClient():generateRecipientKeyPair()),staff=await generateRecipientKeyPair(),now=Date.now();
  const manifest=await signEnrollmentRequest({version:1,workspaceId:pins.workspaceId,accountId:'synthetic-account',clientId:'synthetic-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},unlocked,{epoch,now:now-1000});
  const staffKeyId=await publicKeyId(staff.publicKey),grant=await signStaffGrant({version:1,workspaceId:pins.workspaceId,accountId:manifest.accountId,clientId:manifest.clientId,staffAccountId:'synthetic-preparer',staff:{keyId:staffKeyId,publicKey:staff.publicKey}},unlocked,{epoch,domains:['tax-document'],now:now-1000}),after={...newReturn(kind),year};after.party.name='SYNTHETIC PRIVATE NEW RETURN';after.party.taxId='000123456';if(after.entity)after.entity.receiptsCents=10000000;
  const expected={accountId:manifest.accountId,clientId:manifest.clientId,staffAccountId:grant.staffAccountId,staffKeyId,minimumGrantEpoch:epoch,minimumManifestEpoch:epoch,objectId:'synthetic-new-return',revision:1,domain:'tax-document'},recipients={clientPublicKey:client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey};
  const input={after,manifest,grant,expected,pins,staffPrivateKey:staff.privateKey,now},prepared=await prepareReturnCreation(input);
  const approve=(changes={})=>approveReturnCreation({proposal:prepared.proposal,manifest,grant,expected,reviewedCommitment:prepared.proposal.reviewCommitment,reviewReference:'synthetic-reviewed-creation',unlocked,now,...changes});
  return {pins,bundle,passphrase,unlocked,client,staff,manifest,grant,after,expected,recipients,input,prepared,approve,now};
}
test('firm-approved initial returns for both families open for the original client, firm and preparer without a prior object',async()=>{
  for(const year of [2023,2024,2025,2026,2027])for(const kind of ['1040','1065','1120S','1120']){
    const f=await fixture({kind,year}),packet=await f.approve();await verifyReturnCreationApproval(packet,f.pins,f.now);assert.equal(f.grant.rights,'read');assert.equal(packet.envelope.context.revision,1);assert.equal(packet.envelope.author.role,'firm-recovery');assert.equal(f.prepared.privateReview.before,null);
    for(const [role,key]of [['client',f.client.privateKey],['firm-recovery',f.unlocked.recovery]]){const bytes=await openEnvelope(packet.envelope,packet.envelope.context,f.recipients,role,key);try{assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),f.after);}finally{bytes.fill(0);}}
    const bytes=await openStaffCapsule(packet.capsule,packet.envelope,f.manifest,f.grant,f.expected,f.pins,f.staff.privateKey);try{assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),f.after);}finally{bytes.fill(0);}
    const wire=JSON.stringify({proposal:f.prepared.proposal,packet});for(const privateValue of ['000123456','SYNTHETIC PRIVATE NEW RETURN',f.prepared.privateReview.reviewSalt])assert(!wire.includes(privateValue));
    await assert.rejects(()=>verifyReturnEditApproval(packet,f.pins,f.now));
  }
});
test('creation proposals reject another scope, wrong epoch, revisions, revoked authorization, ciphertext and expiry',async()=>{
  const f=await fixture();for(const expected of [{...f.expected,revision:2},{...f.expected,clientId:'other-client'},{...f.expected,objectId:'other-object'},{...f.expected,minimumGrantEpoch:2},{...f.expected,domain:'driver-record'}])await assert.rejects(()=>f.approve({expected}));
  await assert.rejects(()=>prepareReturnCreation({...f.input,expected:{...f.expected,privateNote:'never copy unknown readable metadata into a cloud job'}}));
  await assert.rejects(()=>f.approve({reviewedCommitment:'not-reviewed'}));await assert.rejects(()=>f.approve({now:Date.parse(f.prepared.proposal.expiresAt)+1}));
  const revoked=await revokeStaffGrant(f.grant,f.unlocked,{epoch:2,now:f.now});await assert.rejects(()=>f.approve({grant:revoked}));
  const renewed=await signStaffGrant({version:1,workspaceId:f.pins.workspaceId,accountId:f.manifest.accountId,clientId:f.manifest.clientId,staffAccountId:f.grant.staffAccountId,staff:f.grant.staff},f.unlocked,{grantId:f.grant.grantId,epoch:2,domains:['tax-document'],now:f.now});await assert.rejects(()=>f.approve({grant:renewed}));
  const foreign=await generateRecipientKeyPair(),wrongSender=await prepareReturnCreation({...f.input,staffPrivateKey:foreign.privateKey});await assert.rejects(()=>f.approve({proposal:wrongSender.proposal,reviewedCommitment:wrongSender.proposal.reviewCommitment}));
  const corrupted=structuredClone(f.prepared.proposal),bytes=decode64(corrupted.wrap.ciphertext,16,524304);bytes[0]^=1;corrupted.wrap.ciphertext=encode64(bytes);await assert.rejects(()=>f.approve({proposal:corrupted}));
  const packet=await f.approve(),changed=structuredClone(packet);changed.approval.objectId='other-object';await assert.rejects(()=>verifyReturnCreationApproval(changed,f.pins,f.now));changed.approval=packet.approval;changed.envelope.context.revision=2;await assert.rejects(()=>verifyReturnCreationApproval(changed,f.pins,f.now));
  await assert.rejects(()=>f.approve({proposal:{...f.prepared.proposal,sourceRevision:0}}));
});
test('an authorized proposer cannot get different decrypted content approved under a false private review',async()=>{
  const f=await fixture(),review=structuredClone(f.prepared.privateReview);review.after.entity.receiptsCents=1;const commitment=await privateReturnCreationReviewCommitment(review),proposal={...structuredClone(f.prepared.proposal),reviewCommitment:commitment};
  const hpke=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()}),sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(f.pins.firmRecoveryPublicKey,65)),senderKey:{privateKey:f.staff.privateKey,publicKey:await hpke.kem.deserializePublicKey(decode64(f.staff.publicKey,65))},info:utf8.encode('shuug/secure-tax-return-create-proposal/v1')});
  proposal.wrap={suite:'HPKE-P256-SHA256-A256GCM',mode:'auth',encapsulatedKey:encode64(new Uint8Array(sender.enc)),ciphertext:encode64(new Uint8Array(await sender.seal(utf8.encode(JSON.stringify({version:1,type:'shuug-return-creation',reviewSalt:review.reviewSalt,after:f.after})),utf8.encode(canonicalReturnCreationProposalAad(proposal)))))};
  await assert.rejects(()=>f.approve({proposal,reviewedCommitment:commitment}),/independently reviewed/);review.before={};await assert.rejects(()=>privateReturnCreationReviewCommitment(review));
});
test('creation reviews use fresh salts, preserve maximum existing epochs and refuse unsupported years',async()=>{
  const f=await fixture({epoch:1000000000}),second=await prepareReturnCreation(f.input);assert.notEqual(second.proposal.reviewCommitment,f.prepared.proposal.reviewCommitment);const packet=await f.approve();await verifyReturnCreationApproval(packet,f.pins,f.now);assert.equal(packet.approval.manifestEpoch,1000000000);assert.equal(packet.capsule.grantEpoch,1000000000);
  for(const year of [2022,2028,'2027',2027.5])await assert.rejects(()=>prepareReturnCreation({...f.input,after:{...f.after,year}}));
});
test('standalone kit approves only exact reviewed creation files and prepares opaque cloud jobs',async()=>{
  const f=await fixture({year:2027}),directory=await mkdtemp(path.join(tmpdir(),'shuug-create-operator-')),kitPath=path.join(directory,'tools');
  try{
    await buildOfflineKit(kitPath);const kit={version:1,type:'shuug-private-return-creation-kit',proposal:f.prepared.proposal,manifest:f.manifest,grant:f.grant,expected:f.expected,privateReview:f.prepared.privateReview},kitFile=path.join(directory,'private.json'),bundle=path.join(directory,'firm.json'),pins=path.join(directory,'pins.json'),out=path.join(directory,'approved.json'),jobOut=path.join(directory,'job.json'),bytes=Buffer.from(JSON.stringify(kit)),sha=createHash('sha256').update(bytes).digest('hex');await writeFile(kitFile,bytes);await writeFile(bundle,JSON.stringify(f.bundle));await writeFile(pins,JSON.stringify(f.pins));
    const run=async(script,args,passphrase)=>{const child=spawn(process.execPath,[path.join(kitPath,script),...args],{cwd:directory,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe','pipe']});let error='';child.stderr.on('data',data=>{error+=data;});child.stdio[3].end(passphrase??'');const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{const [code]=await once(child,'exit');return {code,error};}finally{clearTimeout(timer);}};
    const args=['--confirm-off-host','--confirm-fields-reviewed','--passphrase-fd','3','--bundle',bundle,'--public-pins',pins,'--kit',kitFile,'--reviewed-sha256',sha,'--review-reference','synthetic-reviewed-creation','--out',out];
    const local=await run('return-create-offline-cli.mjs',args,f.passphrase);assert.equal(local.code,0,local.error);const packet=JSON.parse(await readFile(out,'utf8'));await verifyReturnCreationApproval(packet,f.pins);assert.equal((await stat(out)).mode&0o777,0o600);
    assert.equal((await run('return-create-offline-cli.mjs',args,f.passphrase)).code,1);const prior=await readFile(out);await writeFile(kitFile,Buffer.concat([bytes,Buffer.from(' ')]));assert.equal((await run('return-create-offline-cli.mjs',args,f.passphrase)).code,1);assert.deepEqual(await readFile(out),prior);await writeFile(kitFile,bytes);
    const cloud=await run('prepare-return-create-job.mjs',['--confirm-fields-reviewed','--public-pins',pins,'--kit',kitFile,'--reviewed-sha256',sha,'--review-reference','synthetic-reviewed-creation','--job-id','synthetic-create-job','--out',jobOut]);assert.equal(cloud.code,0,cloud.error);const jobText=await readFile(jobOut,'utf8'),job=JSON.parse(jobText);assert.equal(job.operation,'approve-return-create');assert(!Object.hasOwn(job.input,'privateReview'));for(const value of ['SYNTHETIC PRIVATE NEW RETURN','000123456',f.prepared.privateReview.reviewSalt])assert(!jobText.includes(value));await assert.rejects(()=>verifyReturnCreationApproval(kit,f.pins));
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('actual Swift client opens the Node firm-approved initial return',{skip:!existsSync(nativeProof)},async()=>{
  const f=await fixture({native:true}),packet=await f.approve(),result=JSON.parse(execFileSync(nativeProof,['open'],{input:JSON.stringify({syntheticOnly:true,context:packet.envelope.context,clientPublicKey:f.client.publicKey,firmRecoveryPublicKey:f.pins.firmRecoveryPublicKey,privateKey:f.client.syntheticPrivate,role:'client',envelope:packet.envelope}),encoding:'utf8',maxBuffer:1024*1024}));assert.equal(result.ok,true);
  const bytes=decode64(result.plaintext,1,1024*1024);try{assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),f.after);}finally{bytes.fill(0);}
});
