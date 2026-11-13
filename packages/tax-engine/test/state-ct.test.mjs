import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {newReturn} from '../model.mjs';
import {ctInitialTax,ctTaxCalculation,ctPropertyTaxCredit} from '../state-ct-rates.mjs';
import {calculateCTResident,calculateStateReturns,newCTStateReturn,newCTAdjustment,newCTWithholding,newCTPropertyTax,stateCoverage} from '../state-returns.mjs';
import {ctPdfYearPack,renderCTForm} from '../state-ct-pdf.mjs';
import {pdfText} from './pdf-text.mjs';
const D=value=>value*100;
function fixture(year=2025){const input=newReturn('1040',year);Object.assign(input.party,{name:'Synthetic State Example',firstName:'Synthetic',lastName:'State Example',taxId:'000000001',street:'1 Synthetic Street',city:'Hartford',state:'CT',zip:'06103'});const value=newCTStateReturn();for(const key of Object.keys(value.review))value.review[key]=true;value.useTax.reviewed=true;input.individual.stateReturns=[value];return {input,value,federal:{adjustedGrossIncomeKnown:true,summary:{adjustedGrossIncomeCents:D(50000)}}};}
const compute=({input,value,federal})=>calculateCTResident(input,value,federal);

test('official annual Table B worked examples: all three bracket scales and changed 2024 rates',()=>{
 const cases=[['single',13000,[450,335]],['single',525000,[33298,32998]],['marriedJoint',22500,[725,513]],['marriedJoint',1100000,[70090,69490]],['headOfHousehold',20000,[680,500]],['headOfHousehold',825000,[52228,51748]]];
 for(const [filingStatus,income,[prior,current]]of cases)for(const year of [2023,2024,2025])assert.equal(ctInitialTax(D(income),{year,filingStatus}),D(year===2023?prior:current),`${year}/${filingStatus}/${income}`);
 for(const year of [2023,2024,2025])assert.equal(ctInitialTax(D(22500),{year,filingStatus:'survivingSpouse'}),ctInitialTax(D(22500),{year,filingStatus:'marriedJoint'}));
});
test('annual Tables A/C/D/E boundaries are inclusive at the published upper AGI amount',()=>{
 for(const year of [2023,2024,2025]){
  const calc=(income,filingStatus='single')=>ctTaxCalculation(D(income),{year,filingStatus});
  assert.equal(calc(30000).exemptionCents,D(15000));assert.equal(calc(30001).exemptionCents,D(14000));assert.equal(calc(44000).exemptionCents,D(1000));assert.equal(calc(44001).exemptionCents,0);
  assert.equal(calc(24000,'marriedSeparate').exemptionCents,D(12000));assert.equal(calc(35000,'marriedSeparate').exemptionCents,D(1000));assert.equal(calc(35001,'marriedSeparate').exemptionCents,0);
  assert.equal(calc(48000,'marriedJoint').exemptionCents,D(24000));assert.equal(calc(71001,'marriedJoint').exemptionCents,0);assert.equal(calc(38000,'headOfHousehold').exemptionCents,D(19000));assert.equal(calc(56001,'headOfHousehold').exemptionCents,0);
  for(const [status,start,next,increment]of [['single',56500,61500,year===2023?20:25],['marriedJoint',100500,105500,year===2023?40:50],['marriedSeparate',50250,52750,year===2023?20:25],['headOfHousehold',78500,82500,year===2023?32:40]]){assert.equal(calc(start,status).phaseOutCents,0);assert.equal(calc(start+1,status).phaseOutCents,D(increment));assert.equal(calc(next,status).phaseOutCents,D(increment));assert.equal(calc(next+1,status).phaseOutCents,D(increment*2));}
  assert.equal(calc(18800).personalCreditBps,7500);assert.equal(calc(18801).personalCreditBps,7000);assert.equal(calc(64500).personalCreditBps,100);assert.equal(calc(64501).personalCreditBps,0);
  assert.equal(calc(200000).recaptureCents,D(year===2023?0:250));assert.equal(calc(200001).recaptureCents,D(year===2023?90:340));assert.equal(calc(345000).recaptureCents,D(year===2023?2610:2860));assert.equal(calc(345001).recaptureCents,D(year===2023?2700:2950));assert.equal(calc(500001).recaptureCents,D(year===2023?2750:3000));assert.equal(calc(540001).recaptureCents,D(year===2023?3150:3400));
  assert.equal(calc(1080001,'marriedJoint').recaptureCents,D(year===2023?6300:6800));assert.equal(calc(864001,'headOfHousehold').recaptureCents,D(year===2023?4920:5320));assert.equal(calc(-5000).incomeTaxCents,0);
 }
});
test('property credit annual maximum, phase-out steps and income-tax limitation',()=>{
 for(const year of [2023,2024,2025])for(const [filingStatus,start,width]of [['single',49500,10000],['marriedSeparate',35250,5000],['marriedJoint',70500,10000],['headOfHousehold',54500,10000],['survivingSpouse',70500,10000]]){
  const credit=(agi,tax=1000)=>ctPropertyTaxCredit(D(agi),D(2000),D(tax),{year,filingStatus});assert.equal(credit(start).allowedCreditCents,D(300));assert.equal(credit(start+1).allowedCreditCents,D(255));assert.equal(credit(start+width).allowedCreditCents,D(255));assert.equal(credit(start+width+1).allowedCreditCents,D(210));assert.equal(credit(start+6*width).allowedCreditCents,D(30));assert.equal(credit(start+6*width+1).allowedCreditCents,0);assert.equal(credit(start,20).allowedCreditCents,D(20));
 }
});
test('resident flow joins federal AGI, reviewed adjustments, property credit, withholding, use tax and next-year application',()=>{
 const f=fixture();f.value.adjustments=[{...newCTAdjustment(),line:'31',amountCents:D(500),source:'Synthetic bond statement',reviewed:true},{...newCTAdjustment(),line:'39',amountCents:D(500),source:'Synthetic Treasury statement',reviewed:true}];f.value.propertyTaxes=[{...newCTPropertyTax(),town:'Hartford',description:'1 Synthetic Street',paidDates:'2025-07-01',amountCents:D(1200),source:'Synthetic tax bill',reviewed:true}];f.value.withholdings=[{...newCTWithholding(),payer:'Synthetic employer',payerId:'00-0000002',wagesCents:D(50000),withholdingCents:D(2000),source:'Synthetic W-2 CT',reviewed:true}];f.value.useTax.generalCents=D(5);f.value.useTax.source='Synthetic use-tax worksheet';f.value.estimatedPaymentsCents=D(100);f.value.nextYearAppliedCents=D(40);
 const result=compute(f);assert.equal(result.summary.adjustedGrossIncomeCents,D(50000));assert.equal(result.summary.incomeTaxCents,D(1800));assert.equal(result.summary.propertyTaxCreditCents,D(255));assert.equal(result.summary.totalTaxCents,D(1550));assert.equal(result.summary.paymentsCents,D(2100));assert.equal(result.summary.refundCents,D(510));assert.equal(result.summary.amountOwedCents,0);assert.equal(result.lines['38'],D(500));assert.equal(result.lines['50'],D(500));assert.equal(result.diagnostics.length,0);assert.equal(f.federal.summary.adjustedGrossIncomeCents,D(50000));
 f.value.review.filingCharges=false;assert.equal(compute(f).summary.refundCents,null);assert.equal(compute(f).summary.amountOwedCents,null);
});
test('uncertain federal AGI, unreviewed sources and extra state schedules never become zero state treatments',()=>{
 let f=fixture();f.federal.adjustedGrossIncomeKnown=false;assert.equal(compute(f).summary.adjustedGrossIncomeCents,null);assert.equal(compute(f).summary.totalTaxCents,null);
 f=fixture();f.value.adjustments=[{...newCTAdjustment(),amountCents:D(500),source:'Unreviewed statement'}];assert.equal(compute(f).lines['38'],null);assert.equal(compute(f).summary.totalTaxCents,null);
 f=fixture();f.value.unsupportedTreatments=['earnedIncomeCredit'];assert.equal(compute(f).lines['20a'],null);assert.equal(compute(f).summary.refundCents,null);
 f=fixture();f.value.review.credits=false;assert.equal(compute(f).summary.propertyTaxCreditCents,null);assert.equal(compute(f).summary.totalTaxCents,null);
 f=fixture();f.value.useTax.reviewed=false;assert.equal(compute(f).summary.totalTaxCents,null);
 f=fixture();f.value.withholdings=Array.from({length:6},()=>({...newCTWithholding(),payer:'Synthetic payer',payerId:'000000002',source:'Synthetic CT statement',reviewed:true}));assert.equal(compute(f).summary.paymentsCents,null);assert(compute(f).diagnostics.some(item=>item.code==='CT_WITHHOLDING_SUPPLEMENT'));
});
test('state and annual packs remain separate, unsupported residency has no counterfeit resident form',()=>{
 const f=fixture();f.value.residency='partYear';assert.deepEqual(compute(f).forms,[]);f.value.residency='resident';f.input.year=2026;assert.equal(compute(f).summary.totalTaxCents,null);assert.deepEqual(compute(f).forms,[]);
 f.input.individual.stateReturns.push({state:'NY',retainedSource:'Synthetic preserved value'});const before=structuredClone(f.input);const result=calculateStateReturns(f.input,f.federal);assert.equal(result.states.length,2);assert.equal(result.states[1].summary.totalTaxCents,null);assert.deepEqual(f.input,before);assert.equal(stateCoverage(2025).filter(row=>row.status==='resident-scope').length,1);assert.equal(stateCoverage(2026).filter(row=>row.status==='resident-scope').length,0);
 f.input.individual.stateReturns.push({state:'NY'});assert.throws(()=>calculateStateReturns(f.input,f.federal),/at most once/);
});
test('property and withholding whole-dollar displayed rows reconcile with their totals',()=>{
 const f=fixture();f.value.propertyTaxes=[{...newCTPropertyTax(),town:'Hartford',description:'Synthetic residence',paidDates:'2025-01-01',amountCents:149,source:'Synthetic bill',reviewed:true},{...newCTPropertyTax(),kind:'auto1',town:'Hartford',description:'2025 Synthetic Vehicle',paidDates:'2025-07-01',amountCents:149,source:'Synthetic bill',reviewed:true}];f.value.withholdings=[1,2].map(()=>({...newCTWithholding(),payer:'Synthetic employer',payerId:'000000002',wagesCents:100000,withholdingCents:149,source:'Synthetic W-2',reviewed:true}));const result=compute(f);assert.equal(result.lines['60']+result.lines['61'],result.lines['63']);assert.equal(result.lines['63'],200);assert.equal(result.lines['18'],200);
 f.value.propertyTaxes[0].paidDates='2025-02-30';assert.equal(compute(f).summary.propertyTaxCreditCents,null);f.value.propertyTaxes[0].paidDates='2025-99-99';assert.equal(compute(f).summary.propertyTaxCreditCents,null);
});
test('official four-page CT forms use annual pins and reviewed line overlays; tampering fails closed',async()=>{
 for(const year of [2023,2024,2025]){
  const f=fixture(year);f.value.withholdings=[{...newCTWithholding(),payer:'Synthetic employer',payerId:'000000002',wagesCents:D(50000),withholdingCents:D(2000),source:'Synthetic W-2 CT',reviewed:true}];f.value.propertyTaxes=[{...newCTPropertyTax(),town:'Hartford',description:'1 Synthetic Street',paidDates:`${year}-07-01`,amountCents:D(1200),source:'Synthetic bill',reviewed:true}];f.value.adjustments=[{...newCTAdjustment(),line:'37',amountCents:10000,description:'Synthetic addition',source:'Synthetic source',reviewed:true}];const result=compute(f),loadTemplate=async(id,selectedYear)=>new Uint8Array(await readFile(new URL(`../forms/${selectedYear}/${id}.pdf`,import.meta.url)));const rendered=await renderCTForm(f.input,result.forms[0],{loadTemplate});const pdf=await PDFDocument.load(rendered.bytes);assert.equal(pdf.getPageCount(),4);assert.equal(pdf.getForm().getFields().length,0);assert.equal(rendered.audit.sourceDraft,year===2023);for(const line of ['1','6','18','25','37','63','66','68','69'])assert(rendered.audit.fields.some(field=>field.line===line),`${year}/${line}`);assert.equal(ctPdfYearPack(year).templates[0].fieldCount,0);
  const text=pdfText(rendered.bytes,'-layout');assert.match(text,/Synthetic addition/);assert.match(text,/Hartford/);if(year===2023)assert.match(text,/DRAFT 12-12-2023/);
  const pages=[...pdfText(rendered.bytes).matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(match=>match[1]);
  for(const [page,amount,top]of [[0,'50000',year===2023?404:410],[0,year===2023?'2075':'1805',year===2023?504:510],[1,'2000',year===2023?123:122],[2,'100',231],[3,'1200',130],[3,'255',330]])assert([...pages[page].matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attributes,value])=>value===amount&&Number(attributes.match(/xMin="([^"]+)"/)[1])>450&&Math.abs((Number(attributes.match(/yMin="([^"]+)"/)[1])+Number(attributes.match(/yMax="([^"]+)"/)[1]))/2-top)<4),`${year}: printed ${amount} must occupy page ${page+1} row ${top}`);
  if(process.env.SHUUG_CT_RENDER_EVIDENCE)await writeFile(`${process.env.SHUUG_CT_RENDER_EVIDENCE}/${year}-synthetic-ct1040.pdf`,rendered.bytes);
  await assert.rejects(()=>renderCTForm(f.input,result.forms[0],{loadTemplate:async()=>new Uint8Array([1,2,3])}),/integrity/);
  f.input.party.firstName='Synthetic'.repeat(100);await assert.rejects(()=>renderCTForm(f.input,result.forms[0],{loadTemplate}),/cannot fit/);
 }
 assert.equal(ctPdfYearPack(2026).templates.length,0);
});
test('CT identity uses joint/separate spouse fields while survivor fields stay empty; wrong-year adjustments remain workpaper-only',async()=>{
 const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
 for(const filingStatus of ['marriedJoint','marriedSeparate','headOfHousehold','survivingSpouse']){const f=fixture();Object.assign(f.input.individual,{filingStatus,spouseName:'SyntheticSpouse SpouseExample',spouseFirstName:'SyntheticSpouse',spouseLastName:'SpouseExample',spouseTaxId:'000000003'});const rendered=await renderCTForm(f.input,compute(f).forms[0],{loadTemplate}),text=pdfText(rendered.bytes,'-layout');assert.equal(text.includes('SyntheticSpouse'),['marriedJoint','marriedSeparate'].includes(filingStatus));assert.equal(rendered.audit.fields.filter(field=>field.line.startsWith('spouseTaxpayerId:')).length,['marriedJoint','marriedSeparate'].includes(filingStatus)?9:0);}
 const f=fixture(2023);f.value.adjustments=[{...newCTAdjustment(),line:'48d',amountCents:10000,source:'Synthetic future-year line',reviewed:true}];const result=compute(f);assert.equal(result.lines['48d'],null);assert.equal(result.summary.totalTaxCents,null);assert(result.diagnostics.some(item=>item.code==='CT_ANNUAL_ADJUSTMENT'));await renderCTForm(f.input,result.forms[0],{loadTemplate});
});
