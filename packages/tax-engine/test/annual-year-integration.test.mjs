import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateReturn,newReturn,newEnergyCredits,newCTStateReturn,newNYStateReturn} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfText} from './pdf-text.mjs';
import {reviewed,wage,business} from './fixtures.mjs';
import {schedule1A} from '../schedule-1a.mjs';
import {schedule1AFixture,schedule1AContext,tip,overtime,senior} from './schedule-1a-fixtures.mjs';

const fixture=year=>{const input=reviewed();input.year=year;input.individual.w2s=[wage('taxpayer',200000,1000)];return input;};
test('2026 and 2027 use their own published annual amounts through the complete return calculation',()=>{
 for(const [year,deduction,tax]of [[2026,1610000,3673400],[2027,1660000,3637500]]){
  const input=fixture(year),before=structuredClone(input),result=calculateReturn(input);
  assert.equal(result.calculationAvailable,true);assert.equal(result.standardDeduction.deductionCents,deduction);assert.equal(result.summary.ordinaryTaxCents,tax);assert.equal(result.summary.paymentsCents,100000);assert.equal(result.filingReady,false);assert(result.pdfUnavailableForms.includes('f1040'));assert.deepEqual(input,before);
 }
 const low=fixture(2027);low.individual.w2s=[wage('taxpayer',50000)];const result=calculateReturn(low);assert.equal(result.summary.adjustedGrossIncomeCents,5000000);assert.equal(result.summary.ordinaryTaxCents,null);assert(result.diagnostics.some(row=>row.code==='TAX_TABLE_2027_NOT_FINAL'));
});
test('2027 SE and active-business QBI use the released wage base and indexed minimum',()=>{
 const input=fixture(2027);input.individual.w2s=[wage('taxpayer',120000)];input.individual.businesses=[business('taxpayer',1200)];const result=calculateReturn(input);
 assert.equal(result.calculationAvailable,true);assert.equal(result.forms.find(row=>row.form==='f1040sse').lines['7'],19230000);assert.equal(result.forms.find(row=>row.form==='f8995').lines['15'],41500);assert.equal(result.forms[0].lines['13a'],41500);
});
test('all 2026 and 2027 entity families retain validated source intake without claiming calculation or PDF support',async()=>{
 for(const year of [2026,2027])for(const kind of ['1065','1120S','1120']){
  const input=newReturn(kind,year);input.entity.receiptsCents=5000000;const before=structuredClone(input),result=calculateReturn(input);
  assert.equal(result.intakeAvailable,true);assert.equal(result.calculationAvailable,false);assert.equal(result.status,'unsupported');assert.equal(result.filingReady,false);assert.deepEqual(result.summary,{});assert.deepEqual(result.forms,[]);assert.deepEqual(input,before);await assert.rejects(()=>generateDraftPdf(input),/declared tax-year pack/);
  for(const change of [value=>value.entity.receiptsCents=-1,value=>value.entity.extra='not supported',value=>value.entity.owners=[{id:'same',name:'A',taxId:'',shareBps:5000},{id:'same',name:'B',taxId:'',shareBps:5000}]]){const bad=structuredClone(input);change(bad);const invalid=calculateReturn(bad);assert.equal(invalid.status,'invalid-input');assert.notEqual(invalid.intakeAvailable,true);}
 }
 assert.throws(()=>newReturn('1040',2028),/tax-year/);
});
test('2027 exports readable workpapers without loading or relabeling any original annual template',async()=>{
 const input=fixture(2027),packet=await generateDraftPdf(input,{loadTemplate:()=>{throw new Error('No annual template may be loaded for this workpaper-only year.');}});
 assert(packet.bytes.length>1000);assert.deepEqual(packet.audit,[]);assert(packet.omittedForms.includes('f1040'));const text=pdfText(packet.bytes,'-raw');assert.match(text,/2027/);assert.match(text,/calculation workpapers only/);assert.match(text,/No final annual return templates/);assert.match(text,/SHUUG DRAFT - DO NOT FILE/);
});
test('2027 source records do not revive expired energy credits or prior-year state packs',()=>{
 const input=fixture(2027),energy=input.individual.energyCredits=newEnergyCredits();for(const key of Object.keys(energy.review))energy.review[key]=true;Object.assign(energy.home,{street:'1 Example St',city:'Hartford',state:'CT',zip:'06103'});energy.items=[{id:'solar-source',category:'solar',costCents:1000000,qmid:'',source:'Synthetic 2027 solar cost'}];input.individual.stateReturns=[newCTStateReturn(),newNYStateReturn()];const before=structuredClone(input),result=calculateReturn(input);
 assert.equal(result.calculationAvailable,true);assert.equal(result.summary.residentialCleanEnergyCreditCents,null);assert.equal(result.summary.totalTaxCents,null);assert(result.diagnostics.some(row=>row.code==='ENERGY_2027_REVIEW_REQUIRED'));assert(result.states.every(state=>state.summary.totalTaxCents===null&&state.forms.length===0));assert.deepEqual(input,before);
});
test('2027 statutory additional deductions require current reporting and do not omit an age-eligible senior',()=>{
 const context={...schedule1AContext(),year:2027},value=schedule1AFixture();value.tips=[tip(10000,{reporting:'w2TP',sstbStatus:'notSstb'})];value.overtime=[overtime(1000,'w2TT')];let result=schedule1A(value,context);assert.equal(result.deductionCents,1100000);assert.deepEqual(result.forms,[]);assert(result.diagnostics.some(row=>row.code==='S1A_2027_FORM_UNAVAILABLE'));
 value.tips[0].sstbStatus='transitionRelief';assert.equal(schedule1A(value,context).tipsDeductionCents,null);value.tips=[];value.overtime[0].method='premiumStatement';assert.equal(schedule1A(value,context).overtimeDeductionCents,null);
 context.eligibility.taxpayer.dateOfBirth='1950-01-01';assert.equal(schedule1A(undefined,context).deductionCents,null);const older=schedule1AFixture();older.seniors=[senior()];assert.equal(schedule1A(older,context).seniorDeductionCents,600000);
});
