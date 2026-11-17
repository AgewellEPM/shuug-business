import {sealEnvelope,openEnvelope,verifyEnrollmentManifest} from '../envelope.mjs';
import {openActivationChallenge} from '../activation-proof.mjs';
import {assertPrivateInvitation} from '../client-enrollment.mjs';
import {PROFILE,sealClientOnlyEnvelope,openClientOnlyEnvelope,verifyClientOnlyManifest,canonicalClientOnlyManifest} from '../client-only.mjs';
import {openClientOnlyActivationChallenge} from '../client-only-activation-proof.mjs';

const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const unavailable=()=>{throw new Error('This operation would require firm access. Client-only records have no firm recovery or sharing recipient. Restore your original client key from its encrypted backup.');};

export function assertClientOnlyInvitation(value,workspaceId,now=Date.now()){
  if(!exact(value,['version','profile','type','invitationId','workspaceId','accountId','clientId','token','expiresAt'])||value.version!==2||value.profile!==PROFILE||value.type!=='gigtax-client-only-invitation'||value.workspaceId!==workspaceId||![value.invitationId,value.accountId,value.clientId].every(uuid)||!/^[a-f0-9]{64}$/.test(value.token)||!Number.isFinite(Date.parse(value.expiresAt))||new Date(value.expiresAt).toISOString()!==value.expiresAt||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+49*3600000)throw new Error('Use a current client-only invitation for this workspace. Older firm-recovery invitations cannot activate this account.');
  return value;
}

/** Select solely from the independently supplied configuration, never an API
 * response, backup, manifest, or pending retry. Legacy formats stay distinct. */
export function privacyProtocol(config){
  const clientOnly=config.version===2&&config.profile===PROFILE;
  if(!clientOnly&&config.version!==1)throw new Error('Unsupported independently installed privacy profile.');
  return Object.freeze({
    clientOnly,profile:clientOnly?PROFILE:'firm-recovery-v1',
    prefix:clientOnly?'/api/website/customer/client-only':'/api/website/customer/secure',
    verifyManifest:clientOnly?verifyClientOnlyManifest:verifyEnrollmentManifest,
    seal:clientOnly?sealClientOnlyEnvelope:sealEnvelope,
    open:clientOnly?openClientOnlyEnvelope:openEnvelope,
    openActivation:clientOnly?openClientOnlyActivationChallenge:openActivationChallenge,
    invitation:clientOnly?assertClientOnlyInvitation:assertPrivateInvitation,
    bindingId:(workspaceId,accountId)=>`${clientOnly?PROFILE+'|':''}${workspaceId}|${accountId}`,
    fields:()=>clientOnly?{profile:PROFILE}:{},
    sameManifest:(a,b)=>clientOnly?canonicalClientOnlyManifest(a)===canonicalClientOnlyManifest(b)&&a.signature.value===b.signature.value&&a.signature.signerKeyId===b.signature.signerKeyId:JSON.stringify(a)===JSON.stringify(b),
    request(identity,client){return {version:clientOnly?2:1,...(clientOnly?{profile:PROFILE}:{}),workspaceId:config.workspaceId,...identity,client};},
    assertLegacyFeature(){if(clientOnly)unavailable();},
    assertPath(path){
      if(!clientOnly)return;
      const url=new URL(path,'https://private.invalid');
      if(!['/status','/session','/account','/enroll','/enrollment-renewal','/activation','/activation/challenge','/objects'].includes(url.pathname)&&!/^\/objects\/[A-Za-z0-9_.:%-]{1,384}$/.test(url.pathname)&&!/^\/social\/(config|start|result|connections|unlink)$/.test(url.pathname))unavailable();
    },
    assertDispatch(envelope,expectedContext,client){
      if(!clientOnly)return;
      if(!exact(envelope,['version','profile','suite','contentAlgorithm','hpkeMode','author','context','nonce','ciphertext','recipients'])||envelope.version!==3||envelope.profile!==PROFILE||envelope.suite!=='HPKE-P256-SHA256-A256GCM'||envelope.contentAlgorithm!=='AES-256-GCM'||envelope.hpkeMode!=='auth'||!exact(envelope.author,['role','keyId'])||envelope.author.role!=='client'||envelope.author.keyId!==client.keyId||!Array.isArray(envelope.recipients)||envelope.recipients.length!==1)throw new Error('This pending upload is not client-only. Its original copy was kept and will not be sent.');
      const slot=envelope.recipients[0];
      if(!exact(slot,['role','keyId','publicKey','encapsulatedKey','wrappedKey'])||slot.role!=='client'||slot.keyId!==client.keyId||slot.publicKey!==client.publicKey||JSON.stringify(envelope.context)!==JSON.stringify(expectedContext))throw new Error('The pending encrypted upload has different client authority or context. It will not be sent.');
    },
  });
}
