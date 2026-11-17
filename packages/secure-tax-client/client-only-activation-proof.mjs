// HPKE Base proves possession of the client key without disclosing it to a host.
// These challenge bytes cannot be used as an envelope or legacy recovery proof.
import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {decode64,encode64,publicKeyId} from './envelope.mjs';
import {PROFILE,assertClientOnlyKeyPair,canonicalClientOnlyManifest,verifyClientOnlyManifest} from './client-only.mjs';
const hpke=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()});
const utf8=new TextEncoder(),info=utf8.encode('gigtax/client-only-activation-proof/v2');
const fields=['version','profile','type','challengeId','workspaceId','accountId','clientId','manifestId','manifestEpoch','keyId','expiresAt','encapsulatedKey','ciphertext'];
const fail=()=>{throw new Error('The client-only activation proof does not match the independently trusted signed enrollment.');};
const aad=value=>utf8.encode(JSON.stringify([2,'gigtax/client-only-activation-proof',PROFILE,value.challengeId,value.workspaceId,value.accountId,value.clientId,value.manifestId,value.manifestEpoch,value.keyId,value.expiresAt]));
function challengeMetadata(value,now){
  if(typeof value.challengeId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.challengeId)||!Number.isFinite(now)||typeof value.expiresAt!=='string')fail();
  const expires=Date.parse(value.expiresAt);
  if(!Number.isFinite(expires)||new Date(expires).toISOString()!==value.expiresAt||expires<=now||expires>now+6*60000)fail();
}
export async function clientOnlyActivationAnswerDigest(answer){
  const bytes=decode64(answer,32);
  try{return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}finally{bytes.fill(0);}
}
export async function sealClientOnlyActivationChallenge(manifest,{challengeId,expiresAt}){
  canonicalClientOnlyManifest(manifest);decode64(manifest.signature.value,64);
  if(manifest.client.keyId!==await publicKeyId(manifest.client.publicKey)||manifest.client.keyId===manifest.signature.signerKeyId)fail();
  const challenge={version:2,profile:PROFILE,type:'gigtax-client-only-activation-proof',challengeId,workspaceId:manifest.workspaceId,accountId:manifest.accountId,clientId:manifest.clientId,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,keyId:manifest.client.keyId,expiresAt,encapsulatedKey:'',ciphertext:''};
  challengeMetadata(challenge,Date.now());
  const answer=crypto.getRandomValues(new Uint8Array(32));
  try{
    const sender=await hpke.createSenderContext({recipientPublicKey:await hpke.kem.deserializePublicKey(decode64(manifest.client.publicKey,65)),info});
    challenge.encapsulatedKey=encode64(new Uint8Array(sender.enc));challenge.ciphertext=encode64(new Uint8Array(await sender.seal(answer,aad(challenge))));
    return {challenge,answerDigest:encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',answer)))};
  }finally{answer.fill(0);}
}
export async function openClientOnlyActivationChallenge(challenge,manifest,expected,pins,privateKey,now=Date.now()){
  await verifyClientOnlyManifest(manifest,expected,pins,now);
  if(!challenge||typeof challenge!=='object'||Array.isArray(challenge)||Object.keys(challenge).sort().join('|')!==[...fields].sort().join('|')||challenge.version!==2||challenge.profile!==PROFILE||challenge.type!=='gigtax-client-only-activation-proof')fail();
  challengeMetadata(challenge,now);
  for(const [key,value]of Object.entries({workspaceId:manifest.workspaceId,accountId:manifest.accountId,clientId:manifest.clientId,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,keyId:manifest.client.keyId}))if(challenge[key]!==value)fail();
  const publicKey=await assertClientOnlyKeyPair(privateKey,manifest.client.publicKey),enc=decode64(challenge.encapsulatedKey,65);
  if(enc[0]!==4)fail();await hpke.kem.deserializePublicKey(enc);
  const opener=await hpke.createRecipientContext({recipientKey:{privateKey,publicKey},enc,info});
  const answer=new Uint8Array(await opener.open(decode64(challenge.ciphertext,48),aad(challenge)));
  try{if(answer.length!==32)fail();return encode64(answer);}finally{answer.fill(0);}
}
