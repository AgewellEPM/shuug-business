import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newHouseholdEmployer,newHouseholdEmployee,householdEmployment} from '../household-employment.mjs';
import {newHouseholdFuta,newHouseholdFutaRow} from '../household-futa.mjs';
import {calculateReturn} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfText} from './pdf-text.mjs';
import {reviewed} from './fixtures.mjs';

const reference=JSON.parse(await readFile(new URL('./irs-household-futa-examples.json',import.meta.url),'utf8'));
function employer(year=2025,state='CA'){
  const value=newHouseholdEmployer();value.ein='00-0123456';value.priorYearFutaQuartersCents=[0,0,0,0];for(const key of Object.keys(value.review))value.review[key]=true;
  value.employees=[{...newHouseholdEmployee('worker'),name:'Synthetic Worker',quartersCents:[1000000,0,0,0],ficaTreatment:'ordinary',futaTreatment:'ordinary',source:'Synthetic source'}];
  Object.assign(value.unemployment,{state,onlyOneState:true,paidOnTime:true,allFutaWagesStateTaxable:true,sectionB:{...newHouseholdFuta(),reviewed:true,allocationReviewed:true,rows:[{...newHouseholdFutaRow(),state,taxableWagesCents:1000000,rateStatus:'assigned',experienceRate:'2.7',periodStart:`${year}-01-01`,periodEnd:`${year}-12-31`,paidOnTimeCents:27000,paidLateCents:0,source:'Synthetic state notice'}],allocations:[{employeeId:'worker',state,wagesCents:700000}]}});
  return value;
}
const calculate=(value,year=2025)=>householdEmployment([value],{year,filingStatus:'single'});
for(const rates of reference.rates)for(const state of ['CA','NY','VI','CT'])test(`${rates.year} ${state} annual Worksheet2 rate and complete-credit FUTA amount`,()=>{
  const result=calculate(employer(rates.year,state),rates.year),form=result.forms[0],rate=rates[state];assert.deepEqual(result.diagnostics,[]);
  assert.equal(result.taxCents,157200+70*rate);assert.equal(form.household.sectionA,rate===0);
  if(rate){assert.equal(form.lines['21'],42000);assert.equal(form.household.futaDetails.worksheet2['4'],70*rate);assert.equal(form.lines['24'],4200+70*rate);}
  else assert.equal(form.lines['16'],4200);
});
test('late state contributions use the annual Worksheet1 before the credit-reduction Worksheet2',()=>{
  const value=employer(),row=value.unemployment.sectionB.rows[0];value.unemployment.paidOnTime=false;row.paidOnTimeCents=0;row.paidLateCents=27000;
  const result=calculate(value),form=result.forms[0],expected=reference.lateExample;assert.deepEqual(result.diagnostics,[]);
  for(const [column,amount]of Object.entries(expected.line17))assert.equal(form.household.futaDetails.rows[0][column],amount);
  assert.deepEqual(form.household.futaDetails.worksheet1,expected.worksheet1);for(const [line,amount]of Object.entries(expected.worksheet2))assert.equal(form.household.futaDetails.worksheet2[line],amount);
  assert.equal(form.lines['24'],expected.futaTaxCents);assert.equal(result.taxCents,expected.householdTaxCents);
  const input=reviewed();input.individual.householdEmployers=[value];const full=calculateReturn(input);assert.equal(full.forms.find(form=>form.form==='f1040s2').lines['9'],166700);assert.equal(full.forms.find(form=>form.form==='f1040').lines['23'],166700);assert.equal(full.filingReady,false);
});
test('Section B preserves unknown payments, state wages, experience rate and allocation; no zero-credit guess completes a return',()=>{
  for(const change of [b=>delete b.rows[0].taxableWagesCents,b=>delete b.rows[0].paidOnTimeCents,b=>delete b.rows[0].paidLateCents,b=>b.rows[0].experienceRate='',b=>b.rows[0].periodStart='',b=>b.reviewed=false,b=>b.allocationReviewed=false,b=>b.allocations=[],b=>delete b.allocations[0].wagesCents,b=>b.allocations[0].wagesCents--]){
    const value=employer();change(value.unemployment.sectionB);const result=calculate(value);assert.equal(result.taxCents,null);assert.equal(result.forms[0].lines['23'],null);assert.equal(result.forms[0].lines['26'],null);assert(result.diagnostics.length);
  }
  const value=employer();value.unemployment.sectionB.allocations=[];assert.equal(calculate(value).forms[0].household.futaDetails.worksheet2.reductions[0].wagesCents,null);
});
test('state experience zero and rates at or above5.4% differ from an unassigned or unknown rate',()=>{
  const value=employer(),b=value.unemployment.sectionB,row=b.rows[0];row.experienceRate='0';row.paidOnTimeCents=0;let result=calculate(value);assert.equal(result.taxCents,165600);assert.equal(result.forms[0].lines['19'],54000);
  row.experienceRate='6';row.paidOnTimeCents=60000;result=calculate(value);assert.equal(result.taxCents,165600);assert.equal(result.forms[0].household.futaDetails.rows[0].e,null);assert.equal(result.forms[0].lines['18g'],0);
  row.rateStatus='notAssigned';row.experienceRate='';row.periodStart='';row.periodEnd='';row.paidOnTimeCents=10000;result=calculate(value);assert.equal(result.forms[0].lines['23'],1600);assert.equal(result.forms[0].lines['24'],40400);
  row.rateStatus='unknown';result=calculate(value);assert.equal(result.taxCents,null);
});
test('multiple states and rate periods reconcile each worker cap without subtracting excluded-state wages from federal FUTA',()=>{
  const value=employer(),b=value.unemployment.sectionB;value.unemployment.allFutaWagesStateTaxable=false;value.unemployment.onlyOneState=false;
  b.rows=[{...b.rows[0],taxableWagesCents:300000,periodEnd:'2025-06-30',paidOnTimeCents:8100},{...b.rows[0],taxableWagesCents:200000,periodStart:'2025-07-01',experienceRate:'1.5',paidOnTimeCents:3000},{...b.rows[0],state:'CT',taxableWagesCents:200000,paidOnTimeCents:5400}];
  b.allocations=[{employeeId:'worker',state:'CA',wagesCents:400000},{employeeId:'worker',state:'CT',wagesCents:200000},{employeeId:'worker',state:'EX',wagesCents:100000}];
  let result=calculate(value);assert.deepEqual(result.diagnostics,[]);assert.equal(result.forms[0].lines['20'],700000);assert.equal(result.forms[0].household.futaDetails.worksheet2['4'],4800);assert.equal(result.forms[0].lines['24'],9000);
  b.allocations.push({employeeId:'worker',state:'CA',wagesCents:0});assert.equal(calculate(value).taxCents,null);b.allocations.pop();b.allocations[0].wagesCents+=100;assert.equal(calculate(value).taxCents,null);
  b.allocations[0].wagesCents-=100;b.rows[1].periodStart='2025-06-30';assert(calculate(value).diagnostics.some(d=>d.code==='HOUSEHOLD_FUTA_OVERLAPPING_PERIODS'));
});
test('explicit no-state liability produces gross6% FUTA; absent state records remain unknown',()=>{
  const value=employer(),b=value.unemployment.sectionB;b.rows=[];b.allocations=[];b.noStateLiability=true;value.unemployment.allFutaWagesStateTaxable=false;
  let result=calculate(value);assert.deepEqual(result.diagnostics,[]);assert.equal(result.forms[0].lines['23'],0);assert.equal(result.forms[0].lines['24'],42000);assert.equal(result.taxCents,195000);
  b.noStateLiability=false;assert.equal(calculate(value).taxCents,null);
});
test('detailed periods that qualify for Section A round aggregate contributions once on line14',()=>{
  const value=employer(2025,'CT'),b=value.unemployment.sectionB;
  b.rows=[{...b.rows[0],taxableWagesCents:500000,periodEnd:'2025-06-30',paidOnTimeCents:13549},{...b.rows[0],taxableWagesCents:500000,periodStart:'2025-07-01',paidOnTimeCents:13549}];
  const result=calculate(value);assert.deepEqual(result.diagnostics,[]);assert.equal(result.forms[0].household.sectionA,true);assert.equal(result.forms[0].lines['14'],27100);assert.equal(result.taxCents,157200);
});
test('late-credit cap, zero floor and exact percentage validation do not create a negative tax or excess credit',()=>{
  const value=employer(),row=value.unemployment.sectionB.rows[0];value.unemployment.paidOnTime=false;row.rateStatus='notAssigned';row.experienceRate='';row.periodStart='';row.periodEnd='';row.paidOnTimeCents=0;row.paidLateCents=100000;
  let result=calculate(value);assert.equal(result.forms[0].household.futaDetails.worksheet1['8'],34000);assert.equal(result.forms[0].lines['24'],16400);
  row.paidLateCents=0;row.paidOnTimeCents=1000;result=calculate(value);assert.equal(result.forms[0].lines['23'],0);assert.equal(result.forms[0].lines['24'],42000);
  row.rateStatus='assigned';row.periodStart='2025-01-01';row.periodEnd='2025-12-31';for(const rate of ['2.70001','2.7e0','-1','100.1']){row.experienceRate=rate;assert.throws(()=>calculate(value),/percentage/);}
  row.experienceRate='2.7001';assert.doesNotThrow(()=>calculate(value));row.periodEnd='2025-02-29';assert.equal(calculate(value).taxCents,null);
});
for(const year of [2023,2024,2025])test(`${year} actual Section B PDF rows, tax lines, adjustment checkbox and worksheet carry`,async()=>{
  const input=reviewed();input.year=year;const value=employer(year);input.individual.householdEmployers=[value];value.unemployment.paidOnTime=false;value.unemployment.sectionB.rows[0].paidOnTimeCents=0;value.unemployment.sectionB.rows[0].paidLateCents=27000;
  const {bytes,audit,result}=await generateDraftPdf(input,{loadTemplate:(id,y)=>readFile(new URL(`../forms/${y}/${id}.pdf`,import.meta.url))});
  const form=audit.find(item=>item.form==='f1040sh'),text=pdfText(bytes,'-layout'),page=text.split('\f')[form.firstPage];
  for(const amount of ['10,000','270','540','2.7%','01/01','12/31'])assert(page.includes(amount.replace(',','')),amount);
  for(const field of ['2/5','2/6','2/7','2/8','2/9','2/10','2/11','2/12','2/13','2/23','2/24','2/25','2/26','2/27','2/28','2/29','2/30'])assert(form.filled.some(item=>item.reference===field),field);
  for(const checkbox of ['Line10[0].c2_1[1]','c2_2[1]','c2_3[0]','c2_4[0]'])assert(form.filled.some(item=>item.checkbox===`topmostSubform[0].Page2[0].${checkbox}`),checkbox);
  assert(text.includes('Worksheet 1 line 8: 367.00'));assert(text.includes('Worksheet 2 line 5:'));assert.equal(result.filingReady,false);
});
test('third state/rate row is included in the attached line17 statement and totals',async()=>{
  const input=reviewed(),value=employer();input.individual.householdEmployers=[value];const b=value.unemployment.sectionB;
  b.rows=[{...b.rows[0],taxableWagesCents:300000,periodEnd:'2025-04-30',paidOnTimeCents:8100},{...b.rows[0],taxableWagesCents:300000,periodStart:'2025-05-01',periodEnd:'2025-08-31',paidOnTimeCents:8100},{...b.rows[0],taxableWagesCents:400000,periodStart:'2025-09-01',paidOnTimeCents:10800,source:'Third period synthetic source'}];
  const {bytes,result}=await generateDraftPdf(input,{loadTemplate:(id,y)=>readFile(new URL(`../forms/${y}/${id}.pdf`,import.meta.url))});const text=pdfText(bytes,'-layout');
  assert(text.includes('Row 3: (a) CA; (b) 4000.00'));assert(text.includes('Third period synthetic source'));assert.equal(result.summary.householdEmploymentTaxCents,165600);
  const continuation=text.split('\f').find(page=>page.includes('line 17 continuation'));assert(continuation);assert(/CA\s+4000\s+09\/01\s+12\/31\s+2\.7%\s+216\s+108\s+108\s+108/.test(continuation));
});
