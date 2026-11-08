// Pure strict framing shared by the independent client and ciphertext API.
export const STAFF_DOMAINS=Object.freeze(['tax-document','tax-identity','driver-record','driver-receipt','driver-state','driver-route','provider-record']);
const roles=['client','firm-recovery'];
const fail=()=>{throw new Error('The signed staff grant or encrypted sharing capsule is invalid.');};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=v=>{if(typeof v!=='string'||v.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==v)fail();};
const epoch=v=>{if(!Number.isSafeInteger(v)||v<1||v>1e9)fail();};
function bytes(value,min,max=min){
  if(typeof value!=='string'||value.length>Math.ceil(max*4/3)||!/^[A-Za-z0-9_-]+$/.test(value))fail();
  let raw;try{raw=atob(value.replaceAll('-','+').replaceAll('_','/'));}catch{fail();}
  if(raw.length<min||raw.length>max||btoa(raw).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')!==value)fail();
}
function time(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))fail();const normalized=new Date(value).toISOString();if(normalized!==value&&normalized.replace('.000Z','Z')!==value)fail();}
function signature(value,unsigned){exact(value,['algorithm','signerKeyId','value']);if(value.algorithm!=='ES256-P1363')fail();bytes(value.signerKeyId,32);if(!(unsigned&&value.value===''))bytes(value.value,64);}
function recipient(value){exact(value,['keyId','publicKey']);bytes(value.keyId,32);bytes(value.publicKey,65);}
function context(value){exact(value,['workspaceId','accountId','objectId','revision','domain']);for(const key of ['workspaceId','accountId','objectId'])id(value[key]);epoch(value.revision);if(!STAFF_DOMAINS.includes(value.domain))fail();}
function grantShape(g,unsigned=false){
  exact(g,['version','type','grantId','workspaceId','accountId','clientId','staffAccountId','epoch','status','staff','domains','rights','issuedAt','expiresAt','signature']);
  if(g.version!==1||g.type!=='shuug-secure-tax-staff-grant'||!['active','revoked'].includes(g.status)||g.rights!=='read')fail();
  for(const key of ['grantId','workspaceId','accountId','clientId','staffAccountId'])id(g[key]);epoch(g.epoch);recipient(g.staff);
  if(!Array.isArray(g.domains)||!g.domains.length||g.domains.length>STAFF_DOMAINS.length||JSON.stringify(STAFF_DOMAINS.filter(domain=>g.domains.includes(domain)))!==JSON.stringify(g.domains))fail();
  time(g.issuedAt);time(g.expiresAt);if(Date.parse(g.expiresAt)<=Date.parse(g.issuedAt))fail();signature(g.signature,unsigned);return g;
}
export const assertStaffGrantShape=g=>grantShape(g);
export function canonicalStaffGrant(g){grantShape(g,true);return JSON.stringify([1,'shuug/secure-tax-staff-grant',g.grantId,g.workspaceId,g.accountId,g.clientId,g.staffAccountId,g.epoch,g.status,g.staff.keyId,g.staff.publicKey,g.domains,'read',g.issuedAt,g.expiresAt]);}
function capsuleShape(c,unsigned=false){
  exact(c,['version','type','capsuleId','grantId','grantEpoch','grantDigest','manifestId','manifestEpoch','context','envelopeDigest','staffKeyId','wrap','issuedAt','expiresAt','signature']);
  if(c.version!==1||c.type!=='shuug-secure-tax-staff-capsule')fail();for(const key of ['capsuleId','grantId','manifestId'])id(c[key]);epoch(c.grantEpoch);epoch(c.manifestEpoch);context(c.context);
  for(const key of ['grantDigest','envelopeDigest','staffKeyId'])bytes(c[key],32);
  exact(c.wrap,['suite','mode','encapsulatedKey','wrappedKey']);if(c.wrap.suite!=='HPKE-P256-SHA256-A256GCM'||c.wrap.mode!=='auth')fail();bytes(c.wrap.encapsulatedKey,65);bytes(c.wrap.wrappedKey,48);
  time(c.issuedAt);time(c.expiresAt);if(Date.parse(c.expiresAt)<=Date.parse(c.issuedAt))fail();signature(c.signature,unsigned);return c;
}
export const assertStaffCapsuleShape=c=>capsuleShape(c);
export function canonicalStaffCapsuleKey(c){
  // While wrapping, only the final signature is absent; the key context contains
  // no ciphertext bytes and is fixed before the fresh HPKE context is created.
  for(const key of ['capsuleId','grantId','manifestId'])id(c[key]);epoch(c.grantEpoch);epoch(c.manifestEpoch);context(c.context);
  for(const key of ['grantDigest','envelopeDigest','staffKeyId'])bytes(c[key],32);time(c.issuedAt);time(c.expiresAt);
  return JSON.stringify([1,'shuug/secure-tax-staff-key',c.capsuleId,c.grantId,c.grantEpoch,c.grantDigest,c.manifestId,c.manifestEpoch,c.context.workspaceId,c.context.accountId,c.context.objectId,c.context.revision,c.context.domain,c.envelopeDigest,c.staffKeyId,c.issuedAt,c.expiresAt]);
}
export function canonicalStaffCapsule(c){capsuleShape(c,true);return JSON.stringify([1,'shuug/secure-tax-staff-capsule',canonicalStaffCapsuleKey(c),c.wrap.suite,c.wrap.mode,c.wrap.encapsulatedKey,c.wrap.wrappedKey]);}
export function canonicalEnvelope(e){
  exact(e,['version','suite','contentAlgorithm','hpkeMode','author','context','nonce','ciphertext','recipients']);
  if(e.version!==2||e.suite!=='HPKE-P256-SHA256-A256GCM'||e.contentAlgorithm!=='AES-256-GCM'||e.hpkeMode!=='auth')fail();
  exact(e.author,['role','keyId']);if(!roles.includes(e.author.role))fail();bytes(e.author.keyId,32);context(e.context);bytes(e.nonce,12);bytes(e.ciphertext,16,16*1024*1024);
  if(!Array.isArray(e.recipients)||e.recipients.length!==2)fail();
  for(let i=0;i<2;i++){const r=e.recipients[i];exact(r,['role','keyId','publicKey','encapsulatedKey','wrappedKey']);if(r.role!==roles[i])fail();bytes(r.keyId,32);bytes(r.publicKey,65);bytes(r.encapsulatedKey,65);bytes(r.wrappedKey,48);}
  const c=e.context;return JSON.stringify([2,'shuug/secure-tax-envelope-digest',e.suite,e.contentAlgorithm,e.hpkeMode,e.author.role,e.author.keyId,c.workspaceId,c.accountId,c.objectId,c.revision,c.domain,e.nonce,e.ciphertext,e.recipients.map(r=>[r.role,r.keyId,r.publicKey,r.encapsulatedKey,r.wrappedKey])]);
}
