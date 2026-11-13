import {strictObject,list,text} from './model.mjs';
export const nyEmpireChildReviews=Object.freeze([
 ['filing','Full-year New York residency and matching federal/state filing status reconciled'],
 ['children','All possible Empire State qualifying children reviewed, including retained unclaimed children'],
 ['identityTiming','Original filer/child SSN or ITIN and applicable annual timing rules reviewed'],
 ['competingClaims','Custody, competing claims and the correct New York claimant reviewed'],
 ['federalCreditSources','Actual federal tax, child credits, income, payroll and other-credit worksheets reconciled'],
 ['foreignBondSources','Build America Bond interest and specified MAGI exclusions reviewed against original sources'],
].map(Object.freeze));
export const newNYEmpireChild=dependentId=>({dependentId:dependentId??'',claim:'unknown',competingClaim:'unknown',source:'',reviewed:false});
export const newNYEmpireChildCredit=()=>({filingStatus:'unknown',children:[],buildAmericaBondInterest:'unknown',magiExclusions:'unknown',otherCreditTreatments:'unknown',source:'',review:Object.fromEntries(nyEmpireChildReviews.map(([key])=>[key,false]))});
const choice=(value,allowed,label)=>{if(!allowed.includes(value))throw new Error(`${label} requires a supported source decision.`);};
export function validateNYEmpireChildCredit(value){
 strictObject(value,Object.keys(newNYEmpireChildCredit()),'New York Empire State child credit');choice(value.filingStatus,['unknown','sameAsFederal','different'],'Empire filing status');for(const key of ['buildAmericaBondInterest','magiExclusions','otherCreditTreatments'])choice(value[key],['unknown','none','other'],'Empire '+key);text(value.source,'Empire State child-credit source',1000);
 strictObject(value.review,nyEmpireChildReviews.map(([key])=>key),'Empire State child-credit reviews');for(const item of Object.values(value.review))if(typeof item!=='boolean')throw new Error('Empire State child-credit reviews must be explicit.');
 const ids=new Set();for(const row of list(value.children,'Empire State child sources',100)){strictObject(row,Object.keys(newNYEmpireChild()),'Empire State child source');text(row.dependentId,'Empire linked dependent ID',100);if(!row.dependentId||ids.has(row.dependentId))throw new Error('Each Empire child source must link one distinct retained person.');ids.add(row.dependentId);choice(row.claim,['unknown','yes','no'],'Empire child claim');choice(row.competingClaim,['unknown','none','otherPerson','tieBreaker'],'Empire competing claim');text(row.source,'Empire child source',1000);if(typeof row.reviewed!=='boolean')throw new Error('Empire child source review must be explicit.');}return value;
}
