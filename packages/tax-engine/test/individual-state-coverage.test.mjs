import {eligibilityFixture} from './standard-deduction-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newReturn} from '../model.mjs';
import {calculateIndividual} from '../individual.mjs';
import {calculateNYResident,newNYStateReturn,newNYDependent,newNYWageRecord} from '../state-ny.mjs';
import {business,wage} from './fixtures.mjs';
import {newEnergyCredits} from '../energy-credits.mjs';
import {capitalFixture} from './capital-fixtures.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfText} from './pdf-text.mjs';

// IRS annual 1040 Standard Deduction Worksheet (2023/2024/2025), pinned in
// retirement-reference.json; https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf.
// Final 2026 estimated-tax guidance, not final 1040 availability:
// https://www.irs.gov/publications/p505
// Worksheet 2-4 lines 2–5 confirms claimability and the Jan 2, 1962 cutoff.

function fixture(year=2025){
 const input=newReturn('1040',year);input.individual.eligibility=eligibilityFixture();input.individual.eligibility.taxpayer.dateOfBirth='1980-01-01';input.individual.w2s=[wage('taxpayer',120000,1000)];const ny=newNYStateReturn();Object.assign(ny,{locality:'none',claimedDependent:'no',taxpayerDob:'1980-01-01',county:'Albany',schoolDistrict:'Albany',schoolCode:'010',foreignAccount:'no',nycLivingQuarters:'no',yonkersLivingQuarters:'no',yonkersWork:'no'});for(const key in ny.review)ny.review[key]=true;Object.assign(ny.mctmt,{source:'Synthetic source: no metropolitan earnings',reviewed:true});ny.useTax.reviewed=true;input.individual.stateReturns=[ny];return {input,ny};
}
const main=result=>result.forms.find(form=>form.form==='f1040').lines;
const unsettled=result=>{assert.equal(result.summary.totalTaxCents,null);assert.equal(result.summary.refundCents,null);assert.equal(result.summary.amountOwedCents,null);};
test('IT-2 federal wage treatments cannot silently retain known AGI or additional tax',()=>{
 for(const change of [row=>row.allocatedTipsCents=10000,row=>row.statutoryEmployee=true,row=>row.dependentCareCents=10000,row=>row.box12=[{code:'W',amountCents:10000}],row=>row.box12=[{code:'T',amountCents:10000}]]){
  const {input,ny}=fixture(),row=newNYWageRecord(input.individual.w2s[0].id);change(row);ny.wageRecords=[row];const before=structuredClone(input),result=calculateIndividual(input);assert.deepEqual(input,before);assert.equal(result.adjustedGrossIncomeKnown,false);assert.equal(result.summary.adjustedGrossIncomeCents,null);assert.equal(main(result)['23'],null);assert.equal(main(result)['25d'],100000);unsettled(result);assert(result.diagnostics.some(item=>item.code==='FEDERAL_W2_TREATMENT_UNRESOLVED'));if(row.statutoryEmployee)assert.equal(main(result)['1a'],null);
 }
 for(const code of ['A','B','M','N','Z']){const {input,ny}=fixture();ny.wageRecords=[{...newNYWageRecord(input.individual.w2s[0].id),box12:[{code,amountCents:10000}]}];const result=calculateIndividual(input);assert.equal(result.adjustedGrossIncomeKnown,true);assert.equal(result.summary.adjustedGrossIncomeCents,12000000);assert.equal(main(result)['23'],null);assert.equal(main(result)['25d'],100000);unsettled(result);}
 const {input,ny}=fixture();ny.wageRecords=[{...newNYWageRecord(input.individual.w2s[0].id),box12:[{code:'D',amountCents:10000}]}];assert(Number.isInteger(calculateIndividual(input).summary.totalTaxCents));
});
test('NY dependents leave federal AGI and ordinary tax known, but all dependent credit and settlement totals unresolved',()=>{
 for(const year of [2023,2024,2025,2026]){const {input,ny}=fixture(year);ny.dependents=[{...newNYDependent(),firstName:'Synthetic',lastName:'Parent',relationship:'parent',taxId:'000000003',dateOfBirth:'1940-01-01'}];const before=structuredClone(input),result=calculateIndividual(input),lines=main(result);assert.deepEqual(input,before);assert.equal(result.adjustedGrossIncomeKnown,true);assert.equal(result.summary.adjustedGrossIncomeCents,12000000);assert(Number.isInteger(result.summary.ordinaryTaxCents));assert(Number.isInteger(lines[year<2025?'12':'12e']));for(const key of ['19','21','22','24','28','32','33','34','35a','37'])assert.equal(lines[key],null,key);assert.equal(lines['25d'],100000);assert.equal(result.summary.paymentsCents,null);unsettled(result);assert(result.diagnostics.some(item=>item.code==='DEPENDENT_NY_RECONCILIATION'));}
});
test('NY claimability requires the federal dependent deduction worksheet without changing income or withholding',()=>{
 for(const year of [2023,2024,2025,2026]){const {input,ny}=fixture(year);ny.claimedDependent='yes';const result=calculateIndividual(input),lines=main(result);assert.equal(result.adjustedGrossIncomeKnown,true);assert.equal(result.summary.adjustedGrossIncomeCents,12000000);for(const key of [year<2025?'12':'12e',year<2025?'13':'13a','14','15','16','18','22','24'])assert.equal(lines[key],null,key);assert.equal(lines['25d'],100000);assert.equal(result.summary.paymentsCents,100000);unsettled(result);assert(result.diagnostics.some(item=>item.code==='STANDARD_STATE_DEPENDENCY_CONFLICT'));}
});
test('NY birth dates cannot replace conflicting reviewed federal facts, including either side of the January1 cutoff',()=>{
 for(const year of [2023,2024,2025,2026])for(const owner of ['taxpayer','spouse'])for(const day of ['01','02']){const {input,ny}=fixture(year);if(owner==='spouse'){input.individual.filingStatus='marriedJoint';Object.assign(input.individual,{spouseName:'Synthetic Spouse',spouseFirstName:'Synthetic',spouseLastName:'Spouse',spouseTaxId:'000000002'});input.individual.w2s[0].wagesCents=20000000;}ny[owner+'Dob']=`${year-64}-01-${day}`;const result=calculateIndividual(input);assert.equal(result.adjustedGrossIncomeKnown,true);assert(result.diagnostics.some(item=>item.code==='STANDARD_STATE_BIRTH_CONFLICT'));assert.equal(result.summary.taxableIncomeCents,null);assert.equal(result.summary.ordinaryTaxCents,null);unsettled(result);}
});
test('deduction uncertainty suppresses QBI and capital loss carryforward limitations while NY AGI remains usable',()=>{
 const {input,ny}=fixture();input.individual.w2s=[];input.individual.businesses=[business('taxpayer',40000)];input.individual.capitalIncome=capitalFixture();input.individual.capitalIncome.shortLossCarryoverCents=1000000;ny.claimedDependent='yes';const result=calculateIndividual(input);assert.equal(result.adjustedGrossIncomeKnown,true);assert.equal(result.forms.some(form=>form.form==='f8995'),false);assert.equal(main(result)['13a'],null);assert.equal(result.summary.shortTermCapitalLossCarryforwardCents,null);assert.equal(result.capitalLossCarryforward.worksheet,null);assert(result.diagnostics.some(item=>item.code==='QBI_STANDARD_DEDUCTION_UNRESOLVED'));const state=calculateNYResident(input,ny,result);assert.equal(state.summary.adjustedGrossIncomeCents,result.summary.adjustedGrossIncomeCents);assert.equal(state.lines['34'],null);assert.equal(state.summary.stateIncomeTaxCents,null);assert(state.diagnostics.some(row=>row.code==='NY_FEDERAL_CLAIMABILITY_CONFLICT'));
});
test('unresolved dependent credit order cannot create allowed energy credits or carryforward',()=>{
 const {input,ny}=fixture();ny.dependents=[newNYDependent()];const energy=input.individual.energyCredits=newEnergyCredits();Object.assign(energy.home,{street:'1 Synthetic St',city:'Albany',state:'NY',zip:'12207'});for(const key in energy.review)energy.review[key]=true;energy.items=[{id:'synthetic-solar',category:'solar',costCents:1000000,qmid:'',source:'Synthetic invoice'}];const result=calculateIndividual(input);assert.equal(result.summary.residentialCleanEnergyCreditCents,null);assert.equal(result.summary.cleanEnergyCarryforwardCents,null);assert.equal(main(result)['19'],null);assert.equal(main(result)['20'],null);assert.equal(main(result)['21'],null);unsettled(result);
});
test('irrelevant or invalid birth dates do not invent an age determination',()=>{
 const {input,ny}=fixture();ny.spouseDob='1940-01-01';ny.taxpayerDob='1950-02-30';let result=calculateIndividual(input);assert(!result.diagnostics.some(item=>item.code==='FEDERAL_AGED_DEDUCTION_UNRESOLVED'));input.individual.stateReturns=[{state:'CT',taxpayerDob:'1940-01-01'}];result=calculateIndividual(input);assert(!result.diagnostics.some(item=>item.code.startsWith('FEDERAL_')));assert(Number.isInteger(result.summary.totalTaxCents));
});
test('annual official PDFs leave dependent-credit and aged-deduction unknowns blank while retaining known income',async()=>{
 const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
 for(const year of [2023,2024,2025])for(const condition of ['dependent','aged']){const {input,ny}=fixture(year);if(condition==='dependent')ny.dependents=[newNYDependent()];else ny.taxpayerDob=`${year-64}-01-01`;const packet=await generateDraftPdf(input,{loadTemplate}),filled=packet.audit.find(item=>item.form==='f1040').filled,unknown=condition==='dependent'?['19','21','22','24','28','32','33','34','35a','37']:[year<2025?'12':'12e',year<2025?'13':'13a',...(year>=2025?['13b']:[]),'14','15','16','18','22','24','34','35a','37'];for(const key of unknown)assert(!filled.some(item=>item.line===key),`${year}/${condition}/${key}`);assert(filled.some(item=>item.line==='1a'));assert(filled.some(item=>item.line==='25a'));assert.match(pdfText(packet.bytes,'-raw'),condition==='dependent'?/New York dependent is missing from federal intake/:/federal birth date and retained New York source birth date differ/);}
});
