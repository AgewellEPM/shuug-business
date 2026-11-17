import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {CONTENT_ALGORITHM,DOMAINS,MAX_CIPHERTEXT_BYTES,SUITE,decode64,encode64,publicKeyId,validateContext} from './envelope.mjs';

// This profile has no recovery or delegation path. The public signer approves
// account bindings only; it is never an encryption recipient or an author.
export const PROFILE='client-only-v1';
export {CONTENT_ALGORITHM,DOMAINS,MAX_CIPHERTEXT_BYTES,SUITE};
const hpke=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()});
const utf8=new TextEncoder(),info=utf8.encode('gigtax/client-only-envelope/v3');
const fail=()=>{throw new Error('Client-only protected item or independently trusted binding is invalid.');};
const exact=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();
};
const id=value=>{if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();};
const epoch=value=>{if(!Number.isInteger(value)||value<1||value>1e9)fail();};
const timestamp=value=>{
  if(typeof value!=='string')fail();
  const time=Date.parse(value);
  if(!Number.isFinite(time)||new Date(time).toISOString()!==value)fail();
  return time;
};
const origin=value=>{
  if(typeof value!=='string')fail();
  let url;try{url=new URL(value);}catch{fail();}
  if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)fail();
};

/** Accept independently distributed signer pins, browser config or native pins.
 * No host-supplied recovery public key is accepted in any of these shapes. */
export async function validateClientOnlyPins(pins){
  const keys=Object.keys(pins??{}).sort().join('|');
  const base=['version','profile','workspaceId','signerPublicKey'];
  if(keys===[...base,'uiOrigin','apiOrigin'].sort().join('|')){
    exact(pins,[...base,'uiOrigin','apiOrigin']);origin(pins.uiOrigin);origin(pins.apiOrigin);
    if(pins.uiOrigin===pins.apiOrigin)fail();
  }else if(keys===[...base,'workspaceOrigin'].sort().join('|')){
    exact(pins,[...base,'workspaceOrigin']);origin(pins.workspaceOrigin);
  }else exact(pins,base);
  if(pins.version!==2||pins.profile!==PROFILE)fail();
  id(pins.workspaceId);await publicKeyId(pins.signerPublicKey);
  return pins;
}

function validateManifestShape(manifest){
  exact(manifest,['version','profile','manifestId','workspaceId','accountId','clientId','epoch','client','issuedAt','expiresAt','signature']);
  exact(manifest.client,['keyId','publicKey']);exact(manifest.signature,['algorithm','signerKeyId','value']);
  if(manifest.version!==2||manifest.profile!==PROFILE||manifest.signature.algorithm!=='ES256-P1363')fail();
  for(const name of ['manifestId','workspaceId','accountId','clientId'])id(manifest[name]);
  epoch(manifest.epoch);timestamp(manifest.issuedAt);timestamp(manifest.expiresAt);
  decode64(manifest.client.keyId,32);decode64(manifest.signature.signerKeyId,32);
  if(decode64(manifest.client.publicKey,65)[0]!==4)fail();
}

/** Exact canonical JSON signing string; signature bytes are not part of it. */
export function canonicalClientOnlyManifest(manifest){
  validateManifestShape(manifest);
  return JSON.stringify([2,'gigtax/client-only-manifest',PROFILE,manifest.manifestId,manifest.workspaceId,manifest.accountId,manifest.clientId,manifest.epoch,manifest.client.keyId,manifest.client.publicKey,manifest.issuedAt,manifest.expiresAt]);
}

export async function verifyClientOnlyManifest(manifest,expected,pins,now=Date.now()){
  const canonical=canonicalClientOnlyManifest(manifest);
  await validateClientOnlyPins(pins);
  if(!expected||typeof expected!=='object'||Array.isArray(expected)||!Number.isFinite(now))fail();
  id(expected.accountId);id(expected.clientId);
  const minimum=expected.minimumEpoch??1;epoch(minimum);
  if(manifest.workspaceId!==pins.workspaceId||manifest.accountId!==expected.accountId||manifest.clientId!==expected.clientId||manifest.epoch<minimum)fail();
  for(const name of ['workspaceId','manifestId'])if(expected[name]!==undefined){id(expected[name]);if(expected[name]!==manifest[name])fail();}
  if(expected.profile!==undefined&&expected.profile!==PROFILE)fail();
  if(expected.clientPublicKey!==undefined&&expected.clientPublicKey!==manifest.client.publicKey)fail();
  const clientId=await publicKeyId(manifest.client.publicKey),signerId=await publicKeyId(pins.signerPublicKey);
  if(clientId===signerId||manifest.client.keyId!==clientId||manifest.signature.signerKeyId!==signerId)fail();
  const issued=timestamp(manifest.issuedAt),expires=timestamp(manifest.expiresAt);
  if(issued>now+60000||expires<=now||expires<=issued)fail();
  const signer=await crypto.subtle.importKey('raw',decode64(pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},signer,decode64(manifest.signature.value,64),utf8.encode(canonical)))fail();
  return {profile:PROFILE,manifestId:manifest.manifestId,epoch:manifest.epoch,recipients:{clientPublicKey:manifest.client.publicKey}};
}

