// Public opaque case-transition framing. Existing native/read/return wires stay unchanged.
export const CASE_BINDING=Object.freeze(['workspaceId','accountId','clientId','objectId','sourceRevision','sourceEnvelopeDigest','manifestId','manifestEpoch','grantId','grantEpoch','grantDigest','staffAccountId','staffKeyId']);
export const MAX_CASE_PROPOSAL_BYTES=20*1024*1024;
export const CASE_OBJECT_PREFIX='shuug-case:';
export const isCaseObjectId=value=>typeof value==='string'&&value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]===value&&value.startsWith(CASE_OBJECT_PREFIX)&&value.length>CASE_OBJECT_PREFIX.length;
const fail=()=>{throw new Error('The encrypted case transition or firm approval is invalid.');};
export const exactCaseObject=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=value=>{if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();};
function bytes(value,min,max=min){if(typeof value!=='string'||value.length>Math.ceil(max*4/3)||!/^[A-Za-z0-9_-]+$/.test(value))fail();let raw;try{raw=atob(value.replaceAll('-','+').replaceAll('_','/'));}catch{fail();}if(raw.length<min||raw.length>max||btoa(raw).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')!==value)fail();}
function time(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();}
function lifetime(start,end){time(start);time(end);if(Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>86400000)fail();}
export function assertCaseBinding(value){for(const key of CASE_BINDING){if(key==='sourceRevision'){if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>=1000000000)fail();}else if(key==='objectId'){if(!isCaseObjectId(value[key]))fail();}else if(['manifestEpoch','grantEpoch'].includes(key)){if(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>1000000000)fail();}else if(key==='sourceEnvelopeDigest'){if(value.sourceRevision===0){if(value[key]!==null)fail();}else bytes(value[key],32);}else if(['grantDigest','staffKeyId'].includes(key))bytes(value[key],32);else id(value[key]);}return value;}
function proposal(value,complete){
  exactCaseObject(value,['version','type','proposalId',...CASE_BINDING,'reviewCommitment','createdAt','expiresAt','wrap']);
  if(value.version!==1||value.type!=='shuug-secure-tax-case-proposal')fail();id(value.proposalId);assertCaseBinding(value);bytes(value.reviewCommitment,32);lifetime(value.createdAt,value.expiresAt);
  if(complete){exactCaseObject(value.wrap,['suite','mode','encapsulatedKey','ciphertext']);if(value.wrap.suite!=='HPKE-P256-SHA256-A256GCM'||value.wrap.mode!=='auth')fail();bytes(value.wrap.encapsulatedKey,65);bytes(value.wrap.ciphertext,16,MAX_CASE_PROPOSAL_BYTES+16);}return value;
}
export const assertCaseProposal=value=>proposal(value,true);
export function canonicalCaseProposalAad(value){proposal(value,false);return JSON.stringify([1,'shuug/secure-tax-case-proposal',value.proposalId,...CASE_BINDING.map(key=>value[key]),value.reviewCommitment,value.createdAt,value.expiresAt]);}
export function canonicalCaseProposal(value){proposal(value,true);return JSON.stringify([1,'shuug/secure-tax-case-proposal-digest',canonicalCaseProposalAad(value),value.wrap.suite,value.wrap.mode,value.wrap.encapsulatedKey,value.wrap.ciphertext]);}
export function assertCaseApproval(value,unsigned=false){
  exactCaseObject(value,['version','type','approvalId','proposalId',...CASE_BINDING,'proposalDigest','reviewCommitment','newEnvelopeDigest','reviewReference','issuedAt','expiresAt','signature']);
  if(value.version!==1||value.type!=='shuug-secure-tax-case-approval')fail();for(const key of ['approvalId','proposalId','reviewReference'])id(value[key]);assertCaseBinding(value);for(const key of ['proposalDigest','reviewCommitment','newEnvelopeDigest'])bytes(value[key],32);lifetime(value.issuedAt,value.expiresAt);
  exactCaseObject(value.signature,['algorithm','signerKeyId','value']);if(value.signature.algorithm!=='ES256-P1363')fail();bytes(value.signature.signerKeyId,32);if(!(unsigned&&value.signature.value===''))bytes(value.signature.value,64);return value;
}
export function canonicalCaseApproval(value){assertCaseApproval(value,true);return JSON.stringify([1,'shuug/secure-tax-case-approval',value.approvalId,value.proposalId,...CASE_BINDING.map(key=>value[key]),value.proposalDigest,value.reviewCommitment,value.newEnvelopeDigest,value.reviewReference,value.issuedAt,value.expiresAt]);}
// Dedicated bounded canonicalization supports one explicitly selected 10-MiB
// file's base64 text in a private review. No readable part enters public framing.
export function canonicalCaseReview(value,depth=0){
  if(depth>24)fail();if(value===null||typeof value==='boolean')return JSON.stringify(value);if(typeof value==='number'){if(!Number.isSafeInteger(value))fail();return JSON.stringify(value);}
  if(typeof value==='string'){if(value.length>16*1024*1024)fail();return JSON.stringify(value);}if(Array.isArray(value)){if(value.length>5000)fail();return '['+value.map(item=>canonicalCaseReview(item,depth+1)).join(',')+']';}
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){const keys=Object.keys(value).sort();if(keys.length>200)fail();return '{'+keys.map(key=>JSON.stringify(key)+':'+canonicalCaseReview(value[key],depth+1)).join(',')+'}';}fail();
}
