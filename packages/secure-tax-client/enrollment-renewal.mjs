import {verifyEnrollmentDocument,verifyEnrollmentManifest} from './envelope.mjs';
const fail=()=>{throw new Error('Renew the exact existing account with the same client and firm encryption keys and a higher signed epoch.');};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();};
export async function verifyRenewalRequest(request,pins,expected={}){
 exact(request,['version','type','manifest']);if(request.version!==1||request.type!=='shuug-enrollment-renewal-request')fail();
 const m=request.manifest;await verifyEnrollmentDocument(m,{accountId:m?.accountId,clientId:m?.clientId,...expected},pins);if(m.epoch>=1e9)fail();return request;
}
export async function verifyEnrollmentRenewal(packet,pins,expected={}){
 exact(packet,['version','type','previous','manifest']);if(packet.version!==1||packet.type!=='shuug-enrollment-renewal')fail();
 const prior=packet.previous,next=packet.manifest;await verifyEnrollmentDocument(prior,{accountId:prior?.accountId,clientId:prior?.clientId,...expected},pins);
 await verifyEnrollmentManifest(next,{accountId:prior.accountId,clientId:prior.clientId,minimumEpoch:prior.epoch+1,...expected},pins);
 if(next.epoch<=prior.epoch||next.workspaceId!==prior.workspaceId||['client','firmRecovery'].some(role=>next[role].keyId!==prior[role].keyId||next[role].publicKey!==prior[role].publicKey))fail();return packet;
}