/** ECDH proof works with nonextractable private keys and does not export them. */
export async function assertClientOnlyKeyPair(privateKey,publicKey){
  await publicKeyId(publicKey);
  const trustedPublic=await hpke.kem.deserializePublicKey(decode64(publicKey,65));
  const peer=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  let first,second;
  try{
    first=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer.publicKey},privateKey,256));
    second=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:trustedPublic},peer.privateKey,256));
    let difference=0;for(let i=0;i<32;i++)difference|=first[i]^second[i];if(difference)fail();
  }finally{first?.fill(0);second?.fill(0);}
  return trustedPublic;
}

async function recipient(trusted){
  exact(trusted,['clientPublicKey']);
  return {keyId:await publicKeyId(trusted.clientPublicKey),publicKey:trusted.clientPublicKey};
}
const aad=(context,keyId)=>utf8.encode(JSON.stringify([3,'gigtax/client-only-envelope',PROFILE,context.domain,context.workspaceId,context.accountId,context.objectId,context.revision,CONTENT_ALGORITHM,SUITE,'auth',['client',keyId],['client',keyId]]));
const contentAad=(base,slot)=>utf8.encode(JSON.stringify([new TextDecoder().decode(base),[slot.role,slot.keyId,slot.publicKey,slot.encapsulatedKey,slot.wrappedKey]]));
const sameContext=(first,second)=>['workspaceId','accountId','objectId','revision','domain'].every(key=>first[key]===second[key]);

export async function sealClientOnlyEnvelope(plaintext,context,trusted,authorRole,privateKey){
  validateContext(context);
  if(authorRole!=='client'||!(plaintext instanceof Uint8Array)||plaintext.length>MAX_CIPHERTEXT_BYTES-16)fail();
  const client=await recipient(trusted),publicKey=await assertClientOnlyKeyPair(privateKey,client.publicKey),base=aad(context,client.keyId);
  const raw=crypto.getRandomValues(new Uint8Array(32)),transientPlaintext=new Uint8Array(plaintext);
  try{
    const sender=await hpke.createSenderContext({recipientPublicKey:publicKey,senderKey:{privateKey,publicKey},info});
    const slot={role:'client',keyId:client.keyId,publicKey:client.publicKey,encapsulatedKey:encode64(new Uint8Array(sender.enc)),wrappedKey:encode64(new Uint8Array(await sender.seal(raw,base)))};
    const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']),nonce=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:contentAad(base,slot),tagLength:128},key,transientPlaintext));
    return {version:3,profile:PROFILE,suite:SUITE,contentAlgorithm:CONTENT_ALGORITHM,hpkeMode:'auth',author:{role:'client',keyId:client.keyId},context:{...context},nonce:encode64(nonce),ciphertext:encode64(ciphertext),recipients:[slot]};
  }finally{raw.fill(0);transientPlaintext.fill(0);}
}

export async function openClientOnlyEnvelope(envelope,expectedContext,trusted,role,privateKey){
  if(role!=='client')fail();
  validateContext(expectedContext);
  exact(envelope,['version','profile','suite','contentAlgorithm','hpkeMode','author','context','nonce','ciphertext','recipients']);
  exact(envelope.author,['role','keyId']);validateContext(envelope.context);
  if(envelope.version!==3||envelope.profile!==PROFILE||envelope.suite!==SUITE||envelope.contentAlgorithm!==CONTENT_ALGORITHM||envelope.hpkeMode!=='auth'||envelope.author.role!=='client'||!sameContext(envelope.context,expectedContext))fail();
  const client=await recipient(trusted);
  if(envelope.author.keyId!==client.keyId||!Array.isArray(envelope.recipients)||envelope.recipients.length!==1)fail();
  const slot=envelope.recipients[0];exact(slot,['role','keyId','publicKey','encapsulatedKey','wrappedKey']);
  if(slot.role!=='client'||slot.keyId!==client.keyId||slot.publicKey!==client.publicKey)fail();
  const enc=decode64(slot.encapsulatedKey,65);if(enc[0]!==4)fail();await hpke.kem.deserializePublicKey(enc);
  const wrapped=decode64(slot.wrappedKey,48),nonce=decode64(envelope.nonce,12),ciphertext=decode64(envelope.ciphertext,16,MAX_CIPHERTEXT_BYTES);
  const publicKey=await assertClientOnlyKeyPair(privateKey,client.publicKey),base=aad(expectedContext,client.keyId);
  const opener=await hpke.createRecipientContext({recipientKey:{privateKey,publicKey},senderPublicKey:publicKey,enc,info});
  const raw=new Uint8Array(await opener.open(wrapped,base));
  try{
    if(raw.length!==32)fail();
    const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,additionalData:contentAad(base,slot),tagLength:128},key,ciphertext));
  }finally{raw.fill(0);}
}
