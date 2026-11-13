import {prepareAuthorizationInput} from '../case-authorization.mjs';
import {caseSnapshot} from '../case-model.mjs';

export function drawAuthorizationAction(document,form,{body,caseId,field,records,getClient}){
  const choices=[['','Choose an opened signed authorization PDF']];
  for(const record of records().values()){
    if(record.domain!=='tax-document'||!record.envelopeDigest)continue;
    try{const value=JSON.parse(new TextDecoder().decode(record.plaintext));if(value?.version===1&&value.type==='private-file'&&value.mime==='application/pdf')choices.push([record.objectId,`${value.filename} · revision ${record.revision}`]);}catch{}
  }
  const file=field('Signed authorization evidence','authorization-file',{options:choices});
  const method=field('Signature method reviewed','authorization-method',{options:[['wet-ink','Signed paper copy'],['external-electronic','External electronic signature evidence']]}),signedOn=field('Date signed','authorization-date',{type:'date'});
  const signers=field('Signers — one Name | Capacity per line','authorization-signers',{type:'textarea',maximum:3300});
  const reviewed=field('I reviewed the actual signed copy, all required signers and its match to this exact return package','authorization-reviewed',{type:'checkbox'}),notes=field('Client-visible authorization review note','authorization-notes',{type:'textarea'});
  const message=document.createElement('p');message.textContent='This records your review of uploaded signature evidence. It does not create a signature, perform identity verification or transmit a return. Tax coverage and filing requirements still apply.';form.append(message);
  return {evidenceId:()=>file.value||null,readInput:async()=>{
    const record=records().get(file.value),client=getClient(),grant=client?.selectedGrant;
    if(!record||!grant)throw new Error('Open the current client assignment and select the signed authorization PDF.');
    if(!caseSnapshot(body,records()).ready)throw new Error('Resolve changed or missing documents, books and draft review before recording authorization evidence.');
    const parsed=signers.value.split('\n').filter(line=>line.trim()).map(line=>{const parts=line.split('|');if(parts.length!==2)throw new Error('Enter each signer as Name | Capacity.');return {name:parts[0].trim(),capacity:parts[1].trim()};});
    return prepareAuthorizationInput(body,{workspaceId:client.config.workspaceId,accountId:grant.accountId,clientId:grant.clientId,objectId:caseId},record,{method:method.value,signedOn:signedOn.value,signers:parsed,signaturesReviewed:reviewed.checked,notes:notes.value});
  }};
}
