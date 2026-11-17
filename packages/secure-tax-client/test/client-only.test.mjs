import test from 'node:test';
import assert from 'node:assert/strict';
import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {decode64,encode64,generateRecipientKeyPair,publicKeyId,sealEnvelope,verifyEnrollmentManifest} from '../envelope.mjs';
import {PROFILE,assertClientOnlyKeyPair,canonicalClientOnlyManifest,openClientOnlyEnvelope,sealClientOnlyEnvelope,verifyClientOnlyManifest} from '../client-only.mjs';
import {createSyntheticClientOnlyFixture} from '../client-only-interop-fixture.mjs';
const utf8=new TextEncoder();
const imported=async(publicKey,privateKey,algorithm='ECDH')=>{
  const pub=decode64(publicKey,65),raw=decode64(privateKey,32);
  try{return await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.subarray(1,33)),y:encode64(pub.subarray(33)),d:encode64(raw)},{name:algorithm,namedCurve:'P-256'},false,algorithm==='ECDH'?['deriveBits']:['sign']);}finally{raw.fill(0);}
};
const fixture=async()=>{
  const f=await createSyntheticClientOnlyFixture();
  return {...f,trusted:{clientPublicKey:f.clientPublicKey},clientKey:await imported(f.clientPublicKey,f.clientPrivateKey),firmKey:await imported(f.unrelatedFirmPublicKey,f.unrelatedFirmPrivateKey),ownerAgreementKey:await imported(f.signerPublicKey,f.signerPrivateKey),plaintextBytes:decode64(f.plaintext,0,1024)};
};

test('client-only v3 actually opens only with the nonextractable client key; firm and signer scalars cannot decrypt',async()=>{
  const f=await fixture(),open=key=>openClientOnlyEnvelope(f.envelope,f.context,f.trusted,'client',key);
  assert.equal(f.clientKey.extractable,false);assert.deepEqual(await open(f.clientKey),f.plaintextBytes);
  for(const key of [f.firmKey,f.ownerAgreementKey]){
    await assert.rejects(()=>open(key));
    await assert.rejects(()=>sealClientOnlyEnvelope(f.plaintextBytes,f.context,f.trusted,'client',key));
    await assert.rejects(()=>assertClientOnlyKeyPair(key,f.clientPublicKey));
  }
  for(const role of ['firm-recovery','owner','staff','']){
    await assert.rejects(()=>openClientOnlyEnvelope(f.envelope,f.context,f.trusted,role,f.firmKey));
    await assert.rejects(()=>sealClientOnlyEnvelope(f.plaintextBytes,f.context,f.trusted,role,f.clientKey));
  }
  const fresh=await sealClientOnlyEnvelope(f.plaintextBytes,f.context,f.trusted,'client',f.clientKey);
  assert.notEqual(fresh.nonce,f.envelope.nonce);assert.notEqual(fresh.ciphertext,f.envelope.ciphertext);assert.notEqual(fresh.recipients[0].encapsulatedKey,f.envelope.recipients[0].encapsulatedKey);
  assert.deepEqual(f.plaintextBytes,decode64(f.plaintext,0,1024),'the caller retains its input bytes');
});

test('independent HPKE Auth and AES-GCM opens the documented exact v3 info and AAD',async()=>{
  const f=await fixture(),e=f.envelope,slot=e.recipients[0],keyId=await publicKeyId(f.clientPublicKey);
  const base=JSON.stringify([3,'gigtax/client-only-envelope','client-only-v1',f.context.domain,f.context.workspaceId,f.context.accountId,f.context.objectId,f.context.revision,'AES-256-GCM','HPKE-P256-SHA256-A256GCM','auth',['client',keyId],['client',keyId]]);
  const suite=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()});
  const publicKey=await suite.kem.deserializePublicKey(decode64(f.clientPublicKey,65));
  const opener=await suite.createRecipientContext({recipientKey:{privateKey:f.clientKey,publicKey},senderPublicKey:publicKey,enc:decode64(slot.encapsulatedKey,65),info:utf8.encode('gigtax/client-only-envelope/v3')});
  const raw=new Uint8Array(await opener.open(decode64(slot.wrappedKey,48),utf8.encode(base)));
  try{
    const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
    const additionalData=utf8.encode(JSON.stringify([base,[slot.role,slot.keyId,slot.publicKey,slot.encapsulatedKey,slot.wrappedKey]]));
    assert.deepEqual(new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(e.nonce,12),additionalData,tagLength:128},key,decode64(e.ciphertext,16,1024))),f.plaintextBytes);
  }finally{raw.fill(0);}
  // Bypass our format/pair guards: unrelated private scalars still cannot
  // unwrap the actual HPKE ciphertext under its original authenticated bytes.
  for(const [privateKey,encodedPublic]of [[f.firmKey,f.unrelatedFirmPublicKey],[f.ownerAgreementKey,f.signerPublicKey]]){
    const wrong=await suite.createRecipientContext({recipientKey:{privateKey,publicKey:await suite.kem.deserializePublicKey(decode64(encodedPublic,65))},senderPublicKey:publicKey,enc:decode64(slot.encapsulatedKey,65),info:utf8.encode('gigtax/client-only-envelope/v3')});
    await assert.rejects(()=>wrong.open(decode64(slot.wrappedKey,48),utf8.encode(base)));
  }
});

