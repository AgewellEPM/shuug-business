import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRecipientKeyPair,sealEnvelope,openEnvelope,encode64,decode64,publicKeyId,verifyEnrollmentManifest} from '../envelope.mjs';
const context={workspaceId:'synthetic-workspace',accountId:'client-account',objectId:'tax-object',revision:1,domain:'tax-identity'};
const text=new TextEncoder().encode('Synthetic private tax identity and document');
test('fresh envelopes open with either local recipient, and wrong keys/context/tampering fail',async()=>{
 const client=await generateRecipientKeyPair(),firm=await generateRecipientKeyPair(),other=await generateRecipientKeyPair();
 assert.equal(client.privateKey.extractable,false);
 const trusted={clientPublicKey:client.publicKey,firmRecoveryPublicKey:firm.publicKey};
 const envelope=await sealEnvelope(text,context,trusted,'client',client.privateKey);
 assert.deepEqual(await openEnvelope(envelope,context,trusted,'client',client.privateKey),text);
 assert.deepEqual(await openEnvelope(envelope,context,trusted,'firm-recovery',firm.privateKey),text);
 assert(!JSON.stringify(envelope).includes(new TextDecoder().decode(text)));
 assert.notEqual((await sealEnvelope(text,context,trusted,'client',client.privateKey)).ciphertext,envelope.ciphertext);
 await assert.rejects(()=>openEnvelope(envelope,context,trusted,'client',other.privateKey));
 await assert.rejects(()=>openEnvelope(envelope,{...context,revision:2},trusted,'client',client.privateKey));
 await assert.rejects(()=>openEnvelope(envelope,context,{...trusted,firmRecoveryPublicKey:other.publicKey},'client',client.privateKey));
 const tampered=structuredClone(envelope);const bytes=decode64(tampered.ciphertext,16,1024);bytes[0]^=1;tampered.ciphertext=encode64(bytes);
 await assert.rejects(()=>openEnvelope(tampered,context,trusted,'client',client.privateKey));
 const falseAuthor={...envelope,author:{role:'firm-recovery',keyId:await publicKeyId(firm.publicKey)}};await assert.rejects(()=>openEnvelope(falseAuthor,context,trusted,'client',client.privateKey));
 await assert.rejects(()=>openEnvelope({...envelope,version:1,hpkeMode:'base'},context,trusted,'client',client.privateKey));
 const reordered={...envelope,recipients:[...envelope.recipients].reverse()};await assert.rejects(()=>openEnvelope(reordered,context,trusted,'client',client.privateKey));
 for(const [slot,reader,key] of [[1,'client',client.privateKey],[0,'firm-recovery',firm.privateKey]]){
  const damaged=structuredClone(envelope),wrap=decode64(damaged.recipients[slot].wrappedKey,48);wrap[0]^=1;damaged.recipients[slot].wrappedKey=encode64(wrap);
  await assert.rejects(()=>openEnvelope(damaged,context,trusted,reader,key));
 }
 await assert.rejects(()=>sealEnvelope(text,{...context,objectId:'trailing-newline\n'},trusted,'client',client.privateKey));
 await assert.rejects(()=>sealEnvelope(text,context,{clientPublicKey:client.publicKey,firmRecoveryPublicKey:client.publicKey},'client',client.privateKey));
});
test('client verifies signed enrollment against independent firm pins and exact account/epoch',async()=>{
 const client=await generateRecipientKeyPair(),firm=await generateRecipientKeyPair();
 const signer=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const signerPublicKey=encode64(new Uint8Array(await crypto.subtle.exportKey('raw',signer.publicKey)));
 const manifest={version:1,manifestId:'manifest-one',workspaceId:context.workspaceId,accountId:context.accountId,clientId:'service-client',epoch:1,client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey},firmRecovery:{keyId:await publicKeyId(firm.publicKey),publicKey:firm.publicKey},issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
 const array=[1,'shuug/secure-tax-manifest',manifest.manifestId,manifest.workspaceId,manifest.accountId,manifest.clientId,manifest.epoch,manifest.client.keyId,manifest.client.publicKey,manifest.firmRecovery.keyId,manifest.firmRecovery.publicKey,manifest.issuedAt,manifest.expiresAt];
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,new TextEncoder().encode(JSON.stringify(array)));
 manifest.signature={algorithm:'ES256-P1363',signerKeyId:await publicKeyId(signerPublicKey),value:encode64(new Uint8Array(signature))};
 const expected={accountId:manifest.accountId,clientId:manifest.clientId,minimumEpoch:1};
 const pins={workspaceId:manifest.workspaceId,signerPublicKey,firmRecoveryPublicKey:firm.publicKey};
 assert.equal((await verifyEnrollmentManifest(manifest,expected,pins)).manifestId,'manifest-one');
 await assert.rejects(()=>verifyEnrollmentManifest(manifest,{...expected,accountId:'someone-else'},pins));
 await assert.rejects(()=>verifyEnrollmentManifest(manifest,{...expected,minimumEpoch:2},pins));
 await assert.rejects(()=>verifyEnrollmentManifest({...manifest,epoch:2},expected,pins));
 await assert.rejects(()=>verifyEnrollmentManifest(manifest,expected,pins,Date.now()+120000));
 const attacker=await generateRecipientKeyPair();await assert.rejects(()=>verifyEnrollmentManifest(manifest,expected,{...pins,firmRecoveryPublicKey:attacker.publicKey}));
});
