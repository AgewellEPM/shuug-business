import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateReturn,newReturn,newEnergyCredits,newHouseholdEmployer} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {reviewed,business,wage} from './fixtures.mjs';
import {pdfText} from './pdf-text.mjs';

const annual=()=>{const input=reviewed();input.year=2026;return input;};
test('2026 missing Tax Table propagates through total tax, balances and saved workpaper export',async()=>{
  const input=annual();input.individual.w2s=[wage('taxpayer',50000,1000)];
  const result=calculateReturn(input);assert.equal(result.calculationAvailable,true);assert.equal(result.summary.adjustedGrossIncomeCents,5000000);
  for(const key of ['ordinaryTaxCents','totalTaxCents','refundCents','amountOwedCents'])assert.equal(result.summary[key],null,key);
  assert(result.diagnostics.some(item=>item.code==='TAX_TABLE_2026_NOT_FINAL'));
  const fetched=[],packet=await generateDraftPdf(input,{loadTemplate:id=>{fetched.push(id);throw new Error('No final main form should be fetched.');}});
  assert.deepEqual(fetched,[]);assert.deepEqual(packet.omittedForms,['f1040']);assert.equal(packet.audit.length,0);
  assert.match(pdfText(packet.bytes,'-layout'),/Official templates omitted/);assert.match(pdfText(packet.bytes,'-layout'),/SHUUG DRAFT/);
});
test('2026 statutory tax, new QBI floor and final annual Schedule C/SE stay connected',async()=>{
  const input=annual();input.individual.w2s=[wage('taxpayer',150000)];input.individual.businesses=[business('taxpayer',1300)];
  input.individual.businesses[0].expenses=[{category:'otherInterest',amountCents:10000,description:'Synthetic nonvehicle business interest'}];
  const result=calculateReturn(input),main=result.forms[0],qbi=result.forms.find(form=>form.form==='f8995'),schedule=result.forms.find(form=>form.form==='f1040sc');
  assert.equal(main.lines['13a'],40000);assert.equal(qbi.annual.minimumDeductionCents,40000);assert.equal(schedule.lines['16c'],10000);assert.equal(Object.hasOwn(schedule.lines,'16b'),false);
  assert.equal(result.summary.totalTaxCents,2507500);assert.equal(result.filingReady,false);
  const requests=[],packet=await generateDraftPdf(input,{loadTemplate:(id,year)=>{requests.push([id,year]);return readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));}});
  assert.deepEqual(requests,[['f1040sc',2026],['f1040sse',2026]]);assert.deepEqual(packet.audit.map(row=>row.form),['f1040sc','f1040sse']);
  assert(packet.audit[0].filled.some(row=>row.line==='16c'&&row.reference==='1/31'));assert(packet.omittedForms.includes('f8995'));assert.match(pdfText(packet.bytes,'-layout'),/2026/);
});
test('2026 selected unsupported schedules preserve unknown liabilities instead of using prior-year rules',()=>{
  const input=annual();input.individual.w2s=[wage('taxpayer',150000)];
  input.individual.householdEmployers=[newHouseholdEmployer()];let result=calculateReturn(input);assert.equal(result.summary.householdEmploymentTaxCents,null);assert.equal(result.summary.totalTaxCents,null);assert(result.diagnostics.some(row=>row.code==='HOUSEHOLD_ANNUAL_RULES_REQUIRED'));
  delete input.individual.householdEmployers;const energy=newEnergyCredits();energy.carryforwardCents=10000;input.individual.energyCredits=energy;result=calculateReturn(input);assert.equal(result.summary.residentialCleanEnergyCreditCents,null);assert.equal(result.summary.totalTaxCents,null);assert(result.diagnostics.some(row=>row.code==='ENERGY_2026_REVIEW_REQUIRED'));assert(result.forms.every(Boolean));
  for(const kind of ['1065','1120S','1120']){const value=newReturn(kind,2026);const calculation=calculateReturn(value);assert.equal(calculation.calculationAvailable,false);assert.equal(calculation.diagnostics[0].code,'BUSINESS_ANNUAL_PACK_REQUIRED');}
});
