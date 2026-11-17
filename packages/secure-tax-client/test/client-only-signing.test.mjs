import test from 'node:test';
import assert from 'node:assert/strict';
import {encode64,generateRecipientKeyPair,publicKeyId} from '../envelope.mjs';
import {PROFILE,verifyClientOnlyManifest} from '../client-only.mjs';
import {signClientOnlyEnrollment} from '../client-only-signing.mjs';

async function setup(){
  const signer=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']),client=await generateRecipientKeyPair();
  const signerPublicKey=encode64(new Uint8Array(await crypto.subtle.exportKey('raw',signer.publicKey)));
  const publicPins={workspaceId:'synthetic-workspace',signerPublicKey};
  Object.defineProperty(publicPins,'firmRecoveryPublicKey',{get(){throw new Error('Recovery pin must never be read.');}});
  const unlocked={publicPins,signing:signer.privateKey};Object.defineProperty(unlocked,'recovery',{get(){throw new Error('Recovery private key must never be read.');}});
  const request={version:2,profile:PROFILE,workspaceId:publicPins.workspaceId,accountId:'synthetic-account',clientId:'synthetic-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}};
  const pins={version:2,profile:PROFILE,workspaceId:publicPins.workspaceId,signerPublicKey};
  return {unlocked,request,pins,client};
}

test('public signing uses the existing unlocked signer shape without reading any recovery key or pin',async()=>{
  const f=await setup(),now=Date.now(),manifest=await signClientOnlyEnrollment(f.unlocked,f.request,{now});
  assert.equal(manifest.epoch,1);assert.equal(manifest.version,2);assert.equal(manifest.profile,PROFILE);assert(!('firmRecovery'in manifest));
  assert.equal(Date.parse(manifest.expiresAt)-now,365*86400000);
  const result=await verifyClientOnlyManifest(manifest,{accountId:f.request.accountId,clientId:f.request.clientId,clientPublicKey:f.client.publicKey},f.pins,now);
  assert.deepEqual(result.recipients,{clientPublicKey:f.client.publicKey});
  const renewed=await signClientOnlyEnrollment(f.unlocked,f.request,{epoch:2,now,validForMs:86400000});
  assert.equal(renewed.epoch,2);assert.deepEqual(renewed.client,manifest.client);
});

test('signing rejects old enrollment/recovery metadata, invalid epoch/time, signer recipients and mismatched signing keys',async()=>{
  const f=await setup();
  for(const patch of [{version:1},{profile:'legacy'},{workspaceId:'other-workspace'},{accountId:'trailing-newline\n'},{firmRecovery:{publicKey:f.client.publicKey}},{client:{...f.request.client,keyId:'bad-key-id'}},{client:{publicKey:f.pins.signerPublicKey,keyId:await publicKeyId(f.pins.signerPublicKey)}}])await assert.rejects(()=>signClientOnlyEnrollment(f.unlocked,{...f.request,...patch}));
  for(const options of [{epoch:0},{epoch:1e9+1},{epoch:1.5},{now:NaN},{validForMs:0},{validForMs:365*86400000+1},{validForMs:1.5}])await assert.rejects(()=>signClientOnlyEnrollment(f.unlocked,f.request,options));
  const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  await assert.rejects(()=>signClientOnlyEnrollment({publicPins:f.unlocked.publicPins,signing:other.privateKey},f.request));
});
