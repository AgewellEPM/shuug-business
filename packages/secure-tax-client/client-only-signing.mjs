// Offline public-binding signer. It deliberately never reads an unlocked
// recovery key or recovery public pin, even when a legacy custody bundle has one.
import {decode64,encode64,publicKeyId} from './envelope.mjs';
import {PROFILE,canonicalClientOnlyManifest,verifyClientOnlyManifest} from './client-only.mjs';
const utf8=new TextEncoder(),maximumValidity=365*86400000;
const fail=()=>{throw new Error('Client-only enrollment requires an independently approved public binding and signing key.');};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=value=>{if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();};

export async function signClientOnlyEnrollment(unlocked,request,{epoch=1,now=Date.now(),validForMs=maximumValidity}={}){
  exact(request,['version','profile','workspaceId','accountId','clientId','client']);exact(request.client,['keyId','publicKey']);
  for(const name of ['workspaceId','accountId','clientId'])id(request[name]);
  if(request.version!==2||request.profile!==PROFILE||request.workspaceId!==unlocked?.publicPins?.workspaceId||!Number.isInteger(epoch)||epoch<1||epoch>1e9||!Number.isSafeInteger(now)||!Number.isSafeInteger(validForMs)||validForMs<1||validForMs>maximumValidity)fail();
  const pins={version:2,profile:PROFILE,workspaceId:unlocked.publicPins.workspaceId,signerPublicKey:unlocked.publicPins.signerPublicKey};
  const signerId=await publicKeyId(pins.signerPublicKey),clientId=await publicKeyId(request.client.publicKey);
  decode64(request.client.keyId,32);
  if(request.client.keyId!==clientId||clientId===signerId)fail();
  let issuedAt,expiresAt;try{issuedAt=new Date(now).toISOString();expiresAt=new Date(now+validForMs).toISOString();}catch{fail();}
  const manifest={version:2,profile:PROFILE,manifestId:crypto.randomUUID(),workspaceId:request.workspaceId,accountId:request.accountId,clientId:request.clientId,epoch,client:{...request.client},issuedAt,expiresAt,signature:{algorithm:'ES256-P1363',signerKeyId:signerId,value:''}};
  manifest.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(canonicalClientOnlyManifest(manifest)))));
  await verifyClientOnlyManifest(manifest,{accountId:request.accountId,clientId:request.clientId,minimumEpoch:epoch,clientPublicKey:request.client.publicKey},pins,now);
  return manifest;
}
