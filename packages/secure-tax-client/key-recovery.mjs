// Public-only recovery contract. No private key or readable customer data belongs here.
import {decode64,publicKeyId,verifyEnrollmentManifest} from './envelope.mjs';
import {canonicalEnvelope} from './staff-contract.mjs';
const fail=()=>{throw new Error('Client-key recovery must cover the exact current account, replacement key and complete encrypted snapshot.');};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const date=v=>{const n=Date.parse(v);if(typeof v!=='string'||!Number.isFinite(n)||new Date(n).toISOString()!==v)fail();return n;};
const manifestValue=m=>[m.version,m.manifestId,m.workspaceId,m.accountId,m.clientId,m.epoch,m.client.keyId,m.client.publicKey,m.firmRecovery.keyId,m.firmRecovery.publicKey,m.issuedAt,m.expiresAt,m.signature.algorithm,m.signature.signerKeyId,m.signature.value];
const domains=['tax-document','tax-identity','driver-record','driver-receipt','driver-state','driver-route','provider-record'];
export function assertClientKeyRecoveryRequest(r,now=Date.now()){
 exact(r,['version','type','requestId','previous','client','sequence','entries','issuedAt','expiresAt']);exact(r.client,['keyId','publicKey']);
 if(r.version!==1||r.type!=='shuug-client-key-recovery-request'||!id(r.requestId)||!integer(r.sequence)||!Array.isArray(r.entries)||r.entries.length>10000)fail();
 decode64(r.client.keyId,32);decode64(r.client.publicKey,65);let last='',bytes=0;
 for(const e of r.entries){exact(e,['objectId','revision','domain','envelopeDigest','ciphertextBytes']);if(!id(e.objectId)||e.objectId<=last||!integer(e.revision,1,1e9)||!domains.includes(e.domain)||!integer(e.ciphertextBytes,16,16*1024*1024))fail();decode64(e.envelopeDigest,32);last=e.objectId;bytes+=e.ciphertextBytes;}
 if(bytes>512*1024*1024||date(r.issuedAt)>now+60000||date(r.expiresAt)<=now||date(r.expiresAt)<=date(r.issuedAt)||date(r.expiresAt)-date(r.issuedAt)>24*3600000)fail();return r;
}
export const canonicalClientKeyRecoveryRequest=r=>JSON.stringify([1,'shuug/client-key-recovery-request',r.requestId,manifestValue(r.previous),r.client.keyId,r.client.publicKey,r.sequence,r.entries.map(e=>[e.objectId,e.revision,e.domain,e.envelopeDigest,e.ciphertextBytes]),r.issuedAt,r.expiresAt]);
export async function verifyClientKeyRecoveryRequest(request,pins,expected={},now=Date.now()){
 const r=assertClientKeyRecoveryRequest(request,now),m=r.previous;await verifyEnrollmentManifest(m,{accountId:m?.accountId,clientId:m?.clientId,...expected},pins,now);
 const replacement=await publicKeyId(r.client.publicKey);if(m.epoch>=1e9||replacement!==r.client.keyId||[m.client.keyId,m.firmRecovery.keyId,m.signature.signerKeyId].includes(replacement)||Date.parse(r.expiresAt)>Date.parse(m.expiresAt))fail();return r;
}
export function canonicalClientKeyRecovery(a){return JSON.stringify([1,'shuug/approved-client-key-recovery',canonicalClientKeyRecoveryRequest(a.request),manifestValue(a.manifest),a.entries.map(e=>[e.objectId,e.envelopeDigest]),a.issuedAt,a.expiresAt,'preserve-exact-plaintext-context-and-revision-require-new-dependency-review']);}
export async function verifyClientKeyRecoveryApproval(approval,pins,expected={},now=Date.now()){
 const a=structuredClone(approval);exact(a,['version','type','request','manifest','entries','issuedAt','expiresAt','signature']);exact(a.signature,['algorithm','signerKeyId','value']);
 const r=await verifyClientKeyRecoveryRequest(a.request,pins,expected,now),m=a.manifest;await verifyEnrollmentManifest(m,{accountId:r.previous.accountId,clientId:r.previous.clientId,minimumEpoch:r.previous.epoch+1},pins,now);
 if(a.version!==1||a.type!=='shuug-approved-client-key-recovery'||m.epoch!==r.previous.epoch+1||m.client.keyId!==r.client.keyId||m.client.publicKey!==r.client.publicKey||m.firmRecovery.keyId!==r.previous.firmRecovery.keyId||m.firmRecovery.publicKey!==r.previous.firmRecovery.publicKey||!Array.isArray(a.entries)||a.entries.length!==r.entries.length)fail();
 for(const [i,e]of a.entries.entries()){exact(e,['objectId','envelopeDigest']);if(e.objectId!==r.entries[i].objectId)fail();decode64(e.envelopeDigest,32);if(e.envelopeDigest===r.entries[i].envelopeDigest)fail();}
 if(date(a.issuedAt)<date(r.issuedAt)||date(a.issuedAt)>now+60000||date(a.expiresAt)<=now||date(a.expiresAt)<=date(a.issuedAt)||date(a.expiresAt)>date(r.expiresAt)||date(a.expiresAt)-date(a.issuedAt)>4*3600000||a.signature.algorithm!=='ES256-P1363'||a.signature.signerKeyId!==await publicKeyId(pins.signerPublicKey))fail();
 const key=await crypto.subtle.importKey('raw',decode64(pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode64(a.signature.value,64),new TextEncoder().encode(canonicalClientKeyRecovery(a))))fail();return a;
}
export async function recoveryEnvelopeDigest(envelope){return (await import('./envelope.mjs')).encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalEnvelope(envelope)))));}
export async function verifyRecoveredEnvelope(envelope,approval,index){
 const before=approval.request.entries[index],after=approval.entries[index],m=approval.manifest,c=envelope?.context;
 if(!before||!after||!c||c.workspaceId!==m.workspaceId||c.accountId!==m.accountId||c.objectId!==before.objectId||c.revision!==before.revision||c.domain!==before.domain||envelope.author?.role!=='firm-recovery'||envelope.author.keyId!==m.firmRecovery.keyId||await recoveryEnvelopeDigest(envelope)!==after.envelopeDigest)fail();return envelope;
}
