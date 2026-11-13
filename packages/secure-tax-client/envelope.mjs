import { Aes256Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';

// Client-only primitives. This module never fetches keys, contacts the API,
// persists private keys or treats keys supplied by the storage host as trusted.
const hpke = new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()});
const utf8 = new TextEncoder();
export const SUITE = 'HPKE-P256-SHA256-A256GCM';
export const CONTENT_ALGORITHM = 'AES-256-GCM';
export const MAX_CIPHERTEXT_BYTES = 16*1024*1024;
export const DOMAINS = Object.freeze(['tax-document','tax-identity','driver-record','driver-receipt','driver-state','driver-route','provider-record']);
const roles = ['client','firm-recovery'];
const info = utf8.encode('shuug/secure-tax-envelope/v2');
const fail = () => {throw new Error('Protected item or trusted context is invalid.');};
const exactKeys = (object,keys) => {
  if (!object || typeof object!=='object' || Array.isArray(object) || Object.keys(object).sort().join('|')!==[...keys].sort().join('|')) fail();
};
export function encode64(bytes) {
  let text='';
  for(let i=0;i<bytes.length;i+=16384) text+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(text).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function decode64(value,min,max=min) {
  if(typeof value!=='string'||value.length>Math.ceil(max*4/3)||!/^[A-Za-z0-9_-]+$/.test(value))fail();
  let decoded;
  try {decoded=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}catch{fail();}
  if(decoded.length<min||decoded.length>max||encode64(decoded)!==value)fail();
  return decoded;
}
const identifier = value => {
  if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();
};
export function validateContext(context) {
  exactKeys(context,['workspaceId','accountId','objectId','revision','domain']);
  for(const key of ['workspaceId','accountId','objectId'])identifier(context[key]);
  if(!Number.isInteger(context.revision)||context.revision<1||context.revision>1e9||!DOMAINS.includes(context.domain))fail();
}
export async function publicKeyId(publicKey) {
  const bytes=decode64(publicKey,65);if(bytes[0]!==4)fail();
  await hpke.kem.deserializePublicKey(bytes);
  return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
}
export async function trustedRecipientIds(trusted) {
  exactKeys(trusted,['clientPublicKey','firmRecoveryPublicKey']);
  const client=await publicKeyId(trusted.clientPublicKey),firm=await publicKeyId(trusted.firmRecoveryPublicKey);
  if(client===firm)fail();return [client,firm];
}
const aad = (context,ids,author) => utf8.encode(JSON.stringify([2,'shuug/secure-tax-envelope',context.domain,context.workspaceId,context.accountId,context.objectId,context.revision,CONTENT_ALGORITHM,SUITE,'auth',[author.role,author.keyId],['client',ids[0]],['firm-recovery',ids[1]]]));
// Bind BOTH recovery slots to the content tag. Otherwise a storage attacker
// could corrupt the unused slot while the currently selected recipient opens.
const contentAad = (base,recipients) => utf8.encode(JSON.stringify([new TextDecoder().decode(base),...recipients.map(r=>[r.role,r.keyId,r.publicKey,r.encapsulatedKey,r.wrappedKey])]));
async function assertAuthorKeyPair(privateKey,publicKey){
  const peer=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const first=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer.publicKey},privateKey,256));
  let second;
  try{
    second=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},peer.privateKey,256));
    let difference=0;for(let i=0;i<32;i++)difference|=first[i]^second[i];if(difference)fail();
  }finally{first.fill(0);second?.fill(0);}
}
export async function sealEnvelope(plaintext,context,trusted,authorRole,authorPrivateKey) {
  validateContext(context);
  if(!(plaintext instanceof Uint8Array)||plaintext.length>MAX_CIPHERTEXT_BYTES-16)fail();
  const ids=await trustedRecipientIds(trusted);if(!roles.includes(authorRole)||!authorPrivateKey)fail();
  const author={role:authorRole,keyId:ids[roles.indexOf(authorRole)]},auth=aad(context,ids,author);
  const authorPublicKey=await hpke.kem.deserializePublicKey(decode64(authorRole==='client'?trusted.clientPublicKey:trusted.firmRecoveryPublicKey,65));
  await assertAuthorKeyPair(authorPrivateKey,authorPublicKey);
  const contentBytes=crypto.getRandomValues(new Uint8Array(32));
  try {
    const recipients=[];
    for(let i=0;i<2;i++){
      const publicKey=i===0?trusted.clientPublicKey:trusted.firmRecoveryPublicKey;
      const sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(publicKey,65)),senderKey:{privateKey:authorPrivateKey,publicKey:authorPublicKey},info});
      // A fresh sender context seals exactly one content key, never a stream.
      recipients.push({role:roles[i],keyId:ids[i],publicKey,encapsulatedKey:encode64(new Uint8Array(sender.enc)),wrappedKey:encode64(new Uint8Array(await sender.seal(contentBytes,auth)))});
    }
    const contentKey=await crypto.subtle.importKey('raw',contentBytes,'AES-GCM',false,['encrypt']);
    const nonce=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:contentAad(auth,recipients),tagLength:128},contentKey,plaintext));
    return {version:2,suite:SUITE,contentAlgorithm:CONTENT_ALGORITHM,hpkeMode:'auth',author,context:{...context},nonce:encode64(nonce),ciphertext:encode64(ciphertext),recipients};
  }finally{contentBytes.fill(0);}
}
async function validatedEnvelope(envelope,expectedContext,trusted) {
  validateContext(expectedContext);
  exactKeys(envelope,['version','suite','contentAlgorithm','hpkeMode','author','context','nonce','ciphertext','recipients']);
  exactKeys(envelope.author,['role','keyId']);
  validateContext(envelope.context);
  if(envelope.version!==2||envelope.hpkeMode!=='auth'||envelope.suite!==SUITE||envelope.contentAlgorithm!==CONTENT_ALGORITHM||!roles.includes(envelope.author.role))fail();
  const ids=await trustedRecipientIds(trusted);if(envelope.author.keyId!==ids[roles.indexOf(envelope.author.role)])fail();
  const auth=aad(expectedContext,ids,envelope.author);
  if(JSON.stringify([...aad(envelope.context,ids,envelope.author)])!==JSON.stringify([...auth]))fail();
  if(!Array.isArray(envelope.recipients)||envelope.recipients.length!==2)fail();
  for(let i=0;i<2;i++){
    const slot=envelope.recipients[i];exactKeys(slot,['role','keyId','publicKey','encapsulatedKey','wrappedKey']);
    if(slot.role!==roles[i]||slot.keyId!==ids[i]||slot.publicKey!==(i===0?trusted.clientPublicKey:trusted.firmRecoveryPublicKey))fail();
    decode64(slot.encapsulatedKey,65);decode64(slot.wrappedKey,48);
  }
  const senderPublicKey=await hpke.kem.deserializePublicKey(decode64(envelope.author.role==='client'?trusted.clientPublicKey:trusted.firmRecoveryPublicKey,65));
  decode64(envelope.nonce,12);decode64(envelope.ciphertext,16,MAX_CIPHERTEXT_BYTES);
  return {auth,senderPublicKey};
}
async function unwrapOriginalKey(envelope,validated,role,privateKey){
  const slot=envelope.recipients[roles.indexOf(role)];
  const publicKey=await hpke.kem.deserializePublicKey(decode64(slot.publicKey,65));
  const {auth,senderPublicKey}=validated;
  const recipient=await hpke.createRecipientContext({recipientKey:{privateKey,publicKey},senderPublicKey,enc:decode64(slot.encapsulatedKey,65),info});
  return new Uint8Array(await recipient.open(decode64(slot.wrappedKey,48),auth));
}
async function openContent(envelope,auth,raw){
  if(raw.length!==32)fail();
  const contentKey=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(envelope.nonce,12),additionalData:contentAad(auth,envelope.recipients),tagLength:128},contentKey,decode64(envelope.ciphertext,16,MAX_CIPHERTEXT_BYTES)));
}
export async function openEnvelope(envelope,expectedContext,trusted,role,privateKey) {
  if(!roles.includes(role))fail();
  const validated=await validatedEnvelope(envelope,expectedContext,trusted);
  const raw=await unwrapOriginalKey(envelope,validated,role,privateKey);
  try {
    return await openContent(envelope,validated.auth,raw);
  }finally{raw.fill(0);}
}
const staffInfo=utf8.encode('shuug/secure-tax-staff-key/v1');
const staffBinding=value=>{if(!(value instanceof Uint8Array)||!value.length||value.length>65536)fail();return value;};
/** Offhost-only use: authenticates the original object before delegating its key.
 * No original recipient or ciphertext changes, and no raw key leaves this call. */
