import {decode64,encode64,publicKeyId,verifyEnrollmentManifest,openDelegatedEnvelope} from './envelope.mjs';
import {assertStaffGrantShape,assertStaffCapsuleShape,canonicalStaffGrant,canonicalStaffCapsule,canonicalStaffCapsuleKey,canonicalEnvelope} from './staff-contract.mjs';
const utf8=new TextEncoder();
const fail=()=>{throw new Error('The staff grant, sharing capsule or trusted client context is invalid.');};
export const staffGrantDigest=async grant=>encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(canonicalStaffGrant(grant)))));
export const secureEnvelopeDigest=async envelope=>encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(canonicalEnvelope(envelope)))));
async function pinnedSigner(pins){
  if(!pins||typeof pins.workspaceId!=='string')fail();
  const signerId=await publicKeyId(pins.signerPublicKey),recoveryId=await publicKeyId(pins.firmRecoveryPublicKey);if(signerId===recoveryId)fail();
  return {signerId,recoveryId,key:await crypto.subtle.importKey('raw',decode64(pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify'])};
}
function current(value,now,revocation=false){if(!Number.isFinite(now)||Date.parse(value.issuedAt)>now+60000||(!revocation&&Date.parse(value.expiresAt)<=now))fail();}
async function signed(value,canonical,pins){
  const signer=await pinnedSigner(pins);if(value.signature.signerKeyId!==signer.signerId)fail();
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},signer.key,decode64(value.signature.value,64),utf8.encode(canonical(value))))fail();
  return signer;
}
export async function verifyStaffGrant(grant,expected,pins,now=Date.now()){
  assertStaffGrantShape(grant);current(grant,now,grant.status==='revoked');const signer=await signed(grant,canonicalStaffGrant,pins);
  if(grant.workspaceId!==pins.workspaceId||grant.staffAccountId!==expected.staffAccountId||grant.staff.keyId!==expected.staffKeyId||grant.accountId!==expected.accountId||grant.clientId!==expected.clientId||grant.epoch<(expected.minimumGrantEpoch??1))fail();
  const staffId=await publicKeyId(grant.staff.publicKey);if(grant.staff.keyId!==staffId||[signer.signerId,signer.recoveryId].includes(staffId))fail();
  return {grantId:grant.grantId,epoch:grant.epoch,status:grant.status,grantDigest:await staffGrantDigest(grant),accountId:grant.accountId,clientId:grant.clientId,staffAccountId:grant.staffAccountId,staffKeyId:staffId,rights:grant.rights,domains:[...grant.domains]};
}
export async function verifyStaffCapsuleSignature(capsule,pins,now=Date.now()){
  assertStaffCapsuleShape(capsule);current(capsule,now);if(capsule.context.workspaceId!==pins.workspaceId)fail();
  await signed(capsule,canonicalStaffCapsule,pins);await publicKeyId(capsule.wrap.encapsulatedKey);
  return {capsuleId:capsule.capsuleId,grantId:capsule.grantId,grantEpoch:capsule.grantEpoch,grantDigest:capsule.grantDigest,context:{...capsule.context},envelopeDigest:capsule.envelopeDigest,staffKeyId:capsule.staffKeyId};
}
export async function openStaffCapsule(capsule,envelope,manifest,grant,expected,pins,staffPrivateKey,now=Date.now()){
  const verified=await verifyStaffGrant(grant,expected,pins,now);if(verified.status!=='active')fail();
  await verifyStaffCapsuleSignature(capsule,pins,now);
  const enrollment=await verifyEnrollmentManifest(manifest,{accountId:expected.accountId,clientId:expected.clientId,minimumEpoch:expected.minimumManifestEpoch??1},pins,now);
  if(grant.staff.keyId===manifest.client.keyId||capsule.grantId!==grant.grantId||capsule.grantEpoch!==grant.epoch||capsule.grantDigest!==verified.grantDigest||capsule.staffKeyId!==grant.staff.keyId||capsule.manifestId!==manifest.manifestId||capsule.manifestEpoch!==manifest.epoch)fail();
  if(Date.parse(capsule.expiresAt)>Math.min(Date.parse(grant.expiresAt),Date.parse(manifest.expiresAt))||Date.parse(capsule.issuedAt)<Math.max(Date.parse(grant.issuedAt),Date.parse(manifest.issuedAt)))fail();
  const context=capsule.context;if(context.workspaceId!==pins.workspaceId||context.accountId!==expected.accountId||!grant.domains.includes(context.domain))fail();
  for(const key of ['objectId','revision','domain'])if(expected[key]!==undefined&&context[key]!==expected[key])fail();
  if(await secureEnvelopeDigest(envelope)!==capsule.envelopeDigest)fail();
  return openDelegatedEnvelope(envelope,context,enrollment.recipients,capsule.wrap,grant.staff.publicKey,staffPrivateKey,utf8.encode(canonicalStaffCapsuleKey(capsule)));
}
