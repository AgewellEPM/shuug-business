import {ctDependentTemplates} from './state-ct-family-maps.mjs';
import {ctOverlay,ctBox,ctDigits} from './state-ct-overlay.mjs';

export function ctDependentPdfYearPack(year){const template=ctDependentTemplates[year];return {templates:template?[template]:[],lineMaps:template?{ctdependent:{}}:{},scheduleMaps:{}};}

export async function renderCTDependentForm(input,item,options={}){
 const overlay=await ctOverlay(input,item,ctDependentTemplates[input.year],{...options,width:792,height:612}),{draw,digits,check,continuation,finish}=overlay;
 const rows=item.dependents;
 if(!Array.isArray(rows)||rows.length<1||rows.length>100||item.totalDependents!==rows.length)throw new Error('Connecticut dependent disclosure requires all claimed dependent rows and a matching total.');
 digits(0,[490.5,505.17,519.83,544.22,558.89,583.27,597.94,612.60,627.27],47.02,input.party.taxId,'taxpayerId',{height:16,width:10.76});
 check(ctBox(0,391.35,170.24,13.5,18),true,'1:yes');
 for(const [index,row]of rows.entries()){
  if(!row.firstName?.trim()||!row.lastName?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(row.dateOfBirth)||!/^\d{9}$/.test(ctDigits(row.taxId))||![1,2,3,4,5].includes(row.relationshipCode))throw new Error('Connecticut dependent identity and relationship must be complete.');
  const date=new Date(`${row.dateOfBirth}T00:00:00Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.dateOfBirth)throw new Error('Connecticut dependent birth date is invalid.');
  if(index>=4)continue;
  const top=314.22+index*36,label=`2:${index+1}`,[year,month,day]=row.dateOfBirth.split('-');
  draw(ctBox(0,54.46,top,141.55,22.5),row.firstName,`${label}:firstName`);
  draw(ctBox(0,211.52,top,141.55,22.5),row.lastName,`${label}:lastName`);
  digits(0,[366.38,378.11,397.05,409.22,429.04,439.82,450.63,461.45],top,`${month}${day}${year}`,`${label}:dateOfBirth`,{height:22.5,width:9.47});
  digits(0,[483.09,495.28,507.48,527.76,539.96,560.24,572.43,584.63,596.83],top,row.taxId,`${label}:taxId`,{height:22.5,width:8.95});
  draw(ctBox(0,681.16,316.72+index*36,18,16),row.relationshipCode,`${label}:relationship`,{center:true});
 }
 draw(ctBox(0,198.31,492.44,26.64,18),rows.length,'3:totalDependents',{center:true});
 continuation('Schedule CT-Dependent',rows.slice(4),(row,index,{page,top,draw})=>{
  const n=index+5,[year,month,day]=row.dateOfBirth.split('-');
  draw(ctBox(page,36,top,540,18),`Dependent ${n}: ${row.firstName} ${row.lastName}`,`continuation:${n}:name`);
  draw(ctBox(page,36,top+20,540,18),`Date of birth: ${month}/${day}/${year}    SSN: ${ctDigits(row.taxId)}    Relationship code: ${row.relationshipCode}`,`continuation:${n}:identity`);
 },{rowHeight:60});
 return finish({dependentCount:rows.length});
}

export function ctDependentWorkpaper(input,result,line){
 const state=result.states?.find(row=>row.state==='CT'),disclosure=state?.dependentDisclosure;
 if(!disclosure?.required)return;
 line('Connecticut dependent disclosure',11);line(`Complete: ${disclosure.known}; all identities derive from claimed federal dependent source records.`);
 const source=input.individual.stateReturns.find(row=>row.state==='CT')?.dependentDisclosure;
 if(source)line(`Source: ${source.source||'Missing'}; reviewed: ${source.reviewed}.`);
 for(const row of disclosure.dependents??[])line(`Federal dependent source ${row.id}; relationship code ${row.relationshipCode}; included on original schedule or continuation.`);
}
