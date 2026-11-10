// Public framing only. Existing v1 read grants and native v2 envelopes are frozen.
export const RETURN_EDIT_BINDING=Object.freeze(['workspaceId','accountId','clientId','objectId','sourceRevision','sourceEnvelopeDigest','manifestId','manifestEpoch','grantId','grantEpoch','grantDigest','staffAccountId','staffKeyId']);
const fail=()=>{throw new Error('The encrypted return correction or firm approval is invalid.');};
export const exactEditObject=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=value=>{if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();};
const epoch=(value,maximum=1000000000)=>{if(!Number.isSafeInteger(value)||value<1||value>maximum)fail();};
function bytes(value,min,max=min){if(typeof value!=='string'||value.length>Math.ceil(max*4/3)||!/^[A-Za-z0-9_-]+$/.test(value))fail();let raw;try{raw=atob(value.replaceAll('-','+').replaceAll('_','/'));}catch{fail();}if(raw.length<min||raw.length>max||btoa(raw).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')!==value)fail();}
function time(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();}
function lifetime(start,end){time(start);time(end);if(Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>86400000)fail();}
function binding(value){for(const key of RETURN_EDIT_BINDING){if(['sourceRevision','manifestEpoch','grantEpoch'].includes(key))epoch(value[key],key==='sourceRevision'?999999999:1000000000);else if(['sourceEnvelopeDigest','grantDigest','staffKeyId'].includes(key))bytes(value[key],32);else id(value[key]);}}
function proposal(value,complete){
  exactEditObject(value,['version','type','proposalId',...RETURN_EDIT_BINDING,'reviewCommitment','createdAt','expiresAt','wrap']);
  if(value.version!==1||value.type!=='shuug-secure-tax-return-proposal')fail();id(value.proposalId);binding(value);bytes(value.reviewCommitment,32);lifetime(value.createdAt,value.expiresAt);
  if(complete){exactEditObject(value.wrap,['suite','mode','encapsulatedKey','ciphertext']);if(value.wrap.suite!=='HPKE-P256-SHA256-A256GCM'||value.wrap.mode!=='auth')fail();bytes(value.wrap.encapsulatedKey,65);bytes(value.wrap.ciphertext,16,524288+16);}return value;
}
export const assertReturnProposal=value=>proposal(value,true);
export function canonicalReturnProposalAad(value){proposal(value,false);return JSON.stringify([1,'shuug/secure-tax-return-proposal',value.proposalId,...RETURN_EDIT_BINDING.map(key=>value[key]),value.reviewCommitment,value.createdAt,value.expiresAt]);}
export function canonicalReturnProposal(value){proposal(value,true);return JSON.stringify([1,'shuug/secure-tax-return-proposal-digest',canonicalReturnProposalAad(value),value.wrap.suite,value.wrap.mode,value.wrap.encapsulatedKey,value.wrap.ciphertext]);}
export function assertReturnEditApproval(value,unsigned=false){
  exactEditObject(value,['version','type','approvalId','proposalId',...RETURN_EDIT_BINDING,'proposalDigest','reviewCommitment','newEnvelopeDigest','reviewReference','issuedAt','expiresAt','signature']);
  if(value.version!==1||value.type!=='shuug-secure-tax-return-edit-approval')fail();for(const key of ['approvalId','proposalId','reviewReference'])id(value[key]);binding(value);for(const key of ['proposalDigest','reviewCommitment','newEnvelopeDigest'])bytes(value[key],32);lifetime(value.issuedAt,value.expiresAt);
  exactEditObject(value.signature,['algorithm','signerKeyId','value']);if(value.signature.algorithm!=='ES256-P1363')fail();bytes(value.signature.signerKeyId,32);if(!(unsigned&&value.signature.value===''))bytes(value.signature.value,64);return value;
}
export function canonicalReturnEditApproval(value){assertReturnEditApproval(value,true);return JSON.stringify([1,'shuug/secure-tax-return-edit-approval',value.approvalId,value.proposalId,...RETURN_EDIT_BINDING.map(key=>value[key]),value.proposalDigest,value.reviewCommitment,value.newEnvelopeDigest,value.reviewReference,value.issuedAt,value.expiresAt]);}
// Canonical JSON is used only for a salted private review commitment, never a
// public unsalted hash of taxpayer values. The salt remains inside encryption
// and the explicitly downloaded private review file.
export function canonicalPrivateReview(value,depth=0){
  if(depth>24)fail();if(value===null||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isSafeInteger(value))fail();return JSON.stringify(value);}
  if(typeof value==='string'){if(value.length>10000)fail();return JSON.stringify(value);}
  if(Array.isArray(value)){if(value.length>5000)fail();return '['+value.map(item=>canonicalPrivateReview(item,depth+1)).join(',')+']';}
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){const keys=Object.keys(value).sort();if(keys.length>100)fail();return '{'+keys.map(key=>JSON.stringify(key)+':'+canonicalPrivateReview(value[key],depth+1)).join(',')+'}';}fail();
}
