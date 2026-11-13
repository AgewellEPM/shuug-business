// Only the separate firm signing environment imports this module.
import {signEnrollmentRequest} from './firm-recovery.mjs';
import {verifyRenewalRequest,verifyEnrollmentRenewal} from './enrollment-renewal.mjs';
export async function renewFirmEnrollment(request,unlocked,{identityAndKeyReviewed=false,validDays=365}={}){
 if(identityAndKeyReviewed!==true)throw new Error('Review the existing account and client-key fingerprint before renewing enrollment.');
 await verifyRenewalRequest(request,unlocked.publicPins);const prior=request.manifest;
 const manifest=await signEnrollmentRequest({version:1,workspaceId:prior.workspaceId,accountId:prior.accountId,clientId:prior.clientId,client:{...prior.client}},unlocked,{epoch:prior.epoch+1,validDays});
 const packet={version:1,type:'shuug-enrollment-renewal',previous:structuredClone(prior),manifest};await verifyEnrollmentRenewal(packet,unlocked.publicPins);return packet;
}
