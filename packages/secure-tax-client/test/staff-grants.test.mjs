import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest,recoverFirmObject} from '../firm-recovery.mjs';
import {generateRecipientKeyPair,publicKeyId,sealEnvelope,openEnvelope,encode64,decode64} from '../envelope.mjs';
import {signStaffGrant,createStaffCapsule,revokeStaffGrant} from '../firm-staff.mjs';
import {verifyStaffGrant,verifyStaffCapsuleSignature,openStaffCapsule} from '../staff-grants.mjs';
import {STAFF_DOMAINS,canonicalStaffGrant,canonicalStaffCapsule,canonicalEnvelope,assertStaffGrantShape} from '../staff-contract.mjs';
const password='Synthetic offhost firm test passphrase 789!';
async function fixture(){
  const {bundle,publicPins}=await createFirmBundle('synthetic-staff-workspace',password),unlocked=await unlockFirmBundle(bundle,password,publicPins);
  const client=await generateRecipientKeyPair(),staff=await generateRecipientKeyPair();
  const request={version:1,workspaceId:publicPins.workspaceId,accountId:'synthetic-client-account',clientId:'synthetic-client',staffAccountId:'synthetic-staff-account',staff:{keyId:await publicKeyId(staff.publicKey),publicKey:staff.publicKey}};
  const manifest=await signEnrollmentRequest({version:1,workspaceId:publicPins.workspaceId,accountId:request.accountId,clientId:request.clientId,client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},unlocked,{epoch:1});
  const context={workspaceId:publicPins.workspaceId,accountId:request.accountId,objectId:crypto.randomUUID(),revision:1,domain:'tax-document'};
  const plaintext=new TextEncoder().encode('Synthetic protected return bytes; SSN 000-12-3456; not a real taxpayer');
  const trusted={clientPublicKey:client.publicKey,firmRecoveryPublicKey:publicPins.firmRecoveryPublicKey};
  const envelope=await sealEnvelope(plaintext,context,trusted,'client',client.privateKey);
  const grant=await signStaffGrant(request,unlocked,{epoch:1,domains:['tax-document']});
  const expected={accountId:request.accountId,clientId:request.clientId,staffAccountId:request.staffAccountId,staffKeyId:request.staff.keyId,minimumGrantEpoch:1,minimumManifestEpoch:1,objectId:context.objectId,revision:context.revision,domain:context.domain};
  const capsule=await createStaffCapsule(envelope,manifest,grant,unlocked,expected);
  return {bundle,publicPins,unlocked,client,staff,request,manifest,context,plaintext,trusted,envelope,grant,expected,capsule};
}
test('detached signed staff access opens the unchanged v2 object without a client or recovery private key',async()=>{
  const f=await fixture(),before=canonicalEnvelope(f.envelope);
  const verified=await verifyStaffGrant(f.grant,f.expected,f.publicPins);
  assert.equal(verified.status,'active');assert.equal(verified.staffKeyId,f.expected.staffKeyId);assert.equal(verified.rights,'read');
  assert.deepEqual(await openStaffCapsule(f.capsule,f.envelope,f.manifest,f.grant,f.expected,f.publicPins,f.staff.privateKey),f.plaintext);
  assert.equal(canonicalEnvelope(f.envelope),before);
  assert.deepEqual(await openEnvelope(f.envelope,f.context,f.trusted,'client',f.client.privateKey),f.plaintext);
  assert.deepEqual(await recoverFirmObject(f.envelope,f.manifest,f.unlocked,{...f.expected,minimumEpoch:1}),f.plaintext);
  const wire=JSON.stringify({grant:f.grant,capsule:f.capsule,envelope:f.envelope,manifest:f.manifest});
  assert(!wire.includes('000-12-3456'));assert(!wire.includes('"d":'));assert(!wire.includes(password));
});
test('cross-client, device, context, key and signer substitutions are rejected',async()=>{
  const f=await fixture(),wrong=await generateRecipientKeyPair();
  for(const patch of [{accountId:'other-account'},{clientId:'other-client'},{staffAccountId:'other-staff'},{staffKeyId:await publicKeyId(wrong.publicKey)},{objectId:crypto.randomUUID()},{revision:2},{domain:'tax-identity'}]){
    await assert.rejects(()=>openStaffCapsule(f.capsule,f.envelope,f.manifest,f.grant,{...f.expected,...patch},f.publicPins,f.staff.privateKey));
  }
  await assert.rejects(()=>openStaffCapsule(f.capsule,f.envelope,f.manifest,f.grant,f.expected,f.publicPins,wrong.privateKey));
  await assert.rejects(()=>verifyStaffGrant(f.grant,f.expected,{...f.publicPins,signerPublicKey:wrong.publicKey}));
  await assert.rejects(()=>verifyStaffGrant(f.grant,f.expected,{...f.publicPins,workspaceId:'other-workspace'}));
  const wrongManifest=structuredClone(f.manifest);wrongManifest.manifestId='substituted-manifest';
  await assert.rejects(()=>openStaffCapsule(f.capsule,f.envelope,wrongManifest,f.grant,f.expected,f.publicPins,f.staff.privateKey));
});
test('signature, exact source bytes and every ordered v2 recipient slot remain authenticated',async()=>{
  const f=await fixture();
  for(const part of ['grantDigest','envelopeDigest']){
    const tampered=structuredClone(f.capsule);tampered[part]=encode64(new Uint8Array(32));
    await assert.rejects(()=>openStaffCapsule(tampered,f.envelope,f.manifest,f.grant,f.expected,f.publicPins,f.staff.privateKey));
  }
  const modified=structuredClone(f.envelope),body=decode64(modified.ciphertext,16,16*1024*1024);body[0]^=1;modified.ciphertext=encode64(body);
  await assert.rejects(()=>openStaffCapsule(f.capsule,modified,f.manifest,f.grant,f.expected,f.publicPins,f.staff.privateKey));
  // The recovery recipient is used for sharing; corrupt its UNUSED client slot.
  const unused=structuredClone(f.envelope),wrapped=decode64(unused.recipients[0].wrappedKey,48);wrapped[0]^=1;unused.recipients[0].wrappedKey=encode64(wrapped);
  await assert.rejects(()=>createStaffCapsule(unused,f.manifest,f.grant,f.unlocked,f.expected));
  const swapped=structuredClone(f.envelope);swapped.recipients.reverse();assert.throws(()=>canonicalEnvelope(swapped));
  assert.throws(()=>canonicalEnvelope({...f.envelope,filename:'private.pdf'}));
  assert.throws(()=>assertStaffGrantShape({...f.grant,privateKey:'forbidden'}));
  await assert.rejects(()=>verifyStaffCapsuleSignature({...f.capsule,notes:'forbidden plaintext'},f.publicPins));
});
test('signed revocation, epoch floors, source updates and renewed grants cannot reuse an old capsule',async()=>{
  const f=await fixture(),revoked=await revokeStaffGrant(f.grant,f.unlocked,{epoch:2});
  assert.equal((await verifyStaffGrant(revoked,{...f.expected,minimumGrantEpoch:2},f.publicPins)).status,'revoked');
  assert.equal((await verifyStaffGrant(revoked,{...f.expected,minimumGrantEpoch:2},f.publicPins,Date.parse(revoked.expiresAt)+1000)).status,'revoked');
  await assert.rejects(()=>openStaffCapsule(f.capsule,f.envelope,f.manifest,revoked,f.expected,f.publicPins,f.staff.privateKey));
  await assert.rejects(()=>verifyStaffGrant(f.grant,{...f.expected,minimumGrantEpoch:2},f.publicPins));
  const renewed=await signStaffGrant(f.request,f.unlocked,{grantId:f.grant.grantId,epoch:2,domains:['tax-document']});
  await assert.rejects(()=>openStaffCapsule(f.capsule,f.envelope,f.manifest,renewed,f.expected,f.publicPins,f.staff.privateKey));
  const updated=await sealEnvelope(new TextEncoder().encode('Synthetic corrected return'),{...f.context,revision:2},f.trusted,'client',f.client.privateKey);
  await assert.rejects(()=>openStaffCapsule(f.capsule,updated,f.manifest,f.grant,{...f.expected,revision:2},f.publicPins,f.staff.privateKey));
  const fresh=await createStaffCapsule(updated,f.manifest,renewed,f.unlocked,{...f.expected,revision:2,minimumGrantEpoch:2});
  assert.equal(new TextDecoder().decode(await openStaffCapsule(fresh,updated,f.manifest,renewed,{...f.expected,revision:2,minimumGrantEpoch:2},f.publicPins,f.staff.privateKey)),'Synthetic corrected return');
  // Old recipients can retain already obtained data; revocation is not erasure.
  assert.deepEqual(await openStaffCapsule(f.capsule,f.envelope,f.manifest,f.grant,f.expected,f.publicPins,f.staff.privateKey),f.plaintext);
});
test('expired prior grants require explicit historical review for revocation, without enabling stale reads',async()=>{
  const f=await fixture(),past=Date.now()-3*86400000;
  const expired=await signStaffGrant(f.request,f.unlocked,{grantId:f.grant.grantId,epoch:1,validDays:1,now:past,domains:['tax-document']});
  await assert.rejects(()=>verifyStaffGrant(expired,f.expected,f.publicPins));
  await assert.rejects(()=>revokeStaffGrant(expired,f.unlocked,{epoch:2}));
  const revoked=await revokeStaffGrant(expired,f.unlocked,{epoch:2,archiveValidAt:new Date(past+1000).toISOString()});
  assert.equal(revoked.status,'revoked');assert.equal(revoked.epoch,2);assert(Date.parse(revoked.issuedAt)>Date.parse(expired.expiresAt));
  await assert.rejects(()=>revokeStaffGrant(expired,f.unlocked,{epoch:2,archiveValidAt:new Date(Date.now()+86400000).toISOString()}));
  await assert.rejects(()=>revokeStaffGrant(expired,f.unlocked,{epoch:2,archiveValidAt:new Date(past-1000).toISOString()}));
  await assert.rejects(()=>verifyStaffGrant(expired,f.expected,f.publicPins));
});
test('read-only allowed-domain grants, key separation and validity intervals fail closed',async()=>{
  const f=await fixture();
  await assert.rejects(()=>signStaffGrant(f.request,f.unlocked,{epoch:1,domains:['driver-state','tax-document']}));
  await assert.rejects(()=>signStaffGrant(f.request,f.unlocked,{epoch:1,domains:['tax-document','tax-document']}));
  const recoveryId=await publicKeyId(f.publicPins.firmRecoveryPublicKey);
  await assert.rejects(()=>signStaffGrant({...f.request,staff:{keyId:recoveryId,publicKey:f.publicPins.firmRecoveryPublicKey}},f.unlocked,{epoch:1}));
  const clientGrant=await signStaffGrant({...f.request,staff:f.manifest.client},f.unlocked,{epoch:1});
  await assert.rejects(()=>createStaffCapsule(f.envelope,f.manifest,clientGrant,f.unlocked,{...f.expected,staffKeyId:f.manifest.client.keyId}));
  await assert.rejects(()=>createStaffCapsule(f.envelope,f.manifest,f.grant,f.unlocked,{...f.expected,domain:'driver-state'}));
  await assert.rejects(()=>verifyStaffGrant(f.grant,f.expected,f.publicPins,Date.parse(f.grant.expiresAt)));
  await assert.rejects(()=>verifyStaffCapsuleSignature(f.capsule,f.publicPins,Date.parse(f.capsule.expiresAt)));
  assert.equal(typeof canonicalStaffGrant(f.grant),'string');assert.equal(typeof canonicalStaffCapsule(f.capsule),'string');assert.equal(STAFF_DOMAINS.length,7);
});
test('new-process offhost CLI reissues a lost-device grant/capsule, revokes the old key and never changes original data',async()=>{
  const f=await fixture(),replacement=await generateRecipientKeyPair(),directory=mkdtempSync(path.join(tmpdir(),'synthetic-staff-recovery-'));
  const past=Date.now()-3*86400000,priorValidAt=new Date(past+1000).toISOString();
  f.grant=await signStaffGrant(f.request,f.unlocked,{grantId:f.grant.grantId,epoch:1,validDays:1,now:past,domains:['tax-document']});
  const file=name=>path.join(directory,name),cli=fileURLToPath(new URL('../staff-offline-cli.mjs',import.meta.url));
  const common=['--confirm-off-host','--passphrase-fd','0','--bundle',file('bundle.json'),'--public-pins',file('pins.json')];
  const run=args=>spawnSync(process.execPath,[cli,...args],{input:password+'\n',encoding:'utf8',maxBuffer:4096});
  const request={...f.request,staff:{keyId:await publicKeyId(replacement.publicKey),publicKey:replacement.publicKey}},expected={...f.expected,staffKeyId:request.staff.keyId};
  try{
    for(const [name,value] of Object.entries({'bundle.json':f.bundle,'pins.json':f.publicPins,'grant.json':f.grant,'request.json':request,'manifest.json':f.manifest,'envelope.json':f.envelope,'expected.json':expected}))writeFileSync(file(name),JSON.stringify(value),{mode:0o600});
    const original=readFileSync(file('envelope.json'));
    const args=['recover-device',...common,'--prior-grant',file('grant.json'),'--prior-valid-at',priorValidAt,'--request',file('request.json'),'--epoch','1','--manifest',file('manifest.json'),'--envelope',file('envelope.json'),'--expected',file('expected.json'),'--grant-out',file('new-grant.json'),'--capsule-out',file('new-capsule.json'),'--revoke-out',file('revoked.json')];
    assert.equal(run(args.filter(value=>!['--prior-valid-at',priorValidAt].includes(value))).status,1);
    const result=run(args);assert.equal(result.status,0,result.stderr);assert(!result.stdout.includes('000-12-3456'));assert(!result.stderr.includes(password));
    const grant=JSON.parse(readFileSync(file('new-grant.json'))),capsule=JSON.parse(readFileSync(file('new-capsule.json'))),revoked=JSON.parse(readFileSync(file('revoked.json')));
    assert.deepEqual(await openStaffCapsule(capsule,f.envelope,f.manifest,grant,expected,f.publicPins,replacement.privateKey),f.plaintext);
    await assert.rejects(()=>openStaffCapsule(capsule,f.envelope,f.manifest,grant,expected,f.publicPins,f.staff.privateKey));
    assert.equal(revoked.grantId,f.grant.grantId);assert.equal(revoked.status,'revoked');assert.equal(revoked.epoch,2);assert.deepEqual(grant.domains,f.grant.domains);
    assert.deepEqual(readFileSync(file('envelope.json')),original);
    for(const name of ['new-grant.json','new-capsule.json','revoked.json'])assert.equal(statSync(file(name)).mode&0o777,0o600);
    const saved=readFileSync(file('new-grant.json'));assert.equal(run(args).status,1);assert.deepEqual(readFileSync(file('new-grant.json')),saved);
    const noConsent=run(args.filter(value=>value!=='--confirm-off-host'));assert.equal(noConsent.status,1);
    const failed=args.map(value=>value===file('new-grant.json')?file('owned-failed-grant.json'):value===file('new-capsule.json')?file('new-capsule.json'):value);
    assert.equal(run(failed).status,1);assert.equal(existsSync(file('owned-failed-grant.json')),false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
