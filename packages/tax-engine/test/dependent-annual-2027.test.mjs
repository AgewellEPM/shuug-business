import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateDependents} from '../dependents.mjs';
import {calculateChildCredits,childCreditEicStatus} from '../child-credits.mjs';
import {earnedIncomeCredit} from '../earned-income-credit.mjs';
import {standardDeduction} from '../standard-deduction.mjs';
import {childFixture,childContext} from './child-credits-fixtures.mjs';
import {eligibilityFixture} from './standard-deduction-fixtures.mjs';

// Independent synthetic arithmetic from released Rev. Proc. 2026-35
// §§3.05,3.06,3.15,3.25; these are not IRS-published taxpayer examples.
test('2027 deduction amounts, dependent breakpoints and age/blindness additions use the new annual law',()=>{
 const calc=(value,filingStatus='single',wagesCents=0)=>standardDeduction(value,{year:2027,filingStatus,wagesCents,businessProfitCents:0,seAdjustmentCents:0,incomeKnown:true});
 for(const [status,expected]of [['single',1660000],['marriedSeparate',1660000],['marriedJoint',3320000],['survivingSpouse',3320000],['headOfHousehold',2492500]])assert.equal(calc(eligibilityFixture(),status).deductionCents,expected);
 let value=eligibilityFixture();value.taxpayer.dateOfBirth='1963-01-01';assert.equal(calc(value).deductionCents,1870000);value.taxpayer.blind='yes';assert.equal(calc(value).deductionCents,2080000);
 value.spouse.dateOfBirth='1960-02-01';assert.equal(calc(value,'marriedJoint').deductionCents,3830000);
 value=eligibilityFixture();value.taxpayer.canBeClaimed='yes';for(const [wages,expected]of [[0,140000],[89900,140000],[90000,140000],[90100,140100],[1610000,1660000],[2000000,1660000]])assert.equal(calc(value,'single',wages).deductionCents,expected);
 value.taxpayer.blind='yes';assert.equal(calc(value).deductionCents,350000);value.review.earnedIncome=false;assert.equal(calc(value).deductionCents,null);
});

test('2027 relative source limit is strict and cannot silently retain the 2026 ceiling',()=>{
 const input=childFixture({year:2027});const row=input.individual.dependents[0];Object.assign(row,{relationship:'parent',dateOfBirth:'1950-06-15',grossIncomeCents:549999});
 let dependents=calculateDependents(input);assert.equal(dependents.known,true);assert.equal(dependents.odcCount,1);assert.equal(calculateChildCredits(input,childContext()).nonrefundableCents,50000);
 row.grossIncomeCents=550000;dependents=calculateDependents(input);assert.equal(dependents.known,false);assert.equal(dependents.odcCount,null);assert.equal(calculateChildCredits(input,childContext()).nonrefundableCents,null);
 input.year=2026;row.grossIncomeCents=530000;assert.equal(calculateDependents(input).known,false);
});

test('2027 CTC phaseout, ACTC cap and ordinary earnings retain missing-source gates',()=>{
 for(const joint of [false,true]){const input=childFixture({year:2027,joint});const start=joint?40000000:20000000;
  for(const [agi,expected]of [[start,230000],[start+100,225000],[start+4599900,0],[start+4600000,0]])assert.equal(calculateChildCredits(input,{...childContext(),adjustedGrossIncomeCents:agi}).nonrefundableCents,expected);
  const credit=calculateChildCredits(input,{...childContext(),taxBeforeCreditsCents:0});assert.equal(credit.refundableCents,180000);assert(credit.diagnostics.some(row=>row.code==='CHILD_CREDIT_2027_ANNUAL'));
  input.individual.dependents[0].identifier.issuedByDueDate='unknown';assert.equal(calculateChildCredits(input,childContext()).refundableCents,null);
 }
 const input=childFixture({year:2027,wages:10000});assert.equal(calculateChildCredits(input,{...childContext(10000),taxBeforeCreditsCents:0,eicCents:null}).refundableCents,112500);
 input.individual.childCredits.review.earnedIncome=false;assert.equal(calculateChildCredits(input,{...childContext(10000),taxBeforeCreditsCents:0,eicCents:null}).refundableCents,null);
});

test('2027 possible EIC stays unknown below new limits, including the exported child-credit fallback',()=>{
 for(const [joint,maximum]of [[false,6500200],[true,7251200]]){const input=childFixture({year:2027,joint,wages:10000});
  for(const [agi,expected]of [[maximum-100,null],[maximum,0]]){
   assert.equal(earnedIncomeCredit(input,{...childContext(10000),adjustedGrossIncomeCents:agi}).amountCents,expected);
   assert.equal(childCreditEicStatus(input,{adjustedGrossIncomeCents:agi,earnedIncomeCents:1000000}).amountCents,expected);
  }
  input.individual.childCredits.nontaxableCombatPayCents=8000000;assert.equal(childCreditEicStatus(input,{adjustedGrossIncomeCents:1000000,earnedIncomeCents:9000000}).amountCents,null);
 }
});
