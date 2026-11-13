// Separate firm signing environment only; never include in the browser/API.
import {encode64,publicKeyId,verifyEnrollmentManifest} from './envelope.mjs';
import {assertAuthenticatorRecoveryRequest,recoveryRequestMatchesManifest,canonicalAuthenticatorRecovery,verifyAuthenticatorRecovery} from './authenticator-recovery.mjs';
export async function approveAuthenticatorRecovery(request,manifest,unlocked,{identityAndKeyReviewed=false,now=Date.now()}={}){
  if(identityAndKeyReviewed!==true)throw new Error('Review the account identity, request and existing client-key fingerprint before approving authenticator replacement.');
  assertAuthenticatorRecoveryRequest(request,now);await verifyEnrollmentManifest(manifest,{accountId:request.accountId,clientId:request.clientId,minimumEpoch:request.manifestEpoch},unlocked.publicPins,now);recoveryRequestMatchesManifest(request,manifest);
  const approval={version:1,type:'shuug-approved-authenticator-recovery',request:structuredClone(request),approvedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+4*3600000,Date.parse(request.expiresAt),Date.parse(manifest.expiresAt))).toISOString()};
  approval.signature={algorithm:'ES256-P1363',signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),value:encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,new TextEncoder().encode(canonicalAuthenticatorRecovery(approval)))))};
  await verifyAuthenticatorRecovery(approval,unlocked.publicPins,request,now);return approval;
}