test('single slot, author, complete context, canonical encoding and exact schema are authenticated',async()=>{
  const f=await fixture(),open=e=>openClientOnlyEnvelope(e,f.context,f.trusted,'client',f.clientKey);
  for(const patch of [{version:2},{profile:'unknown'},{profile:'client-only-v2'},{hpkeMode:'base'},{author:{role:'firm-recovery',keyId:f.envelope.author.keyId}},{author:{...f.envelope.author,keyId:await publicKeyId(f.unrelatedFirmPublicKey)}},{firmRecovery:{publicKey:f.unrelatedFirmPublicKey}},{recipients:[]},{recipients:[...f.envelope.recipients,...f.envelope.recipients]},{nonce:f.envelope.nonce+'='},{ciphertext:f.envelope.ciphertext+'='}])await assert.rejects(()=>open({...f.envelope,...patch}));
  for(const name of ['workspaceId','accountId','objectId','revision','domain']){
    const changed={...f.context,[name]:name==='revision'?2:name==='domain'?'driver-record':'wrong-context'};
    await assert.rejects(()=>openClientOnlyEnvelope(f.envelope,changed,f.trusted,'client',f.clientKey));
    await assert.rejects(()=>open({...f.envelope,context:changed}));
  }
  for(const patch of [{role:'firm-recovery'},{keyId:await publicKeyId(f.unrelatedFirmPublicKey)},{publicKey:f.unrelatedFirmPublicKey},{recoveryKey:'forbidden'},{wrappedKey:'A'.repeat(64)}])await assert.rejects(()=>open({...f.envelope,recipients:[{...f.envelope.recipients[0],...patch}]}));
  const damaged=structuredClone(f.envelope),bytes=decode64(damaged.ciphertext,16,1024);bytes[0]^=1;damaged.ciphertext=encode64(bytes);await assert.rejects(()=>open(damaged));
  await assert.rejects(()=>openClientOnlyEnvelope(f.envelope,f.context,{...f.trusted,firmRecoveryPublicKey:f.unrelatedFirmPublicKey},'client',f.clientKey));
  await assert.rejects(()=>sealClientOnlyEnvelope(f.plaintextBytes,{...f.context,objectId:'trailing-newline\n'},f.trusted,'client',f.clientKey));
});

test('manifest v2 verifies exact signer/profile/account/time/epoch and independently held client binding',async()=>{
  const f=await fixture(),verify=(m=f.manifest,expected=f.expected,pins=f.pins,now=Date.now())=>verifyClientOnlyManifest(m,expected,pins,now);
  const result=await verify();assert.deepEqual(result,{profile:PROFILE,manifestId:f.manifest.manifestId,epoch:1,recipients:f.trusted});
  assert.equal(canonicalClientOnlyManifest(f.manifest),JSON.stringify([2,'gigtax/client-only-manifest',PROFILE,f.manifest.manifestId,f.manifest.workspaceId,f.manifest.accountId,f.manifest.clientId,f.manifest.epoch,f.manifest.client.keyId,f.manifest.client.publicKey,f.manifest.issuedAt,f.manifest.expiresAt]));
  await verify(f.manifest,f.expected,f.nativePins);
  await verify(f.manifest,f.expected,{...f.pins,uiOrigin:'https://synthetic-ui.example',apiOrigin:'https://synthetic-api.example'});
  for(const expected of [{...f.expected,accountId:'other-account'},{...f.expected,clientId:'other-client'},{...f.expected,minimumEpoch:2},{...f.expected,minimumEpoch:0},{...f.expected,clientPublicKey:f.unrelatedFirmPublicKey},{...f.expected,profile:'legacy'},{...f.expected,workspaceId:'other'},{...f.expected,manifestId:'other'}])await assert.rejects(()=>verify(f.manifest,expected));
  for(const patch of [{version:1},{profile:'legacy'},{epoch:2},{epoch:1.5},{issuedAt:f.manifest.issuedAt.replace('.','')},{expiresAt:new Date(Date.now()-1000).toISOString()},{firmRecovery:{publicKey:f.unrelatedFirmPublicKey}},{client:{...f.manifest.client,publicKey:f.signerPublicKey,keyId:await publicKeyId(f.signerPublicKey)}}])await assert.rejects(()=>verify({...f.manifest,...patch}));
  for(const pins of [{...f.pins,profile:'legacy'},{...f.pins,version:1},{...f.pins,firmRecoveryPublicKey:f.unrelatedFirmPublicKey},{...f.pins,signerPublicKey:f.unrelatedFirmPublicKey},{...f.pins,uiOrigin:'https://same.example',apiOrigin:'https://same.example'}])await assert.rejects(()=>verify(f.manifest,f.expected,pins));
  await assert.rejects(()=>verify(f.manifest,f.expected,f.pins,Number.NaN));
  await assert.rejects(()=>verify(f.manifest,f.expected,f.pins,Date.parse(f.manifest.expiresAt)));
  await assert.rejects(()=>verify(f.manifest,f.expected,f.pins,Date.parse(f.manifest.issuedAt)-60001));
});

test('legacy generic envelope v2 and manifest v1 remain separate and functional',async()=>{
  const f=await fixture(),firm=await generateRecipientKeyPair(),legacyTrusted={clientPublicKey:f.clientPublicKey,firmRecoveryPublicKey:firm.publicKey};
  const legacy=await sealEnvelope(f.plaintextBytes,f.context,legacyTrusted,'client',f.clientKey);
  await assert.rejects(()=>openClientOnlyEnvelope(legacy,f.context,f.trusted,'client',f.clientKey));
  await assert.rejects(()=>verifyEnrollmentManifest(f.manifest,f.expected,{workspaceId:f.pins.workspaceId,signerPublicKey:f.signerPublicKey,firmRecoveryPublicKey:firm.publicKey}));
});
