// Independent creation framing. Native v2, staff read v1 and corrections stay frozen.
export const RETURN_CREATE_BINDING=Object.freeze(['workspaceId','accountId','clientId','objectId','manifestId','manifestEpoch','grantId','grantEpoch','grantDigest','staffAccountId','staffKeyId']);
const fail=()=>{throw new Error('The encrypted return creation or firm approval is invalid.');};
export const exactCreateObject=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();};
const id=value=>{if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();};
const epoch=value=>{if(!Number.isSafeInteger(value)||value<1||value>1000000000)fail();};
function bytes(value,min,max=min){if(typeof value!=='string'||value.length>Math.ceil(max*4/3)||!/^[A-Za-z0-9_-]+$/.test(value))fail();let raw;try{raw=atob(value.replaceAll('-','+').replaceAll('_','/'));}catch{fail();}if(raw.length<min||raw.length>max||btoa(raw).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')!==value)fail();}
function time(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();}
function lifetime(start,end){time(start);time(end);if(Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>86400000)fail();}
function binding(value){for(const key of RETURN_CREATE_BINDING){if(['manifestEpoch','grantEpoch'].includes(key))epoch(value[key]);else if(['grantDigest','staffKeyId'].includes(key))bytes(value[key],32);else id(value[key]);}}
function proposal(value,complete){
  exactCreateObject(value,['version','type','proposalId',...RETURN_CREATE_BINDING,'reviewCommitment','createdAt','expiresAt','wrap']);
  if(value.version!==1||value.type!=='shuug-secure-tax-return-create-proposal')fail();id(value.proposalId);binding(value);bytes(value.reviewCommitment,32);lifetime(value.createdAt,value.expiresAt);
  if(complete){exactCreateObject(value.wrap,['suite','mode','encapsulatedKey','ciphertext']);if(value.wrap.suite!=='HPKE-P256-SHA256-A256GCM'||value.wrap.mode!=='auth')fail();bytes(value.wrap.encapsulatedKey,65);bytes(value.wrap.ciphertext,16,524288+16);}return value;
}
export const assertReturnCreationProposal=value=>proposal(value,true);
export function canonicalReturnCreationProposalAad(value){proposal(value,false);return JSON.stringify([1,'shuug/secure-tax-return-create-proposal',value.proposalId,...RETURN_CREATE_BINDING.map(key=>value[key]),value.reviewCommitment,value.createdAt,value.expiresAt]);}
export function canonicalReturnCreationProposal(value){proposal(value,true);return JSON.stringify([1,'shuug/secure-tax-return-create-proposal-digest',canonicalReturnCreationProposalAad(value),value.wrap.suite,value.wrap.mode,value.wrap.encapsulatedKey,value.wrap.ciphertext]);}
export function assertReturnCreationApproval(value,unsigned=false){
  exactCreateObject(value,['version','type','approvalId','proposalId',...RETURN_CREATE_BINDING,'proposalDigest','reviewCommitment','newEnvelopeDigest','reviewReference','issuedAt','expiresAt','signature']);
  if(value.version!==1||value.type!=='shuug-secure-tax-return-create-approval')fail();for(const key of ['approvalId','proposalId','reviewReference'])id(value[key]);binding(value);for(const key of ['proposalDigest','reviewCommitment','newEnvelopeDigest'])bytes(value[key],32);lifetime(value.issuedAt,value.expiresAt);
  exactCreateObject(value.signature,['algorithm','signerKeyId','value']);if(value.signature.algorithm!=='ES256-P1363')fail();bytes(value.signature.signerKeyId,32);if(!(unsigned&&value.signature.value===''))bytes(value.signature.value,64);return value;
}
export function canonicalReturnCreationApproval(value){assertReturnCreationApproval(value,true);return JSON.stringify([1,'shuug/secure-tax-return-create-approval',value.approvalId,value.proposalId,...RETURN_CREATE_BINDING.map(key=>value[key]),value.proposalDigest,value.reviewCommitment,value.newEnvelopeDigest,value.reviewReference,value.issuedAt,value.expiresAt]);}
