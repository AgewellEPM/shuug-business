import {decode64,publicKeyId} from './envelope.mjs';
const fail=()=>{throw new Error('Use a current firm-approved authenticator recovery for this exact private account and client key.');};
const exact=(value,fields)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...fields].sort().join('|'))fail();};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const date=value=>{const time=Date.parse(value);if(typeof value!=='string'||!Number.isFinite(time)||new Date(time).toISOString()!==value)fail();return time;};
export function assertAuthenticatorRecoveryRequest(value,now=Date.now()){
  exact(value,['version','type','requestId','workspaceId','accountId','clientId','manifestId','manifestEpoch','clientKeyId','factorRevision','issuedAt','expiresAt']);
  if(value.version!==1||value.type!=='shuug-authenticator-recovery-request'||![value.requestId,value.accountId,value.clientId].every(uuid)||!id(value.workspaceId)||!id(value.manifestId)||!Number.isInteger(value.manifestEpoch)||value.manifestEpoch<1||value.manifestEpoch>1e9)fail();decode64(value.clientKeyId,32);if(!Number.isSafeInteger(value.factorRevision)||value.factorRevision<1||value.factorRevision>=1e9)fail();
  const issued=date(value.issuedAt),expires=date(value.expiresAt);if(issued>now+60000||expires<=now||expires<=issued||expires-issued>24*3600000)fail();return value;
}
export function recoveryRequestMatchesManifest(request,manifest){
  for(const key of ['workspaceId','accountId','clientId','manifestId'])if(request[key]!==manifest[key])fail();if(request.manifestEpoch!==manifest.epoch||request.clientKeyId!==manifest.client.keyId)fail();return true;
}
export function canonicalAuthenticatorRecovery(approval){const r=approval.request;return JSON.stringify([1,'shuug/approved-authenticator-recovery',r.requestId,r.workspaceId,r.accountId,r.clientId,r.manifestId,r.manifestEpoch,r.clientKeyId,r.factorRevision,r.issuedAt,r.expiresAt,approval.approvedAt,approval.expiresAt,'replace-authenticator-preserve-password-and-encryption-keys']);}
export async function verifyAuthenticatorRecovery(approval,pins,expectedRequest,now=Date.now()){
  exact(approval,['version','type','request','approvedAt','expiresAt','signature']);const r=assertAuthenticatorRecoveryRequest(approval.request,now);exact(approval.signature,['algorithm','signerKeyId','value']);
  if(approval.version!==1||approval.type!=='shuug-approved-authenticator-recovery'||r.workspaceId!==pins.workspaceId||approval.signature.algorithm!=='ES256-P1363'||approval.signature.signerKeyId!==await publicKeyId(pins.signerPublicKey))fail();
  const issued=date(approval.approvedAt),expires=date(approval.expiresAt);if(issued<Date.parse(r.issuedAt)||issued>now+60000||expires<=now||expires<=issued||expires-issued>4*3600000||expires>Date.parse(r.expiresAt))fail();
  if(expectedRequest){assertAuthenticatorRecoveryRequest(expectedRequest,now);for(const key of Object.keys(r))if(r[key]!==expectedRequest[key])fail();}
  const key=await crypto.subtle.importKey('raw',decode64(pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode64(approval.signature.value,64),new TextEncoder().encode(canonicalAuthenticatorRecovery(approval))))fail();return approval;
}
export function assertAuthenticatorRecoveryInvitation(value,workspaceId,now=Date.now()){
  exact(value,['version','type','request','token','manifest']);assertAuthenticatorRecoveryRequest(value.request,now);
  if(value.version!==1||value.type!=='shuug-private-authenticator-recovery'||value.request.workspaceId!==workspaceId||typeof value.token!=='string'||!/^[a-f0-9]{64}$/.test(value.token))fail();recoveryRequestMatchesManifest(value.request,value.manifest);return value;
}
