import {diagnostic} from './model.mjs';
import {sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';
import {federalYearRules} from './federal-years.mjs';
/** New York's 2017-law payroll alternative uses current original sources.
 * It can apply to three ITIN children even when modern federal PartII does not,
 * or when its display was optimized away. Reconcile a modern row if present. */
export function nyLegacyPayroll(input,federal){
 const diagnostics=[],need=(value,message)=>{if(!value)diagnostics.push(diagnostic('NY_EMPIRE_PAYROLL_SOURCE',message));},value=input.individual.childCredits,wages=input.individual.w2s??[],records=value?.socialSecurityWithholding??[],main=federal.forms?.find(row=>row.form==='f1040')?.lines??{},medicare=federal.forms?.find(row=>row.form==='f8959'),se=(federal.forms??[]).filter(row=>row.form==='f1040sse'),owners=input.individual.filingStatus==='marriedJoint'?['taxpayer','spouse']:['taxpayer'];
 need(value?.review.payroll===true,'Review original W-2 Social Security/Medicare, SE and excess Social Security sources before the New York three-child alternative.');
 const matched=wages.map(wage=>records.find(row=>row.w2Id===wage.id));need(matched.every((row,index)=>row?.reviewed&&row.source?.trim()&&Number.isSafeInteger(row.socialSecurityTaxWithheldCents)&&Number.isSafeInteger(wages[index].medicareTaxWithheldCents))&&records.length===wages.length&&records.every(row=>wages.some(wage=>wage.id===row.w2Id)),'Reconcile each original W-2 box4 and box6 amount to its actual source ID.');
 need(se.every(row=>!row.incomeUnknown&&Number.isSafeInteger(row.halfTaxCents)),'Resolve each calculated ordinary Schedule SE half-tax.');
 const m=medicare?.lines??{};if(medicare)need(['7','13','22'].every(key=>Number.isSafeInteger(m[key])),'Resolve actual Form8959 wage tax, SE tax and withholding before using the payroll alternative.');
 const eic=federal.earnedIncomeCredit?.amountCents;need(Number.isSafeInteger(eic)&&eic>=0&&eic===main['27'],'Reconcile actual federal EIC to Form1040 line27; no assumed zero is used in the payroll alternative.');
 if(diagnostics.length)return {known:false,amountCents:null,lines:{},diagnostics};
 const social=R(sumMoney(matched.map(row=>row.socialSecurityTaxWithheldCents))),medical=R(sumMoney(wages.map(row=>row.medicareTaxWithheldCents))),half=R(sumMoney(se.map(row=>row.halfTaxCents)));need(main['10']===half,'Federal income adjustments differ from the represented ordinary deductible half-SE source.');
 const maximum=P(federalYearRules(input.year).socialSecurityBaseCents,620),excessPossible=owners.some(owner=>R(sumMoney(wages.map((row,index)=>row.owner===owner?matched[index].socialSecurityTaxWithheldCents:0)))>maximum);need(!excessPossible,'An excess Social Security withholding claim needs its actual federal supporting calculation; it cannot be presumed zero.');
 const payroll=medicare?sumMoney([social,medical,m['7'],-m['22'],P(m['13'],5000)]):R(sumMoney([...matched.map(row=>row.socialSecurityTaxWithheldCents),...wages.map(row=>row.medicareTaxWithheldCents)])),lines={'21':payroll,'22':half,'23':sumMoney([payroll,half]),'24':eic};lines['25']=Math.max(0,lines['23']-lines['24']);
 const current=federal.childCredits?.form?.lines?.['25'];if(current!==undefined)need(current===lines['25'],'The New York old-law payroll alternative from current original sources conflicts with an existing actual federal Schedule8812 line25.');
 return {known:diagnostics.length===0,amountCents:diagnostics.length?null:lines['25'],lines,diagnostics};
}
