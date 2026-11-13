import {strictObject,text,diagnostic} from './model.mjs';
import {normalizedTaxId} from './taxpayer-identifiers.mjs';
import {validDependentDate} from './dependents.mjs';

export const newCTDependentDisclosure=()=>({source:'',reviewed:false});
export function validateCTDependentDisclosure(value){
 strictObject(value,Object.keys(newCTDependentDisclosure()),'Connecticut dependent disclosure');text(value.source,'Connecticut dependent disclosure source',500);if(typeof value.reviewed!=='boolean')throw new Error('Connecticut dependent disclosure review must be explicit.');return value;
}
export function ctDependentDisclosure(input,state,federalResult){
 const value=state.dependentDisclosure,diagnostics=[],records=federalResult.dependents?.records??[],required=federalResult.dependents?.required===true;
 if(value!==undefined)validateCTDependentDisclosure(value);
 const result={required,known:!required,dependents:[],totalDependents:0,forms:[],diagnostics};
 if(!required)return result;
 if(![2023,2024,2025].includes(input.year)){diagnostics.push(diagnostic('CT_DEPENDENT_YEAR_UNAVAILABLE','The selected year has no reviewed Schedule CT-Dependent pack.'));return result;}
 if(state.residency!=='resident'){diagnostics.push(diagnostic('CT_DEPENDENT_RESIDENCY','Schedule CT-Dependent applies to full-year Connecticut residents.'));return result;}
 if(!value?.reviewed||!value.source.trim()){diagnostics.push(diagnostic('CT_DEPENDENT_SCHEDULE_REQUIRED','Review the federal dependent list and its Connecticut relationship disclosures, retaining the supporting source reference, before completing Schedule CT-Dependent.'));return result;}
 if(federalResult.dependents?.known!==true||records.some(row=>row.claim==='unknown'||row.claim==='yes'&&(row.known!==true||row.eligible!==true))){diagnostics.push(diagnostic('CT_DEPENDENT_FEDERAL_UNRESOLVED','Resolve federal dependent claims and retained source conflicts before using them on Schedule CT-Dependent.'));return result;}
 for(const row of records.filter(row=>row.claim==='yes')){
  // The annual form specifically requests an SSN. The general CT-1040 ITIN
  // instruction addresses filers; it does not settle dependent ITIN/ATIN entry.
  if(!row.firstName.trim()||!row.lastName.trim()||!validDependentDate(row.dateOfBirth,input.year)||!/^\d{9}$/.test(normalizedTaxId(row.taxId))||row.identifier?.type!=='ssn'||row.identifier.reviewed!==true||!row.identifier.source.trim()){
   diagnostics.push(diagnostic('CT_DEPENDENT_IDENTIFIER_REVIEW','Schedule CT-Dependent requires the dependent identity, birth date and reviewed SSN. ITIN/ATIN disclosure needs additional Connecticut source guidance.'));continue;
  }
  const relationshipCode={child:1,adoptedChild:1,stepchild:1,nieceNephew:2,grandchild:3,fosterChild:4}[row.relationship]??5;
  result.dependents.push({id:row.id,firstName:row.firstName,lastName:row.lastName,dateOfBirth:row.dateOfBirth,taxId:row.taxId,relationshipCode});
 }
 result.totalDependents=records.filter(row=>row.claim==='yes').length;result.known=diagnostics.length===0;
 if(result.known&&result.totalDependents)result.forms.push({form:'ctdependent',state:'CT',copyId:'CT-Dependent',lines:{},dependents:result.dependents,totalDependents:result.totalDependents});
 return result;
}
