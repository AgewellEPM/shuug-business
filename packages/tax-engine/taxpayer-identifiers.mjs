import {strictObject,text,diagnostic} from './model.mjs';
export const newTaxpayerIdentifier=()=>({type:'unknown',issuedByDueDate:'unknown',validForEmployment:'unknown',source:'',reviewed:false});
export const newTaxpayerIdentifiers=()=>({taxpayer:newTaxpayerIdentifier(),spouse:newTaxpayerIdentifier()});
export const normalizedTaxId=value=>String(value??'').replaceAll('-','');
export function validateTaxpayerIdentifier(value,{dependent=false}={}){
 strictObject(value,Object.keys(newTaxpayerIdentifier()),'Taxpayer identifier evidence');if(!['unknown','ssn','itin',...(dependent?['atin']:[])].includes(value.type))throw new Error('Choose the recorded taxpayer identifier type.');for(const key of ['issuedByDueDate','validForEmployment'])if(!['unknown','yes','no'].includes(value[key]))throw new Error('Identifier facts require explicit yes, no or unknown.');text(value.source,'Taxpayer identifier source',500);if(typeof value.reviewed!=='boolean')throw new Error('Identifier review must be explicit.');return value;
}
/** Due-date evidence includes valid extensions and timely ITIN/ATIN applications
 * actually followed by issuance. It is a reviewed source fact, not identity proof. */
export function taxpayerIdentifierStatus(value,owner,{taxId='',dependent=false}={}){
 if(!['taxpayer','spouse','dependent'].includes(owner))throw new Error('Choose an identifier owner.');const record=owner==='dependent'?value:value?.[owner],diagnostics=[];
 if(value!==undefined&&owner!=='dependent')strictObject(value,['taxpayer','spouse'],'Taxpayer identifiers');
 if(record===undefined)return {known:false,timely:null,employmentSsn:null,diagnostics:[diagnostic('TAXPAYER_IDENTIFIER_REQUIRED',`Record the ${owner} identifier type, employment validity and issue/application timing against the actual return due date.`)]};
 validateTaxpayerIdentifier(record,{dependent});const id=normalizedTaxId(taxId),sourceKnown=record.reviewed&&Boolean(record.source.trim())&&/^\d{9}$/.test(id)&&record.type!=='unknown';
 if(!sourceKnown)diagnostics.push(diagnostic('TAXPAYER_IDENTIFIER_SOURCE','Reconcile the actual identifier and its source, type, employment validity and due-date timing.'));
 const timely=sourceKnown&&record.issuedByDueDate!=='unknown'?record.issuedByDueDate==='yes':null,employmentSsn=!sourceKnown||timely===null?null:record.type!=='ssn'||!timely?false:record.validForEmployment==='unknown'?null:record.validForEmployment==='yes';
 if(sourceKnown&&record.issuedByDueDate==='unknown')diagnostics.push(diagnostic('TAXPAYER_IDENTIFIER_TIMING','Verify issuance or eligible application by the return due date, including extensions.'));
 if(sourceKnown&&record.type==='ssn'&&record.validForEmployment==='unknown')diagnostics.push(diagnostic('TAXPAYER_IDENTIFIER_EMPLOYMENT','Verify that the Social Security number is valid for employment; a number alone does not establish this.'));
 return {known:sourceKnown&&timely!==null&&employmentSsn!==null,timely,employmentSsn,diagnostics};
}
