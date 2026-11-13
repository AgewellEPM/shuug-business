import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateIndividual} from '../individual.mjs';
import {calculateCTEitc,newCTEarnedIncomeCredit,newCTEitcWage,ctEicZeroChildSupplementUnresolved} from '../state-ct-eitc.mjs';
import {newCTWithholding} from '../state-returns.mjs';
import {ctEitcFixture,ctEitcSourceFixture} from './state-ct-eitc-fixtures.mjs';
import {business,wage} from './fixtures.mjs';
const compute=fixture=>calculateCTEitc(fixture.input,fixture.ct,calculateIndividual(fixture.input));
const has=(result,code)=>result.diagnostics.some(row=>row.code===code);

test('actual federal annual Grey awards feed derived Connecticut base and 2025 supplement',()=>{
 for(const [year,federalCents,baseCents,amountCents]of [[2023,545500,218200,218200],[2024,613100,245200,245200],[2025,649800,259900,284900]]){
  const f=ctEitcFixture({year,children:2,wages:33030,joint:true});f.input.individual.taxableInterestCents=52500;const before=structuredClone(f),result=compute(f);
  assert(result.known,JSON.stringify(result.diagnostics));assert.equal(result.lines['8'],federalCents);assert.equal(result.lines['10'],baseCents);assert.equal(result.amountCents,amountCents);assert.equal(result.lines['15a'],year===2025?25000:undefined);assert.equal(result.forms[0].form,'ct1040eitc');assert.equal(result.forms[0].children.length,2);assert.deepEqual(result.questions,{federalCreditClaimed:true,investmentOverLimit:false,alreadyFiled:false,qualifyingChildren:true,wagesWithoutCtWithholding:true,selfEmployed:false,jointFederalSeparateState:false,supplementChild:year===2025?true:null});assert.deepEqual(f,before);
 }
});
test('childless credits round the exact40% product and never get the child supplement',()=>{
 for(const [wages,expectedFederal,expectedCT]of [[10000,64900,26000],[26200,100,0]]){
  const f=ctEitcFixture({year:2025,children:0,wages,joint:true}),result=compute(f);assert(result.known);assert.equal(result.lines['8'],expectedFederal);assert.equal(result.amountCents,expectedCT);assert.equal(result.lines['15a'],0);assert.equal(result.questions.qualifyingChildren,false);assert.equal(result.forms.length,1);
 }
});
test('original/matching-status/residency and all review fields are actual source gates',()=>{
 for(const mutate of [f=>f.ct.earnedIncomeCredit=newCTEarnedIncomeCredit(),f=>delete f.ct.earnedIncomeCredit,f=>f.ct.earnedIncomeCredit.returnStatus='alreadyFiled',f=>f.ct.earnedIncomeCredit.filingStatus='different',f=>f.ct.residency='partYear',f=>f.ct.review.residency=false,...['residency','federalCredit','children','incomeSources'].map(key=>f=>f.ct.earnedIncomeCredit.review[key]=false)]){
  const f=ctEitcFixture();mutate(f);const result=compute(f);assert.equal(result.amountCents,null);assert.equal(result.forms.length,0);assert(result.diagnostics.length>0);
 }
});
test('all wage links, original IDs, source decisions and withholding must reconcile',()=>{
 for(const mutate of [f=>f.ct.earnedIncomeCredit.wageSources=[],f=>f.ct.earnedIncomeCredit.wageSources[0].w2Id='removed',f=>f.ct.earnedIncomeCredit.wageSources[0].employerFederalId='',f=>f.ct.earnedIncomeCredit.wageSources[0].reviewed=false,f=>f.ct.earnedIncomeCredit.wageSources[0].stateIdStatus='unknown',f=>f.ct.earnedIncomeCredit.wageSources[0].employerStateId='contradiction',f=>f.ct.earnedIncomeCredit.wageSources[0].ctWithholdingCents=10000]){
  const f=ctEitcFixture();mutate(f);const result=compute(f);assert.equal(result.amountCents,null);assert(result.diagnostics.length>0);
 }
 const f=ctEitcFixture(),source=f.ct.earnedIncomeCredit.wageSources[0];source.ctWithholdingCents=10000;source.stateIdStatus='provided';source.employerStateId='CT123';f.ct.withholdings=[{...newCTWithholding(),payer:'Synthetic employer',payerId:source.employerFederalId,wagesCents:3303000,withholdingCents:10000,source:'Synthetic CT W-2',reviewed:true}];const result=compute(f);assert(result.known);assert.equal(result.questions.wagesWithoutCtWithholding,false);assert.equal(result.printedWageSources.length,0);
 source.ctWithholdingCents=10001;assert(has(compute(f),'CT_EITC_WITHHOLDING_RECONCILIATION'));
 source.ctWithholdingCents=0;assert(has(compute(f),'CT_EITC_WITHHOLDING_CONFLICT'));
});
test('Schedule C profits and owner identifiers come from actual calculated forms',()=>{
 const f=ctEitcFixture({children:0,wages:0,joint:false});f.input.individual.businesses=[business('taxpayer',10000)];f.ct.earnedIncomeCredit=ctEitcSourceFixture(f.input);let result=compute(f);assert(result.known,JSON.stringify(result.diagnostics));assert.equal(result.businessSources[0].incomeCents,1000000);assert.equal(result.businessSources[0].federalId,f.input.party.taxId.replaceAll('-',''));assert.equal(result.questions.selfEmployed,true);
 f.input.individual.businesses[0].ein='00-1234567';result=compute(f);assert.equal(result.businessSources[0].federalId,'001234567');
 f.ct.earnedIncomeCredit.businessSources[0].businessId='missing';assert.equal(compute(f).amountCents,null);
});
test('unknown, stale-year and changed federal child sources cannot produce a CT credit',()=>{
 const f=ctEitcFixture(),federal=calculateIndividual(f.input);for(const mutate of [r=>r.earnedIncomeCredit.amountCents=null,r=>r.earnedIncomeCredit.worksheet.year=2024,r=>r.earnedIncomeCredit.eligibility.known=false,r=>r.summary.earnedIncomeCreditCents++,r=>r.earnedIncomeCredit.eligibility.creditChildren[0].dateOfBirth='2001-01-01']){const changed=structuredClone(federal);mutate(changed);assert.equal(calculateCTEitc(f.input,f.ct,changed).amountCents,null);}
 f.input.year=2026;assert(has(calculateCTEitc(f.input,f.ct,federal),'CT_EITC_YEAR_UNAVAILABLE'));
});
test('valid-SSN child identities, relationship codes and actual federal checkboxes are preserved',()=>{
 const f=ctEitcFixture({children:4});f.input.individual.dependents[0].middleInitial='Q';f.input.individual.dependents[0].relationship='sibling';const second=f.input.individual.dependents[1];second.dateOfBirth='2003-06-15';second.studentMonths=5;const third=f.input.individual.dependents[2];third.dateOfBirth='1990-06-15';third.permanentlyDisabled='yes';const result=compute(f);assert(result.known,JSON.stringify(result.diagnostics));assert.equal(result.children.length,4);assert.equal(result.forms[0].children.length,4);assert.equal(result.children[0].middleInitial,'Q');assert.equal(result.children[0].relationshipCode,5);assert.equal(result.children[0].student,false);assert.equal(result.children[1].student,true);assert.equal(result.children[1].disabled,false);assert.equal(result.children[2].student,false);assert.equal(result.children[2].disabled,true);assert.equal(result.children[3].months,12);
});
test('zero-table and self-only/no-valid-child-SSN supplement cases remain unresolved',()=>{
 for(const wages of [57550,57553]){const f=ctEitcFixture({children:1,wages,joint:true});f.input.individual.dependents[0].claim='no';const federal=calculateIndividual(f.input);assert(ctEicZeroChildSupplementUnresolved(2025,federal.earnedIncomeCredit));const result=calculateCTEitc(f.input,f.ct,federal);assert.equal(result.amountCents,null);assert(has(result,'CT_EIC_ZERO_CHILD_SUPPLEMENT_REVIEW'));}
 const high=ctEitcFixture({children:1,wages:57554,joint:true});assert.equal(compute(high).amountCents,0);
 for(const wages of [10000,19100,19103,19104,24210]){const f=ctEitcFixture({children:1,wages,joint:false}),row=f.input.individual.dependents[0];row.identifier.type='itin';row.identifier.validForEmployment='no';const result=compute(f);if(wages<19104){assert.equal(result.amountCents,null);assert(has(result,'CT_EITC_CHILD_SSN_TREATMENT'));}else assert.equal(result.amountCents,0);}
});
test('source overflow and mixed withholding retain every row without an invented continuation',()=>{
 const f=ctEitcFixture({children:0,wages:0,joint:false});f.input.individual.w2s=Array.from({length:4},(_,n)=>({...wage('taxpayer',2500),id:'wage-'+n}));f.ct.earnedIncomeCredit=ctEitcSourceFixture(f.input);let result=compute(f);assert.equal(result.amountCents,null);assert.equal(result.wageSources.length,4);assert.equal(result.printedWageSources.length,4);assert(has(result,'CT_EITC_INCOME_CONTINUATION'));
 f.input.individual.w2s.pop();f.ct.earnedIncomeCredit=ctEitcSourceFixture(f.input);const source=f.ct.earnedIncomeCredit.wageSources[0];source.ctWithholdingCents=10000;f.ct.withholdings=[{...newCTWithholding(),payer:'Synthetic',payerId:source.employerFederalId,wagesCents:250000,withholdingCents:10000,source:'Synthetic CT W-2',reviewed:true}];result=compute(f);assert.equal(result.amountCents,null);assert.equal(result.wageSources.length,3);assert(has(result,'CT_EITC_MIXED_WITHHOLDING_REVIEW'));
});
test('duplicate source links and invented amount overrides are rejected',()=>{
 const f=ctEitcFixture();f.ct.earnedIncomeCredit.wageSources.push({...f.ct.earnedIncomeCredit.wageSources[0]});assert.throws(()=>compute(f),/distinct/);f.ct.earnedIncomeCredit=ctEitcSourceFixture(f.input);f.ct.earnedIncomeCredit.amountCents=1;assert.throws(()=>compute(f),/unsupported field/);
});
test('withholding reconciliation is independent of row order and retains zero-wage sources',()=>{
 const f=ctEitcFixture({children:0,wages:0,joint:true});f.input.individual.w2s=[{...wage('taxpayer',5000),id:'zero-ct'},{...wage('spouse',5000),id:'positive-ct'},{...wage('taxpayer',0),id:'zero-wage'}];f.ct.earnedIncomeCredit=ctEitcSourceFixture(f.input);for(const row of f.ct.earnedIncomeCredit.wageSources)row.employerFederalId='001122300';f.ct.earnedIncomeCredit.wageSources[1].ctWithholdingCents=10000;f.ct.withholdings=[{...newCTWithholding(),payer:'Synthetic shared employer',payerId:'001122300',wagesCents:500000,withholdingCents:10000,source:'Synthetic actual withheld source',reviewed:true}];
 for(const reversed of [false,true]){if(reversed)f.ct.earnedIncomeCredit.wageSources.reverse();const result=compute(f);assert.equal(result.wageSources.length,3);assert.equal(result.printedWageSources.length,1);assert(has(result,'CT_EITC_MIXED_WITHHOLDING_REVIEW'));assert(!has(result,'CT_EITC_WITHHOLDING_CONFLICT'));assert(!has(result,'CT_EITC_WITHHOLDING_RECONCILIATION'));}
 // A zero-dollar W-2 does not manufacture the mixed-income branch.
 f.input.individual.w2s=f.input.individual.w2s.filter(row=>row.id!=='zero-ct');f.ct.earnedIncomeCredit.wageSources=f.ct.earnedIncomeCredit.wageSources.filter(row=>row.w2Id!=='zero-ct');const result=compute(f);assert(result.known,JSON.stringify(result.diagnostics));assert.equal(result.wageSources.length,2);assert.equal(result.printedWageSources.length,0);
});
