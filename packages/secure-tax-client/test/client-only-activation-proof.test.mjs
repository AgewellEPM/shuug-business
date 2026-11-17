import test from 'node:test';
import assert from 'node:assert/strict';
import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {decode64,encode64,generateRecipientKeyPair} from '../envelope.mjs';
import {openActivationChallenge} from '../activation-proof.mjs';
import {clientOnlyActivationAnswerDigest,openClientOnlyActivationChallenge,sealClientOnlyActivationChallenge} from '../client-only-activation-proof.mjs';
import {createSyntheticClientOnlyFixture} from '../client-only-interop-fixture.mjs';
async function fixture(){
  const f=await createSyntheticClientOnlyFixture(),pub=decode64(f.clientPublicKey,65);
  f.privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.subarray(1,33)),y:encode64(pub.subarray(33)),d:f.clientPrivateKey},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  return f;
}

test('activation challenge is real HPKE Base with documented v2 AAD and a 32-byte answer digest',async()=>{
  const f=await fixture(),c=f.activationChallenge,answer=await openClientOnlyActivationChallenge(c,f.manifest,f.expected,f.pins,f.privateKey);
  assert.equal(answer,f.activationAnswer);assert.equal(await clientOnlyActivationAnswerDigest(answer),f.activationAnswerDigest);
  const suite=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()}),utf8=new TextEncoder();
  const opener=await suite.createRecipientContext({recipientKey:{privateKey:f.privateKey,publicKey:await suite.kem.deserializePublicKey(decode64(f.clientPublicKey,65))},enc:decode64(c.encapsulatedKey,65),info:utf8.encode('gigtax/client-only-activation-proof/v2')});
  const aad=utf8.encode(JSON.stringify([2,'gigtax/client-only-activation-proof','client-only-v1',c.challengeId,c.workspaceId,c.accountId,c.clientId,c.manifestId,c.manifestEpoch,c.keyId,c.expiresAt]));
  const raw=new Uint8Array(await opener.open(decode64(c.ciphertext,48),aad));
  try{assert.equal(encode64(raw),answer);}finally{raw.fill(0);}
  await assert.rejects(()=>clientOnlyActivationAnswerDigest(answer+'='));
  await assert.rejects(()=>clientOnlyActivationAnswerDigest(encode64(new Uint8Array(31))));
});

test('activation binds exact profile, signed manifest, key, context, expiry, type and challenge ID',async()=>{
  const f=await fixture(),open=(challenge=f.activationChallenge,manifest=f.manifest,expected=f.expected,now=Date.now())=>openClientOnlyActivationChallenge(challenge,manifest,expected,f.pins,f.privateKey,now);
  for(const patch of [{version:1},{profile:'legacy'},{type:'shuug-client-activation-proof'},{workspaceId:'wrong-workspace'},{accountId:'wrong-account'},{clientId:'wrong-client'},{manifestId:'wrong-manifest'},{manifestEpoch:2},{keyId:f.manifest.signature.signerKeyId},{challengeId:crypto.randomUUID()},{challengeId:'invalid'},{expiresAt:new Date(Date.now()-1).toISOString()},{expiresAt:new Date(Date.now()+7*60000).toISOString()},{ciphertext:'A'.repeat(64)},{encapsulatedKey:f.clientPublicKey},{extra:'forbidden'}])await assert.rejects(()=>open({...f.activationChallenge,...patch}));
  await assert.rejects(()=>open(f.activationChallenge,{...f.manifest,epoch:2}));
  await assert.rejects(()=>open(f.activationChallenge,f.manifest,{...f.expected,clientPublicKey:f.unrelatedFirmPublicKey}));
  await assert.rejects(()=>open(f.activationChallenge,f.manifest,f.expected,Date.parse(f.activationChallenge.expiresAt)));
  const unrelated=await generateRecipientKeyPair();
  await assert.rejects(()=>openClientOnlyActivationChallenge(f.activationChallenge,f.manifest,f.expected,f.pins,unrelated.privateKey));
  await assert.rejects(()=>openActivationChallenge(f.activationChallenge,f.manifest,f.expected,f.pins,f.privateKey));
  await assert.rejects(()=>sealClientOnlyActivationChallenge({...f.manifest,profile:'legacy'},{challengeId:crypto.randomUUID(),expiresAt:new Date(Date.now()+300000).toISOString()}));
});
