// Separately trusted firm device only; never include in an API or staff bundle.
import {encode64,publicKeyId,verifyEnrollmentManifest,delegateEnvelopeKey} from './envelope.mjs';
import {STAFF_DOMAINS,assertStaffGrantShape,canonicalStaffGrant,canonicalStaffCapsule,canonicalStaffCapsuleKey} from './staff-contract.mjs';
import {verifyStaffGrant,verifyStaffCapsuleSignature,secureEnvelopeDigest} from './staff-grants.mjs';
const utf8=new TextEncoder(),fail=()=>{throw new Error('The selected staff access request, public pins or encrypted object is invalid.');};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
async function sign(value,canonical,unlocked){
  value.signature={algorithm:'ES256-P1363',signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),value:''};
  value.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(canonical(value)))));return value;
}
export async function signStaffGrant(request,unlocked,{epoch,grantId=crypto.randomUUID(),status='active',domains=STAFF_DOMAINS,validDays=30,now=Date.now()}={}){
  exact(request,['version','workspaceId','accountId','clientId','staffAccountId','staff']);exact(request.staff,['keyId','publicKey']);
  if(request.version!==1||request.workspaceId!==unlocked.publicPins.workspaceId||!Number.isInteger(validDays)||validDays<1||validDays>365||!Number.isFinite(now))fail();
  const grant={version:1,type:'shuug-secure-tax-staff-grant',grantId,workspaceId:request.workspaceId,accountId:request.accountId,clientId:request.clientId,staffAccountId:request.staffAccountId,epoch,status,staff:{...request.staff},domains:[...domains],rights:'read',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+validDays*86400000).toISOString(),signature:null};
  await sign(grant,canonicalStaffGrant,unlocked);
  await verifyStaffGrant(grant,{accountId:request.accountId,clientId:request.clientId,staffAccountId:request.staffAccountId,staffKeyId:request.staff.keyId,minimumGrantEpoch:epoch},unlocked.publicPins,now);return grant;
}
export async function createStaffCapsule(envelope,manifest,grant,unlocked,expected,{now=Date.now(),validDays=7}={}){
  if(!Number.isInteger(validDays)||validDays<1||validDays>365||!expected.objectId||!expected.revision||!expected.domain)fail();
  const verified=await verifyStaffGrant(grant,expected,unlocked.publicPins,now);if(verified.status!=='active')fail();
  const enrollment=await verifyEnrollmentManifest(manifest,{accountId:expected.accountId,clientId:expected.clientId,minimumEpoch:expected.minimumManifestEpoch??1},unlocked.publicPins,now);
  if(grant.staff.keyId===manifest.client.keyId||!grant.domains.includes(expected.domain))fail();
  const context={workspaceId:unlocked.publicPins.workspaceId,accountId:expected.accountId,objectId:expected.objectId,revision:expected.revision,domain:expected.domain};
  const expires=Math.min(now+validDays*86400000,Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt));if(expires<=now||now<Math.max(Date.parse(grant.issuedAt),Date.parse(manifest.issuedAt)))fail();
  const capsule={version:1,type:'shuug-secure-tax-staff-capsule',capsuleId:crypto.randomUUID(),grantId:grant.grantId,grantEpoch:grant.epoch,grantDigest:verified.grantDigest,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,context,envelopeDigest:await secureEnvelopeDigest(envelope),staffKeyId:grant.staff.keyId,wrap:null,issuedAt:new Date(now).toISOString(),expiresAt:new Date(expires).toISOString(),signature:null};
  capsule.wrap=await delegateEnvelopeKey(envelope,context,enrollment.recipients,unlocked.recovery,grant.staff.publicKey,utf8.encode(canonicalStaffCapsuleKey(capsule)));
  await sign(capsule,canonicalStaffCapsule,unlocked);await verifyStaffCapsuleSignature(capsule,unlocked.publicPins,now);return capsule;
}
export async function revokeStaffGrant(grant,unlocked,{epoch,now=Date.now(),archiveValidAt}={}){
  assertStaffGrantShape(grant);let validAt=now;
  if(archiveValidAt!==undefined){
    validAt=Date.parse(archiveValidAt);
    if(typeof archiveValidAt!=='string'||!archiveValidAt.endsWith('Z')||!Number.isFinite(validAt)||validAt>now||validAt<Date.parse(grant.issuedAt)||validAt>=Date.parse(grant.expiresAt))fail();
  }
  // Historical validation is only for issuing a new current revocation, never
  // for opening a stale staff capsule or restoring expired API permissions.
  await verifyStaffGrant(grant,{accountId:grant.accountId,clientId:grant.clientId,staffAccountId:grant.staffAccountId,staffKeyId:grant.staff.keyId},unlocked.publicPins,validAt);
  if(!Number.isInteger(epoch)||epoch<=grant.epoch)fail();
  return signStaffGrant({version:1,workspaceId:grant.workspaceId,accountId:grant.accountId,clientId:grant.clientId,staffAccountId:grant.staffAccountId,staff:{...grant.staff}},unlocked,{grantId:grant.grantId,epoch,status:'revoked',domains:grant.domains,now});
}
