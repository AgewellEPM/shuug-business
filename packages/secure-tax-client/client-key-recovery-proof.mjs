// A one-use key-possession challenge, separate from tax envelopes and approvals.
// The host learns a random answer, never the client's agreement private key.
import {Aes256Gcm,CipherSuite,DhkemP256HkdfSha256,HkdfSha256} from '@hpke/core';
import {encode64,decode64,verifyEnrollmentManifest} from './envelope.mjs';
const suite=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()}),utf8=new TextEncoder(),info=utf8.encode('shuug/client-key-recovery-proof/v1');
const fields=['version','type','challengeId','workspaceId','accountId','clientId','manifestId','manifestEpoch','keyId','expiresAt','encapsulatedKey','ciphertext'];
const fail=()=>{throw new Error('The client-key recovery proof does not match the selected signed enrollment.');};
const aad=value=>utf8.encode(JSON.stringify([1,'shuug/client-key-recovery-proof',value.challengeId,value.workspaceId,value.accountId,value.clientId,value.manifestId,value.manifestEpoch,value.keyId,value.expiresAt]));
export async function clientKeyRecoveryAnswerDigest(answer){return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',decode64(answer,32))));}
export async function sealClientKeyRecoveryChallenge(manifest,{challengeId,expiresAt}){
  const challenge={version:1,type:'shuug-client-key-recovery-proof',challengeId,workspaceId:manifest.workspaceId,accountId:manifest.accountId,clientId:manifest.clientId,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,keyId:manifest.client.keyId,expiresAt,encapsulatedKey:'',ciphertext:''};
  const answer=crypto.getRandomValues(new Uint8Array(32));
  try{const sender=await suite.createSenderContext({recipientPublicKey:await suite.kem.deserializePublicKey(decode64(manifest.client.publicKey,65)),info});challenge.encapsulatedKey=encode64(new Uint8Array(sender.enc));challenge.ciphertext=encode64(new Uint8Array(await sender.seal(answer,aad(challenge))));return {challenge,answerDigest:await clientKeyRecoveryAnswerDigest(encode64(answer))};}finally{answer.fill(0);}
}
export async function openClientKeyRecoveryChallenge(challenge,manifest,expected,pins,privateKey,now=Date.now()){
  await verifyEnrollmentManifest(manifest,expected,pins);
  if(!challenge||Object.keys(challenge).sort().join('|')!==[...fields].sort().join('|')||challenge.version!==1||challenge.type!=='shuug-client-key-recovery-proof'||typeof challenge.challengeId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(challenge.challengeId))fail();
  const time=Date.parse(challenge.expiresAt);if(!Number.isFinite(time)||new Date(time).toISOString()!==challenge.expiresAt||time<=now||time>now+6*60000)fail();
  for(const [key,value]of Object.entries({workspaceId:manifest.workspaceId,accountId:manifest.accountId,clientId:manifest.clientId,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,keyId:manifest.client.keyId}))if(challenge[key]!==value)fail();
  const recipient=await suite.createRecipientContext({recipientKey:{privateKey,publicKey:await suite.kem.deserializePublicKey(decode64(manifest.client.publicKey,65))},enc:decode64(challenge.encapsulatedKey,65),info});
  const bytes=new Uint8Array(await recipient.open(decode64(challenge.ciphertext,48),aad(challenge)));
  try{if(bytes.length!==32)fail();return encode64(bytes);}finally{bytes.fill(0);}
}
