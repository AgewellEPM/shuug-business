import {strictObject,list,text,amountFields,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';
import {federalYearRules} from './federal-years.mjs';

// Reviewed annual Schedule H instructions, including Worksheet 2. These are
// federal FUTA credit-reduction restrictions, not state return support.
export const householdYearRules=Object.freeze({
  2023:Object.freeze({wageThresholdCents:260000,creditReductionStates:['CA','NY','VI']}),
  2024:Object.freeze({wageThresholdCents:270000,creditReductionStates:['CA','NY','VI']}),
  2025:Object.freeze({wageThresholdCents:280000,creditReductionStates:['CA','VI']}),
});
export const householdReviews=Object.freeze([
  ['classification','Household employee status and each worker’s full-year FICA/FUTA treatment reviewed, including family and under-age exceptions'],
  ['payroll','Complete cash wages, quarter allocation, withholding and prior-year FUTA records reviewed; exclusions applied and source records retained'],
  ['ordinary','Ordinary calendar-year Schedule H attached to this 1040; no third-party disability/sick pay, qualified sick/family leave credits, part-year exemption changes or wages reported on another employment return'],
].map(Object.freeze));
export const newHouseholdEmployer=(owner='taxpayer')=>({owner,ein:'',employees:[],priorYearFutaQuartersCents:[null,null,null,null],unemployment:{state:'',zeroRate:false,onlyOneState:false,paidOnTime:false,allFutaWagesStateTaxable:false},review:Object.fromEntries(householdReviews.map(([key])=>[key,false]))});
export const newHouseholdEmployee=id=>({id,name:'',quartersCents:[0,0,0,0],federalWithholdingCents:0,ficaTreatment:'unknown',futaTreatment:'unknown',source:''});
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI'.split(' '));
function quarters(values,label,{unknown=false}={}){
  list(values,label,4);if(values.length!==4)throw new Error(`${label} must contain all four calendar quarters.`);
  for(const value of values)if(!(unknown&&value===null))checkedMoney(value,label);
}

export function householdEmployment(values,{year,filingStatus}){
  const annual=householdYearRules[year],federal=federalYearRules(year);
  if(values===undefined)return {required:false,taxCents:0,forms:[],diagnostics:[]};
  const employers=list(values,'Household employers',2),owners=new Set(),eins=new Set(),forms=[],diagnostics=[];
  let total=0,unknown=false,required=false;
  for(const value of employers){
    strictObject(value,['owner','ein','employees','priorYearFutaQuartersCents','unemployment','review'],'Household employer');
    if(!['taxpayer','spouse'].includes(value.owner)||value.owner==='spouse'&&filingStatus!=='marriedJoint'||owners.has(value.owner))throw new Error('Use one household employer record per taxpayer or joint-return spouse.');owners.add(value.owner);
    text(value.ein,'Household employer EIN',11);const ein=value.ein.replaceAll('-','');if(ein&&eins.has(ein))throw new Error('Combine payroll under the same employer EIN; do not duplicate its wage limits.');if(ein)eins.add(ein);
    quarters(value.priorYearFutaQuartersCents,'Prior-year FUTA quarters',{unknown:true});
    strictObject(value.review,householdReviews.map(([key])=>key),'Household review');for(const [key]of householdReviews)if(typeof value.review[key]!=='boolean')throw new Error('Household reviews must be explicit yes/no decisions.');
    const state=strictObject(value.unemployment,['state','contributionsCents','zeroRate','onlyOneState','paidOnTime','allFutaWagesStateTaxable'],'State unemployment record');text(state.state,'State unemployment jurisdiction',2);
    if(state.contributionsCents!==undefined)checkedMoney(state.contributionsCents,'State unemployment contributions');
    for(const key of ['zeroRate','onlyOneState','paidOnTime','allFutaWagesStateTaxable'])if(typeof state[key]!=='boolean')throw new Error('State unemployment reviews must be explicit yes/no decisions.');
    const employees=list(value.employees,'Household workers',100),ids=new Set(),local=[];
    const need=(condition,code,message)=>{if(!condition)local.push(diagnostic(code,message));};
    for(const employee of employees){
      strictObject(employee,['id','name','quartersCents','federalWithholdingCents','ficaTreatment','futaTreatment','source'],'Household worker');
      text(employee.id,'Household worker identifier',100);text(employee.name,'Household worker name');text(employee.source,'Payroll source reference',500);quarters(employee.quartersCents,'Worker cash-wage quarters');amountFields(employee,['federalWithholdingCents'],'Worker withholding');
      if(!employee.id||ids.has(employee.id))throw new Error('Each household worker needs one unique record; combine their payments before applying wage limits.');ids.add(employee.id);
      for(const key of ['ficaTreatment','futaTreatment'])if(!['unknown','ordinary','exempt'].includes(employee[key]))throw new Error('Choose an explicit supported household wage treatment.');
      need(employee.name.trim(),'HOUSEHOLD_WORKER_NAME_REQUIRED','Identify each household worker in the protected payroll workpaper.');
      need(employee.ficaTreatment!=='unknown'&&employee.futaTreatment!=='unknown','HOUSEHOLD_CLASSIFICATION_REQUIRED','Review each worker’s separate FICA and FUTA treatment; unknown classifications cannot become exemptions.');
    }
    for(const [key,label]of householdReviews)need(value.review[key],'HOUSEHOLD_'+key.toUpperCase()+'_REVIEW',label+'.');
    const payrollUnknown=local.length>0,workerWages=employees.map(employee=>({...employee,wages:sumMoney(employee.quartersCents)}));
    const fica=workerWages.filter(employee=>employee.ficaTreatment==='ordinary'&&employee.wages>=annual.wageThresholdCents);
    const futa=workerWages.filter(employee=>employee.futaTreatment==='ordinary');
    const currentQuarters=[0,1,2,3].map(q=>sumMoney(futa.map(employee=>employee.quartersCents[q])));
    const threshold=payrollUnknown?null:[...currentQuarters,...value.priorYearFutaQuartersCents].some(amount=>amount!==null&&amount>=100000)?true:value.priorYearFutaQuartersCents.includes(null)?null:false;
    need(threshold!==null,'HOUSEHOLD_PRIOR_QUARTERS_REQUIRED','Complete the prior-year FUTA wage quarters unless the $1,000 test is already met by reviewed current-year wages.');
    const a=payrollUnknown?null:fica.length>0,b=employees.some(employee=>employee.federalWithholdingCents>0);
    const active=workerWages.some(employee=>employee.wages||employee.federalWithholdingCents);
    const applies=active&&(a||b||threshold!==false)||local.length>0;
    if(!applies)continue;
    required=true;need(/^\d{9}$/.test(ein),'HOUSEHOLD_EIN_REQUIRED','Enter and review the household employer EIN; a taxpayer SSN is not a substitute.');
    const partI=payrollUnknown?null:sumMoney([P(R(sumMoney(fica.map(employee=>Math.min(employee.wages,federal.socialSecurityBaseCents)))),1240),P(R(sumMoney(fica.map(employee=>employee.wages))),290),P(R(sumMoney(fica.map(employee=>Math.max(0,employee.wages-20000000)))),90),R(sumMoney(employees.map(employee=>employee.federalWithholdingCents)))]);
    const lines={};
    if(a!==false||b){
      Object.assign(lines,{'1':payrollUnknown?null:R(sumMoney(fica.map(employee=>Math.min(employee.wages,federal.socialSecurityBaseCents)))),'3':payrollUnknown?null:R(sumMoney(fica.map(employee=>employee.wages))),'5':payrollUnknown?null:R(sumMoney(fica.map(employee=>Math.max(0,employee.wages-20000000)))),'7':R(sumMoney(employees.map(employee=>employee.federalWithholdingCents))),'8':partI});
      for(const [line,wages,rate]of [['2','1',1240],['4','3',290],['6','5',90]])lines[line]=payrollUnknown?null:P(lines[wages],rate);
      if(year===2023){Object.assign(lines,{'1a':lines['1'],'2a':lines['2'],'2c':lines['2'],'8a':lines['8'],'8d':lines['8']});for(const key of ['1','2','8'])delete lines[key];}
    }
    let futaTax=0,sectionA=false;
    if(threshold===true){
      const before=local.length;
      need(states.has(state.state),'HOUSEHOLD_STATE_REQUIRED','Select the state unemployment jurisdiction.');
      need(state.onlyOneState&&state.paidOnTime&&state.allFutaWagesStateTaxable,'HOUSEHOLD_FUTA_SECTION_B_REQUIRED','Multiple states, late contributions or FUTA wages not covered by state unemployment require Schedule H Section B and its credit worksheets.');
      need(!annual.creditReductionStates.includes(state.state),'HOUSEHOLD_FUTA_CREDIT_REDUCTION','This year’s state requires the FUTA credit-reduction worksheet and Schedule H Section B; the reduced 0.6% rate cannot be assumed.');
      need(state.contributionsCents!==undefined&&(state.zeroRate?state.contributionsCents===0:state.contributionsCents>0),'HOUSEHOLD_CONTRIBUTIONS_REQUIRED','Enter reviewed state contributions; an entered zero requires confirmation of an assigned 0% experience rate.');
      sectionA=local.length===before&&!payrollUnknown;
      const wages=payrollUnknown?null:R(sumMoney(futa.map(employee=>Math.min(employee.wages,700000))));
      futaTax=sectionA?P(wages,60):null;
      if(sectionA){if(!state.zeroRate)lines['14']=R(state.contributionsCents);lines['15']=wages;lines['16']=futaTax;}
      lines['25']=partI;lines['26']=partI===null||futaTax===null?null:sumMoney([partI,futaTax]);
    }else if(threshold===null)futaTax=null;
    const tax=local.length||partI===null||futaTax===null?null:sumMoney([partI,futaTax]);
    // An incomplete employer identity/review must not expose a completed total.
    if(tax===null&&Object.hasOwn(lines,'26'))lines['26']=null;
    forms.push({form:'f1040sh',copyId:'household-'+value.owner,owner:value.owner,lines,household:{ein,a,b,threshold,sectionA,state,partI,workerWages}});
    diagnostics.push(...local);if(tax===null)unknown=true;else total=sumMoney([total,tax]);
  }
  return {required,taxCents:unknown?null:total,forms,diagnostics};
}
