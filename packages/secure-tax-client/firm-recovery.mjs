// Offline firm-device library. Never import this into the website/API bundle.
import {decode64,encode64,publicKeyId,openEnvelope,verifyEnrollmentManifest} from './envelope.mjs';
const utf8=new TextEncoder();
const fail=()=>{throw new Error('Firm recovery bundle, passphrase, or enrollment request is invalid.');};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=v=>{if(typeof v!=='string'||v.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==v)fail();};
const iterations=600000;
const header=b=>utf8.encode(JSON.stringify([1,'shuug/offhost-firm-keys',b.workspaceId,b.signerPublicKey,b.firmRecoveryPublicKey,b.kdf,b.iterations,b.salt,b.nonce]));
async function passwordKey(passphrase,salt,usage){
  if(typeof passphrase!=='string'||passphrase.length<20||utf8.encode(passphrase).length>1024)fail();
  const bytes=utf8.encode(passphrase);
  try{
    const material=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);
    return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,[usage]);
  }finally{bytes.fill(0);}
}
function pins(bundle){return {workspaceId:bundle.workspaceId,signerPublicKey:bundle.signerPublicKey,firmRecoveryPublicKey:bundle.firmRecoveryPublicKey};}
async function importPrivate(jwk,algorithm,usages,expectedPublic){
  exact(jwk,['kty','crv','x','y','d']);
  if(jwk.kty!=='EC'||jwk.crv!=='P-256')fail();
  const pub=new Uint8Array(65);pub[0]=4;pub.set(decode64(jwk.x,32),1);pub.set(decode64(jwk.y,32),33);decode64(jwk.d,32);
  if(encode64(pub)!==expectedPublic)fail();
  return crypto.subtle.importKey('jwk',jwk,{name:algorithm,namedCurve:'P-256'},false,usages);
}
export async function createFirmBundle(workspaceId,passphrase){
  id(workspaceId);
  const signing=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const recovery=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const bundle={version:1,workspaceId,signerPublicKey:encode64(new Uint8Array(await crypto.subtle.exportKey('raw',signing.publicKey))),firmRecoveryPublicKey:encode64(new Uint8Array(await crypto.subtle.exportKey('raw',recovery.publicKey))),kdf:'PBKDF2-SHA256',iterations,salt:encode64(crypto.getRandomValues(new Uint8Array(32))),nonce:encode64(crypto.getRandomValues(new Uint8Array(12)))};
  const select=j=>({kty:j.kty,crv:j.crv,x:j.x,y:j.y,d:j.d});
  const secret=utf8.encode(JSON.stringify({signing:select(await crypto.subtle.exportKey('jwk',signing.privateKey)),recovery:select(await crypto.subtle.exportKey('jwk',recovery.privateKey))}));
  try{
    const key=await passwordKey(passphrase,decode64(bundle.salt,32),'encrypt');
    bundle.ciphertext=encode64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:decode64(bundle.nonce,12),additionalData:header(bundle)},key,secret)));
    return {bundle,publicPins:pins(bundle)};
  }finally{secret.fill(0);}
}
export async function unlockFirmBundle(bundle,passphrase,expectedPins){
  exact(bundle,['version','workspaceId','signerPublicKey','firmRecoveryPublicKey','kdf','iterations','salt','nonce','ciphertext']);id(bundle.workspaceId);
  if(bundle.version!==1||bundle.kdf!=='PBKDF2-SHA256'||bundle.iterations!==iterations)fail();
  if(!expectedPins||Object.entries(pins(bundle)).some(([k,v])=>expectedPins[k]!==v))fail();
  const signerId=await publicKeyId(bundle.signerPublicKey),recoveryId=await publicKeyId(bundle.firmRecoveryPublicKey);if(signerId===recoveryId)fail();
  const key=await passwordKey(passphrase,decode64(bundle.salt,32),'decrypt');let secret;
  try{
    secret=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(bundle.nonce,12),additionalData:header(bundle)},key,decode64(bundle.ciphertext,16,8192)));
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(secret));exact(body,['signing','recovery']);
    const signing=await importPrivate(body.signing,'ECDSA',['sign'],bundle.signerPublicKey),recovery=await importPrivate(body.recovery,'ECDH',['deriveBits'],bundle.firmRecoveryPublicKey);
    return {publicPins:pins(bundle),signing,recovery};
  }catch{fail();}finally{secret?.fill(0);}
}
export async function signEnrollmentRequest(request,unlocked,{epoch,validDays=365,now=Date.now()}={}){
  exact(request,['version','workspaceId','accountId','clientId','client']);exact(request.client,['keyId','publicKey']);
  for(const name of ['workspaceId','accountId','clientId'])id(request[name]);
  if(request.version!==1||request.workspaceId!==unlocked.publicPins.workspaceId||!Number.isInteger(epoch)||epoch<1||epoch>1e9||!Number.isInteger(validDays)||validDays<1||validDays>365)fail();
  const signerId=await publicKeyId(unlocked.publicPins.signerPublicKey),firmId=await publicKeyId(unlocked.publicPins.firmRecoveryPublicKey);
  if(request.client.keyId!==await publicKeyId(request.client.publicKey)||[signerId,firmId].includes(request.client.keyId))fail();
  const manifest={version:1,manifestId:crypto.randomUUID(),workspaceId:request.workspaceId,accountId:request.accountId,clientId:request.clientId,epoch,client:{...request.client},firmRecovery:{keyId:firmId,publicKey:unlocked.publicPins.firmRecoveryPublicKey},issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+validDays*86400000).toISOString()};
  const canonical=[1,'shuug/secure-tax-manifest',manifest.manifestId,manifest.workspaceId,manifest.accountId,manifest.clientId,manifest.epoch,manifest.client.keyId,manifest.client.publicKey,manifest.firmRecovery.keyId,manifest.firmRecovery.publicKey,manifest.issuedAt,manifest.expiresAt];
  manifest.signature={algorithm:'ES256-P1363',signerKeyId:signerId,value:encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(JSON.stringify(canonical)))))};
  await verifyEnrollmentManifest(manifest,{accountId:request.accountId,clientId:request.clientId,minimumEpoch:epoch},unlocked.publicPins,now);
  return manifest;
}
export async function recoverFirmObject(envelope,manifest,unlocked,expected){
  let validAt=Date.now();
  if(expected.archiveValidAt!==undefined){
    validAt=Date.parse(expected.archiveValidAt);
    if(typeof expected.archiveValidAt!=='string'||!expected.archiveValidAt.endsWith('Z')||!Number.isFinite(validAt)||validAt>Date.now())fail();
  }
  if(expected.manifestId!==undefined&&manifest.manifestId!==expected.manifestId)fail();
  // Expired enrollment is not permission for new writes. Explicit archive
  // recovery may verify its signature at an independently reviewed past time.
  const verified=await verifyEnrollmentManifest(manifest,expected,unlocked.publicPins,validAt);
  // The expected object/revision/domain must be selected from independent local
  // records or explicitly reviewed evidence, not silently trusted host metadata.
  const context={workspaceId:unlocked.publicPins.workspaceId,accountId:expected.accountId,objectId:expected.objectId,revision:expected.revision,domain:expected.domain};
  return openEnvelope(envelope,context,verified.recipients,'firm-recovery',unlocked.recovery);
}
