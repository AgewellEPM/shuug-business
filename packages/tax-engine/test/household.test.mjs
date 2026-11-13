import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pdfText} from './pdf-text.mjs';
import {newHouseholdEmployer,newHouseholdEmployee,householdEmployment} from '../household-employment.mjs';
import {newEnergyCredits,calculateReturn} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {reviewed,wage} from './fixtures.mjs';

function employer(wages=10000,owner='taxpayer'){
 const value=newHouseholdEmployer(owner);value.ein=owner==='taxpayer'?'00-0123456':'00-0654321';value.priorYearFutaQuartersCents=[0,0,0,0];for(const key of Object.keys(value.review))value.review[key]=true;
 Object.assign(value.unemployment,{state:'CT',contributionsCents:27000,onlyOneState:true,paidOnTime:true,allFutaWagesStateTaxable:true});
 const worker=newHouseholdEmployee('worker');Object.assign(worker,{name:'Synthetic Worker',quartersCents:[wages*100,0,0,0],ficaTreatment:'ordinary',futaTreatment:'ordinary',source:'Synthetic reviewed payroll'});value.employees=[worker];return value;
}
const calculate=(value,year=2025,filingStatus='single')=>householdEmployment(Array.isArray(value)?value:[value],{year,filingStatus});
const published=JSON.parse(await readFile(new URL('./irs-household-examples.json',import.meta.url),'utf8'));
for(const example of published.examples)test(`${example.year} Publication 926 cash-wage example retains annual Schedule H rounding`,()=>{
 const value=employer();value.employees[0].quartersCents=[63000,91000,91000,91000];const result=calculate(value,example.year),lines=result.forms[0].lines;
 assert.equal(lines[example.year===2023?'1a':'1'],example.cashWagesCents);assert.equal(lines[example.year===2023?'2c':'2'],example.expectedSocialSecurityTaxCents);assert.equal(lines['4'],example.expectedMedicareTaxCents);assert.equal(result.taxCents,example.expectedPartITaxCents);assert.deepEqual(result.diagnostics,[]);
});
for(const [year,threshold,base]of [[2023,2600,160200],[2024,2700,168600],[2025,2800,176100]])test(`${year} household thresholds use exact source cents and annual caps per worker`,()=>{
 const value=employer(threshold);value.employees[0].quartersCents=[threshold*25,threshold*25,threshold*25,threshold*25];
 let result=calculate(value,year);assert.equal(result.forms[0].lines[year===2023?'1a':'1'],threshold*100);assert.equal(result.forms[0].household.threshold,false);
 value.employees[0].quartersCents[0]--;result=calculate(value,year);assert.equal(result.taxCents,0);assert.equal(result.required,false);
 value.employees[0].quartersCents=[30000000,0,0,0];value.employees.push({...structuredClone(value.employees[0]),id:'worker-2',quartersCents:[25000000,0,0,0]});
 result=calculate(value,year);const h=result.forms[0];assert.equal(h.lines[year===2023?'1a':'1'],base*200);assert.equal(h.lines['3'],55000000);assert.equal(h.lines['5'],15000000);assert.equal(h.lines['6'],135000);assert.equal(h.lines['15'],1400000);assert.equal(h.lines['16'],8400);
});
test('FUTA uses combined quarterly cash wages and each employee’s $7,000 annual cap independently of FICA eligibility',()=>{
 const value=employer(2000);value.employees.push({...structuredClone(value.employees[0]),id:'worker-2'});let result=calculate(value);assert.equal(result.forms[0].household.a,false);assert.equal(result.forms[0].lines['25'],0);assert.equal(result.taxCents,2400);
 value.employees[1].futaTreatment='exempt';result=calculate(value);assert.equal(result.taxCents,1200);
 value.employees[0].quartersCents=[99999,0,0,0];value.employees[1].quartersCents=[0,0,0,0];result=calculate(value);assert.equal(result.required,false);value.priorYearFutaQuartersCents=[100000,0,0,0];assert.equal(calculate(value).taxCents,600);
});
test('unknown prior quarters remain unknown; a reviewed current-year threshold can establish FUTA without them',()=>{
 const value=employer(3100);value.priorYearFutaQuartersCents=[null,null,null,null];value.employees[0].quartersCents=[77500,77500,77500,77500];assert.equal(calculate(value).taxCents,null);
 value.employees[0].quartersCents=[100000,100000,110000,0];assert.equal(calculate(value).taxCents,49300);
 value.priorYearFutaQuartersCents=[0,0,0,0];value.employees[0].quartersCents=[77500,77500,77500,77500];const result=calculate(value);assert.equal(result.taxCents,47400);assert.equal(result.forms[0].household.threshold,false);
});
test('missing classifications/reviews/EIN and unsupported state-credit treatment suppress complete tax and balance',()=>{
 const input=reviewed();input.individual.w2s=[wage('taxpayer',50000)];input.individual.householdEmployers=[employer()];const value=input.individual.householdEmployers[0];
 for(const [object,key,bad]of [[value,'ein',''],[value.review,'ordinary',false],[value.employees[0],'ficaTreatment','unknown'],[value.unemployment,'paidOnTime',false],[value.unemployment,'allFutaWagesStateTaxable',false],[value.unemployment,'onlyOneState',false],[value.unemployment,'state','CA'],[value.unemployment,'contributionsCents',undefined]]){
  const before=object[key];object[key]=bad;const result=calculateReturn(input);assert.equal(result.calculationAvailable,true);assert.equal(result.summary.householdEmploymentTaxCents,null,key);assert.equal(result.summary.totalTaxCents,null);assert.equal(result.summary.amountOwedCents,null);object[key]=before;
 }
});
test('annual credit-reduction restrictions and explicit zero-rate state contributions never default to a full credit',()=>{
 const value=employer();value.unemployment.state='NY';assert.equal(calculate(value,2024).taxCents,null);assert.equal(calculate(value,2025).taxCents,157200);value.unemployment.state='CT';assert.equal(calculate(value,2023).taxCents,157200);
 value.unemployment.contributionsCents=0;assert.equal(calculate(value).taxCents,null);value.unemployment.zeroRate=true;assert.equal(calculate(value).taxCents,157200);assert.equal(Object.hasOwn(calculate(value).forms[0].lines,'14'),false);
 value.unemployment.contributionsCents=1;assert.equal(calculate(value).taxCents,null);
});
test('employee withholding is an employer tax liability and never an employer 1040 payment or energy-credit offset',()=>{
 const input=reviewed();input.individual.w2s=[wage('taxpayer',50000,1000)];const value=employer();value.employees[0].federalWithholdingCents=10000;input.individual.householdEmployers=[value];
 const energy=newEnergyCredits();energy.carryforwardCents=10000000;energy.review.scope=true;energy.review.carryforward=true;input.individual.energyCredits=energy;
 const result=calculateReturn(input);assert.equal(result.summary.householdEmploymentTaxCents,167200);assert.equal(result.summary.totalTaxCents,167200);assert.equal(result.summary.paymentsCents,100000);assert.equal(result.summary.amountOwedCents,67200);assert.equal(result.forms.find(form=>form.form==='f1040s2').lines['9'],167200);
 value.employees[0].ficaTreatment='exempt';value.employees[0].futaTreatment='exempt';value.priorYearFutaQuartersCents=[0,0,0,0];assert.equal(calculateReturn(input).summary.householdEmploymentTaxCents,10000);
});
test('joint return retains distinct employer schedules and rejects duplicate records and malformed payroll',()=>{
 const values=[employer(10000),employer(10000,'spouse')];const result=calculate(values,2025,'marriedJoint');assert.equal(result.taxCents,314400);assert.equal(result.forms.length,2);assert.deepEqual(result.forms.map(form=>form.owner),['taxpayer','spouse']);
 assert.throws(()=>calculate(values),/joint-return/);values[1].ein=values[0].ein;assert.throws(()=>calculate(values,2025,'marriedJoint'),/same employer EIN/);values[1].ein='00-0654321';values[0].employees.push(structuredClone(values[0].employees[0]));assert.throws(()=>calculate(values,2025,'marriedJoint'),/unique record/);values[0].employees.pop();values[0].employees[0].quartersCents[0]=-1;assert.throws(()=>calculate(values,2025,'marriedJoint'),/nonnegative/);
});
test('joint PDF retains both employers and the no-FUTA path selects the actual 2025 No box',async()=>{
 const input=reviewed();input.individual.filingStatus='marriedJoint';Object.assign(input.individual,{spouseName:'Synthetic Spouse',spouseFirstName:'Synthetic',spouseLastName:'Spouse',spouseTaxId:'000654321'});
 input.individual.householdEmployers=[employer(3100),employer(3100,'spouse')];for(const value of input.individual.householdEmployers)value.employees[0].quartersCents=[77500,77500,77500,77500];
 const {bytes,audit,result}=await generateDraftPdf(input,{loadTemplate:(id,y)=>readFile(new URL(`../forms/${y}/${id}.pdf`,import.meta.url))});const forms=audit.filter(item=>item.form==='f1040sh');assert.equal(forms.length,2);assert.equal(result.summary.householdEmploymentTaxCents,94800);
 const text=pdfText(bytes,'-raw').split('\f');
 for(const [i,name]of ['Synthetic Taxpayer','Synthetic Spouse'].entries()){
  assert(text[forms[i].firstPage-1].includes(name));const marked=forms[i].filled.filter(field=>field.checkbox).map(field=>field.checkbox);assert(marked.includes('topmostSubform[0].Page1[0].c1_4[0]'));assert(!marked.some(field=>field.includes('Page2')));
 }
 const fields=JSON.parse(await readFile(new URL('../forms/2025/f1040sh.fields.json',import.meta.url),'utf8')),no=fields.find(field=>field.name==='topmostSubform[0].Page1[0].c1_4[0]');assert.equal(Math.round(792-no.rect.y-no.rect.height/2),666);
});
for(const year of [2023,2024,2025])test(`${year} actual Schedule H fields, annual checkbox positions and Schedule 2 / 1040 carry are correct`,async()=>{
 const input=reviewed();input.year=year;input.individual.w2s=[wage('taxpayer',50000)];input.individual.householdEmployers=[employer()];
 const result=calculateReturn(input);assert.equal(result.summary.householdEmploymentTaxCents,157200);
 const {bytes,audit}=await generateDraftPdf(input,{loadTemplate:(id,y)=>readFile(new URL(`../forms/${y}/${id}.pdf`,import.meta.url))});const xml=pdfText(bytes,'-bbox-layout'),pages=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
 const amount=(form,offset,value,top)=>{const page=pages[audit.find(item=>item.form===form).firstPage-1+offset][1];assert([...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,text])=>text===String(value)&&Number(attrs.match(/xMin="([^"]+)"/)[1])>=500&&Math.abs((Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2-top)<8),`${form}: ${value} on row ${top}`);};
 amount('f1040sh',0,1530,year===2023?498:570);amount('f1040sh',1,42,210);amount('f1040sh',1,1572,486);amount('f1040s2',0,1572,year===2023?342:year===2024?564:576);
 const main=result.forms.find(form=>form.form==='f1040');assert.equal(main.lines['23'],157200);assert.equal(main.lines['24'],main.lines['16']+157200);
 const marked=audit.find(item=>item.form==='f1040sh').filled.filter(field=>field.checkbox).map(field=>field.checkbox);assert(marked.includes(`topmostSubform[0].Page1[0].c1_4[${year===2025?1:0}]`));assert(marked.includes('topmostSubform[0].Page2[0].Line10[0].c2_1[0]'));
 const fields=JSON.parse(await readFile(new URL(`../forms/${year}/f1040sh.fields.json`,import.meta.url),'utf8')),line9=fields.find(field=>field.name===marked.find(name=>name.includes('c1_4')));assert(Math.abs((792-line9.rect.y-line9.rect.height/2)-(year===2023?667:year===2024?631:630))<1);
 assert.equal(result.filingReady,false);
});