export async function delegateEnvelopeKey(envelope,expectedContext,trusted,recoveryPrivateKey,staffPublicKey,binding){
  staffBinding(binding);await publicKeyId(staffPublicKey);
  const validated=await validatedEnvelope(envelope,expectedContext,trusted),raw=await unwrapOriginalKey(envelope,validated,'firm-recovery',recoveryPrivateKey);
  let checked;
  try{
    checked=await openContent(envelope,validated.auth,raw);
    const publicKey=await hpke.kem.deserializePublicKey(decode64(trusted.firmRecoveryPublicKey,65));
    const sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(staffPublicKey,65)),senderKey:{privateKey:recoveryPrivateKey,publicKey},info:staffInfo});
    return {suite:SUITE,mode:'auth',encapsulatedKey:encode64(new Uint8Array(sender.enc)),wrappedKey:encode64(new Uint8Array(await sender.seal(raw,binding)))};
  }finally{raw.fill(0);checked?.fill(0);}
}
/** The caller MUST first verify the signed capsule and exact envelope digest.
 * A delegated data key by itself is not proof of the original author's identity. */
export async function openDelegatedEnvelope(envelope,expectedContext,trusted,wrap,staffPublicKey,staffPrivateKey,binding){
  staffBinding(binding);await publicKeyId(staffPublicKey);exactKeys(wrap,['suite','mode','encapsulatedKey','wrappedKey']);
  if(wrap.suite!==SUITE||wrap.mode!=='auth')fail();
  const validated=await validatedEnvelope(envelope,expectedContext,trusted);
  const publicKey=await hpke.kem.deserializePublicKey(decode64(staffPublicKey,65)),senderPublicKey=await hpke.kem.deserializePublicKey(decode64(trusted.firmRecoveryPublicKey,65));
  const recipient=await hpke.createRecipientContext({recipientKey:{privateKey:staffPrivateKey,publicKey},senderPublicKey,enc:decode64(wrap.encapsulatedKey,65),info:staffInfo});
  const raw=new Uint8Array(await recipient.open(decode64(wrap.wrappedKey,48),binding));
  try{return await openContent(envelope,validated.auth,raw);}finally{raw.fill(0);}
}
export async function generateRecipientKeyPair(){
  // Private CryptoKey is nonextractable. Persisting/recovery custody is a
  // separate trusted-client workflow and is not implemented by this primitive.
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  return {privateKey:pair.privateKey,publicKey:encode64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)))};
}
export async function verifyEnrollmentManifest(manifest,expected,pins,now=Date.now()) {
  exactKeys(manifest,['version','manifestId','workspaceId','accountId','clientId','epoch','client','firmRecovery','issuedAt','expiresAt','signature']);
  exactKeys(manifest.client,['keyId','publicKey']);exactKeys(manifest.firmRecovery,['keyId','publicKey']);exactKeys(manifest.signature,['algorithm','signerKeyId','value']);
  for(const key of ['manifestId','workspaceId','accountId','clientId'])identifier(manifest[key]);
  if(manifest.version!==1||!Number.isInteger(manifest.epoch)||manifest.epoch<1||manifest.epoch>1e9||manifest.epoch<(expected.minimumEpoch??1))fail();
  if(manifest.workspaceId!==pins.workspaceId||manifest.accountId!==expected.accountId||manifest.clientId!==expected.clientId||manifest.firmRecovery.publicKey!==pins.firmRecoveryPublicKey)fail();
  const ids=await trustedRecipientIds({clientPublicKey:manifest.client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey});
  const signerId=await publicKeyId(pins.signerPublicKey);
  if(signerId===ids[0]||signerId===ids[1]||manifest.client.keyId!==ids[0]||manifest.firmRecovery.keyId!==ids[1]||manifest.signature.signerKeyId!==signerId||manifest.signature.algorithm!=='ES256-P1363')fail();
  const issued=Date.parse(manifest.issuedAt),expires=Date.parse(manifest.expiresAt);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||!manifest.issuedAt.endsWith('Z')||!manifest.expiresAt.endsWith('Z')||issued>now+60000||expires<=now||expires<=issued)fail();
  const canonical=[1,'shuug/secure-tax-manifest',manifest.manifestId,manifest.workspaceId,manifest.accountId,manifest.clientId,manifest.epoch,manifest.client.keyId,manifest.client.publicKey,manifest.firmRecovery.keyId,manifest.firmRecovery.publicKey,manifest.issuedAt,manifest.expiresAt];
  const key=await crypto.subtle.importKey('raw',decode64(pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode64(manifest.signature.value,64),utf8.encode(JSON.stringify(canonical))))fail();
  return {manifestId:manifest.manifestId,epoch:manifest.epoch,recipients:{clientPublicKey:manifest.client.publicKey,firmRecoveryPublicKey:pins.firmRecoveryPublicKey}};
}

/** Historical signature verification for renewal UI only. This grants no access. */
export async function verifyEnrollmentDocument(manifest,expected,pins,now=Date.now()){
  const expires=Date.parse(manifest?.expiresAt),issued=Date.parse(manifest?.issuedAt);
  if(!Number.isFinite(now)||!Number.isFinite(expires)||!Number.isFinite(issued)||issued>now+60000)fail();
  return verifyEnrollmentManifest(manifest,expected,pins,Math.min(now,expires-1));
}
