import {strictObject,list,text} from './model.mjs';
import {checkedMoney} from './money.mjs';

export const ctEitcReviews=Object.freeze([
 ['residency','Full-year Connecticut residency and matching federal/state filing status verified'],
 ['federalCredit','Same-year federal EIC, original eligibility sources and saved combat election reconciled'],
 ['children','All federal Schedule EIC children and required state identifying information reconciled'],
 ['incomeSources','Every original wage/business source, state identifier and withholding disclosure reconciled'],
].map(Object.freeze));
export const newCTEarnedIncomeCredit=()=>({returnStatus:'unknown',filingStatus:'unknown',source:'',review:Object.fromEntries(ctEitcReviews.map(([key])=>[key,false])),wageSources:[],businessSources:[]});
export const newCTEitcWage=(w2Id='')=>({w2Id,employerFederalId:'',employerStateId:'',stateIdStatus:'unknown',ctWithholdingCents:0,source:'',reviewed:false});
export const newCTEitcBusiness=(businessId='')=>({businessId,ctTaxRegistrationNumber:'',stateIdStatus:'unknown',source:'',reviewed:false});
const choice=(value,allowed,label)=>{if(!allowed.includes(value))throw new Error(`${label} requires an explicit supported source decision.`);};
const source=(row,label)=>{text(row.source,`${label} source`,1000);if(typeof row.reviewed!=='boolean')throw new Error(`${label} review must be explicit.`);choice(row.stateIdStatus,['unknown','provided','notOnSource'],`${label} state identifier`);};
export function validateCTEarnedIncomeCredit(value){
 strictObject(value,Object.keys(newCTEarnedIncomeCredit()),'Connecticut EITC source');
 choice(value.returnStatus,['unknown','original','alreadyFiled'],'Connecticut original/amended return');choice(value.filingStatus,['unknown','sameAsFederal','different'],'Connecticut filing-status relationship');text(value.source,'Connecticut EITC source',1000);
 strictObject(value.review,ctEitcReviews.map(([key])=>key),'Connecticut EITC reviews');for(const [key]of ctEitcReviews)if(typeof value.review[key]!=='boolean')throw new Error('Connecticut EITC reviews must be explicit.');
 const wages=new Set();for(const row of list(value.wageSources,'Connecticut EITC wage sources',100)){
  strictObject(row,Object.keys(newCTEitcWage()),'Connecticut EITC wage');text(row.w2Id,'Connecticut EITC W-2 link',100);if(!row.w2Id||wages.has(row.w2Id))throw new Error('Link each distinct Connecticut EITC W-2 source once.');wages.add(row.w2Id);
  text(row.employerFederalId,'Employer federal identifier',20);text(row.employerStateId,'Employer state identifier',40);checkedMoney(row.ctWithholdingCents,'Connecticut W-2 withholding');source(row,'Connecticut EITC wage');
 }
 const businesses=new Set();for(const row of list(value.businessSources,'Connecticut EITC business sources',100)){
  strictObject(row,Object.keys(newCTEitcBusiness()),'Connecticut EITC business');text(row.businessId,'Connecticut EITC business link',100);if(!row.businessId||businesses.has(row.businessId))throw new Error('Link each distinct Connecticut EITC business once.');businesses.add(row.businessId);text(row.ctTaxRegistrationNumber,'Business Connecticut tax registration number',40);source(row,'Connecticut EITC business');
 }
 return value;
}
