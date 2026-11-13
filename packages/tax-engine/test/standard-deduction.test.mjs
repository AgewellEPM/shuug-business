import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {standardDeduction,eligibilityAge,newIndividualEligibility,standardDeductionAnnual} from '../standard-deduction.mjs';
import {eligibilityFixture} from './standard-deduction-fixtures.mjs';
const reference=JSON.parse(readFileSync(new URL('./standard-deduction-reference.json',import.meta.url)));
const calc=(value,options={})=>standardDeduction(value,{year:2025,filingStatus:'single',incomeKnown:true,...options});
for(const year of [2023,2024,2025])test(`${year} published IRS Pub501 married and dependent examples`,()=>{
 const examples=reference.publishedExamples[year],value=eligibilityFixture();assert.equal(calc(value,{year,filingStatus:'marriedJoint'}).deductionCents,examples.married.ordinary*100);
 value.taxpayer.blind='yes';assert.equal(calc(value,{year,filingStatus:'marriedJoint'}).deductionCents,examples.married.oneBlind*100);value.taxpayer.blind='no';for(const owner of ['taxpayer','spouse'])value[owner].dateOfBirth=`${year-70}-02-14`;assert.equal(calc(value,{year,filingStatus:'marriedJoint'}).deductionCents,examples.married.bothAge65*100);
 for(const row of examples.dependent){const value=eligibilityFixture();value.taxpayer.dateOfBirth=`${year-18}-01-15`;value.taxpayer.canBeClaimed='yes';value.taxpayer.blind=row.blind?'yes':'no';const result=calc(value,{year,filingStatus:row.filingStatus,wagesCents:row.wagesDollars*100,businessProfitCents:(row.businessDollars??0)*100});assert.equal(result.deductionCents,row.deductionDollars*100,JSON.stringify(row));}
});
test('all annual status/age/blindness combinations and dependent floor/cap endpoints',()=>{
 for(const year of [2023,2024,2025,2026])for(const status of ['single','marriedJoint','marriedSeparate','headOfHousehold','survivingSpouse']){
  const value=eligibilityFixture(),base=calc(value,{year,filingStatus:status}).deductionCents,annual=standardDeductionAnnual[year],unit=['single','headOfHousehold'].includes(status)?annual.unmarriedAdditionCents:annual.marriedAdditionCents;
  value.taxpayer.dateOfBirth=`${year-64}-01-01`;value.taxpayer.blind='yes';let result=calc(value,{year,filingStatus:status});assert.equal(result.deductionCents,base+2*unit);assert.equal(result.worksheet.boxCount,2);value.taxpayer.canBeClaimed='yes';
  for(const earned of [0,annual.dependentFloorCents-annual.earnedAdditionCents-100,annual.dependentFloorCents-annual.earnedAdditionCents,annual.dependentFloorCents-annual.earnedAdditionCents+100,base-annual.earnedAdditionCents,base*2]){result=calc(value,{year,filingStatus:status,wagesCents:earned});assert.equal(result.deductionCents,Math.min(base,Math.max(annual.dependentFloorCents,earned+annual.earnedAdditionCents))+2*unit);}
 }
});
test('January1 birthdays and deceased-person day-before-birthday rule use the actual year',()=>{
 for(const year of [2023,2024,2025,2026]){const value=eligibilityFixture();value.taxpayer.dateOfBirth=`${year-64}-01-01`;assert.equal(eligibilityAge(value.taxpayer,year).age65,true);value.taxpayer.dateOfBirth=`${year-64}-01-02`;assert.equal(eligibilityAge(value.taxpayer,year).age65,false);
  value.taxpayer.dateOfBirth=`${year-65}-02-14`;value.taxpayer.deceased='yes';value.taxpayer.dateOfDeath=`${year}-02-13`;assert.equal(eligibilityAge(value.taxpayer,year).age65,true);value.taxpayer.dateOfDeath=`${year}-02-12`;assert.equal(eligibilityAge(value.taxpayer,year).age65,false);value.returnPeriod='deathShortYear';assert.equal(calc(value,{year}).known,true);value.taxpayer.dateOfDeath=`${year-1}-02-12`;assert.equal(calc(value,{year}).known,false);
 }
});
test('dependent earned income includes business losses and deducts actual SE adjustment; unresolved sources stay unknown',()=>{
 const value=eligibilityFixture();value.taxpayer.canBeClaimed='yes';let result=calc(value,{wagesCents:700000,businessProfitCents:300000,seAdjustmentCents:21195});assert.equal(result.earnedIncomeCents,978800);assert.equal(result.deductionCents,1023800);
 result=calc(value,{wagesCents:10000,businessProfitCents:-500000});assert.equal(result.earnedIncomeCents,-490000);assert.equal(result.deductionCents,135000);assert.equal(calc(value,{incomeKnown:false}).deductionCents,null);value.review.earnedIncome=false;assert.equal(calc(value).deductionCents,null);
 value.review.earnedIncome=true;value.taxpayer.canBeClaimed='no';value.spouse.canBeClaimed='yes';assert.equal(calc(value,{filingStatus:'marriedJoint',wagesCents:400000}).deductionCents,445000);assert.equal(calc(value,{filingStatus:'single'}).deductionCents,1575000);
});
test('separate-spouse additions require all three source conditions; surviving spouse uses only taxpayer boxes',()=>{
 const value=eligibilityFixture();value.spouse.dateOfBirth='1950-01-01';value.spouse.blind='yes';assert.equal(calc(value,{filingStatus:'marriedSeparate'}).deductionCents,1575000);value.spouse.noGrossIncome='yes';value.spouse.filingReturn='no';assert.equal(calc(value,{filingStatus:'marriedSeparate'}).deductionCents,1895000);value.spouse.canBeClaimed='yes';assert.equal(calc(value,{filingStatus:'marriedSeparate'}).deductionCents,1575000);value.spouse.canBeClaimed='unknown';assert.equal(calc(value,{filingStatus:'marriedSeparate'}).deductionCents,null);assert.equal(calc(value,{filingStatus:'survivingSpouse'}).deductionCents,3150000);
 value.spouseItemizes='yes';const result=calc(value,{filingStatus:'marriedSeparate'});assert.equal(result.deductionCents,null);assert(result.diagnostics.some(row=>row.code==='STANDARD_SPOUSE_ITEMIZES'));
});
test('missing facts, inconsistent NY sources and unsupported status/period/residency never become ordinary assumptions',()=>{
 assert.equal(calc(undefined).deductionCents,null);assert.equal(calc(newIndividualEligibility()).deductionCents,null);
 for(const [key,value]of [['residency','dualStatus'],['residency','nonresident'],['returnPeriod','accountingShortYear'],['returnPeriod','deathShortYear'],['deductionChoice','itemized'],['deductionChoice','unknown']]){const input=eligibilityFixture();input[key]=value;assert.equal(calc(input).deductionCents,null,key);}
 for(const key of ['blind','canBeClaimed','deceased']){const value=eligibilityFixture();value.taxpayer[key]='unknown';assert.equal(calc(value).deductionCents,null,key);}
 for(const changes of [{dateOfBirth:'2025-02-30'},{dateOfBirth:'2026-01-01'},{source:''},{reviewed:false},{dateOfDeath:'2025-02-01'}]){const value=eligibilityFixture();Object.assign(value.taxpayer,changes);assert.equal(calc(value).deductionCents,null);}
 const value=eligibilityFixture(),ny={state:'NY',taxpayerDob:value.taxpayer.dateOfBirth,claimedDependent:'no'};assert.equal(calc(value,{stateReturns:[ny]}).known,true);ny.taxpayerDob='1991-01-01';assert.equal(calc(value,{stateReturns:[ny]}).known,false);ny.taxpayerDob=value.taxpayer.dateOfBirth;ny.claimedDependent='yes';assert.equal(calc(value,{stateReturns:[ny]}).known,false);value.taxpayer.canBeClaimed='yes';assert.equal(calc(value,{stateReturns:[ny]}).known,true);
 assert.throws(()=>calc({...value,arbitraryOverrideCents:1}),/unsupported field/);value.taxpayer.blind=false;assert.throws(()=>calc(value),/yes, no or unknown/);
});
