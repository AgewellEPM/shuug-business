import test from 'node:test';import assert from 'node:assert/strict';
import {newEicAward,newEicChild,newEicCombatSource,validateEicAward} from '../eic-model.mjs';
import {eicEligibility,eicFilerAge} from '../eic-eligibility.mjs';
import {eicFixture,eicAwardFixture} from './eic-fixtures.mjs';
import {dependentFixture,identifierFixture} from './child-credits-fixtures.mjs';
import {eligibilityFixture} from './standard-deduction-fixtures.mjs';
import {wage} from './fixtures.mjs';
const calc=input=>eicEligibility(input,input.individual.earnedIncomeCredit.award),codes=result=>result.diagnostics.map(row=>row.code);

test('optional old records do not become an award; strict source defaults are unknown',()=>{
 const input=eicFixture();delete input.individual.earnedIncomeCredit.award;assert.equal(calc(input).known,false);input.individual.earnedIncomeCredit.award=newEicAward();assert.equal(calc(input).eligible,null);assert.equal(validateEicAward(newEicAward()).scope.earnedSources,'unknown');
 input.individual.earnedIncomeCredit.award.overrideCents=50000;assert.throws(()=>calc(input),/unsupported field/);
});
for(const year of [2023,2024,2025])test(`${year} actual EIC qualifying children ignore dependent claim and own support`,()=>{
 const input=eicFixture({year});const child=input.individual.dependents[0];child.claim='no';child.ownSupportCents=child.totalSupportCents;child.taxpayerSupportCents=0;child.review.support=false;child.review.grossIncome=false;
 const result=calc(input);assert.equal(result.known,true);assert.equal(result.eligible,true);assert.equal(result.allQualifyingChildren.length,2);assert.equal(result.creditChildren.length,2);assert.equal(result.attachmentChildren.length,2);
});
test('childless age25 uses day before birthday and age65 uses birthday for each annual year',()=>{
 for(const year of [2023,2024,2025])for(const [dob,expected]of [[`${year-24}-01-01`,true],[`${year-24}-01-02`,false],[`${year-65}-12-31`,false],[`${year-64}-01-01`,true]]){
  const input=eicFixture({year,children:0,joint:false});input.individual.eligibility.taxpayer.dateOfBirth=dob;const result=calc(input);assert.equal(result.known,true);assert.equal(result.eligible,expected,`${year}/${dob}`);assert.equal(result.filerFacts.noCreditIndicator,false);
 }
 const person=eligibilityFixture().taxpayer;person.deceased='yes';person.dateOfBirth='2000-02-14';person.dateOfDeath='2025-02-13';assert.equal(eicFilerAge(person,2025).eligible,true);person.dateOfDeath='2025-02-12';assert.equal(eicFilerAge(person,2025).eligible,false);person.dateOfBirth='1960-11-01';person.dateOfDeath='2025-08-01';assert.equal(eicFilerAge(person,2025).eligible,true);
});
test('joint childless branch needs only one known qualifying age and skips nonjoint claimant questions',()=>{
 const input=eicFixture({children:0});input.individual.eligibility.taxpayer.dateOfBirth='2010-06-15';input.individual.eligibility.spouse.dateOfBirth='1990-06-15';for(const person of Object.values(input.individual.earnedIncomeCredit.award.persons)){person.qualifyingChildOfAnother='unknown';person.review.otherClaims=false;}
 assert.equal(calc(input).eligible,true);input.individual.eligibility.spouse.dateOfBirth='';assert.equal(calc(input).eligible,null);input.individual.eligibility.taxpayer.dateOfBirth='1990-06-15';assert.equal(calc(input).eligible,true);
 input.individual.eligibility.taxpayer.canBeClaimed='yes';assert(codes(calc(input)).includes('EIC_JOINT_DEPENDENCY_CONFLICT'));
});
test('no-valid-SSN qualifying child uses the child eligibility branch and one attachment row',()=>{
 const input=eicFixture({children:2,joint:false});input.individual.eligibility.taxpayer.dateOfBirth='2004-06-15';for(const row of input.individual.dependents)row.identifier={...identifierFixture(),type:'itin',validForEmployment:'no'};
 let result=calc(input);assert.equal(result.eligible,true);assert.equal(result.allQualifyingChildren.length,2);assert.equal(result.creditChildren.length,0);assert.equal(result.attachmentChildren.length,1);
 input.individual.dependents[1].identifier=identifierFixture();result=calc(input);assert.deepEqual(result.attachmentChildren.map(row=>row.id),[input.individual.dependents[1].id]);
 const child=input.individual.dependents[0];child.taxId='';child.identifier={...identifierFixture(),type:'unknown',issuedByDueDate:'no',validForEmployment:'unknown'};assert.equal(calc(input).known,true);child.identifier.issuedByDueDate='unknown';assert.equal(calc(input).known,false);
});
test('all retained possible children require source review; linked claims cannot hide a child or tiebreaker',()=>{
 const input=eicFixture({children:1});input.individual.earnedIncomeCredit.award.children=[];assert.equal(calc(input).known,false);input.individual.earnedIncomeCredit.award=eicAwardFixture(input);
 const fact=input.individual.earnedIncomeCredit.award.children[0];fact.claim='otherPerson';assert.equal(calc(input).known,false);fact.claim='taxpayer';fact.competingClaim='tieBreaker';assert.equal(calc(input).known,false);fact.competingClaim='none';input.individual.dependents[0].competingClaim='custodialRelease';assert.equal(calc(input).known,false);
 input.individual.dependents[0].competingClaim='none';input.individual.dependents[0].review.residency=false;assert.equal(calc(input).known,false);
});
test('ordinary known failed child tests may be excluded, while relevant unknown age and exception facts remain unresolved',()=>{
 const input=eicFixture({children:1,joint:false});const row=input.individual.dependents[0];row.relationship='parent';row.dateOfBirth='1950-01-01';input.individual.earnedIncomeCredit.award.children=[];assert.equal(calc(input).known,true);assert.equal(calc(input).allQualifyingChildren.length,0);
 row.relationship='child';row.dateOfBirth='2015-01-01';row.residencyException='bornOrDied';assert.equal(calc(input).known,false);row.residencyException='none';row.usResidencyDays=180;assert.equal(calc(input).known,true);row.usResidencyDays=365;row.dateOfBirth='2025-11-01';assert(codes(calc(input)).includes('EIC_CHILD_BIRTH_RESIDENCY_CONFLICT'));
});
test('older disabled children and student-younger children retain the exact Schedule EIC branch',()=>{
 const input=eicFixture({children:1});const row=input.individual.dependents[0];row.dateOfBirth='1980-01-01';row.permanentlyDisabled='yes';let result=calc(input);assert.equal(result.eligible,true);assert.equal(result.allQualifyingChildren[0].younger,false);assert.equal(result.allQualifyingChildren[0].disabled,true);
 row.permanentlyDisabled='no';row.dateOfBirth='2002-01-01';row.studentMonths=5;result=calc(input);assert.equal(result.eligible,true);assert.equal(result.allQualifyingChildren[0].studentYounger,true);row.studentMonths=4;assert.equal(calc(input).allQualifyingChildren.length,0);
});
test('reviewed month sources reconcile residence days; more than three children preserve all source rows',()=>{
 const input=eicFixture({children:4}),facts=input.individual.earnedIncomeCredit.award.children;let result=calc(input);assert.equal(result.allQualifyingChildren.length,4);assert.equal(result.attachmentChildren.length,3);
 facts[0].usHomeMonths=7;assert(codes(calc(input)).includes('EIC_CHILD_MONTH_SOURCE'));input.individual.dependents[0].residencyDays=184;input.individual.dependents[0].usResidencyDays=184;assert.equal(calc(input).known,true);facts[0].usHomeMonths=6;assert.equal(calc(input).known,false);
});
test('contradictory reviewed child residence cannot become a known childless award',()=>{
 for(const days of [0,180,182]){
  const input=eicFixture({children:1,joint:false,wages:10000}),row=input.individual.dependents[0],fact=input.individual.earnedIncomeCredit.award.children[0];row.residencyDays=days;row.usResidencyDays=days;
  const result=calc(input);assert.equal(result.known,false);assert.equal(result.eligible,null);assert(codes(result).includes('EIC_CHILD_RESIDENCE_CONFLICT'));
  fact.usHomeMonths=days?6:0;assert.equal(calc(input).known,true);assert.equal(calc(input).allQualifyingChildren.length,0);
 }
});
test('independently qualifying disabled child retains unresolved Schedule EIC age branches',()=>{
 const input=eicFixture({children:1,joint:false}),row=input.individual.dependents[0];row.permanentlyDisabled='yes';row.studentMonths=5;input.individual.eligibility.taxpayer.dateOfBirth='';
 let result=calc(input),child=result.attachmentChildren[0];assert.equal(result.eligible,true);assert.equal(child.younger,null);assert.equal(child.under19Younger,null);assert.equal(child.studentYounger,null);assert.equal(child.disabled,true);
 row.dateOfBirth='2002-01-01';result=calc(input);child=result.attachmentChildren[0];assert.equal(result.eligible,true);assert.equal(child.under19Younger,false);assert.equal(child.studentYounger,null);
 row.studentMonths=4;child=calc(input).attachmentChildren[0];assert.equal(child.studentYounger,false);
});
test('married EIC children require the existing sourced dependency calculation, not only the joint-return test',()=>{
 for(const year of [2023,2024,2025]){
  const input=eicFixture({year,children:1,joint:false}),row=input.individual.dependents[0],fact=input.individual.earnedIncomeCredit.award.children[0];
  delete fact.maritalStatus;assert(codes(calc(input)).includes('EIC_CHILD_MARITAL_SOURCE'));fact.maritalStatus='married';row.jointReturn='refundOnly';assert.equal(calc(input).eligible,true);
  row.ownSupportCents=row.totalSupportCents;row.taxpayerSupportCents=0;assert(codes(calc(input)).includes('EIC_MARRIED_CHILD_DEPENDENCY'));row.ownSupportCents=0;row.taxpayerSupportCents=row.totalSupportCents;assert.equal(calc(input).eligible,true);
  row.claim='no';assert.equal(calc(input).eligible,null);row.claim='yes';row.review.support=false;assert.equal(calc(input).eligible,null);
  row.review.support=true;fact.maritalStatus='unmarried';assert(codes(calc(input)).includes('EIC_CHILD_MARITAL_CONFLICT'));row.jointReturn='no';assert.equal(calc(input).eligible,true);
 }
});
test('single filer claimant exceptions use the other actual return purpose, including self-supporting qualifying children',()=>{
 const input=eicFixture({children:0,joint:false}),person=input.individual.earnedIncomeCredit.award.persons.taxpayer;person.qualifyingChildOfAnother='yes';assert.equal(calc(input).known,false);person.qualifyingChildClaimantReturn='requiredOrOtherPurpose';let result=calc(input);assert.equal(result.eligible,false);assert.equal(result.filerFacts.noCreditIndicator,true);
 for(const exception of ['notRequiredNoReturn','notRequiredRefundOnly']){person.qualifyingChildClaimantReturn=exception;assert.equal(calc(input).eligible,true);}
 person.qualifyingChildOfAnother='no';input.individual.eligibility.taxpayer.canBeClaimed='yes';assert.equal(calc(input).known,false);person.dependencyClaimantReturn='requiredOrOtherPurpose';result=calc(input);assert.equal(result.eligible,false);assert.equal(result.filerFacts.noCreditIndicator,false);person.dependencyClaimantReturn='notRequiredRefundOnly';assert.equal(calc(input).eligible,true);
});
test('separated-spouse ordinary conditions require an actual qualifying child and consistent marital evidence',()=>{
 const input=eicFixture({joint:false,children:1});input.individual.filingStatus='marriedSeparate';const marital=input.individual.earnedIncomeCredit.award.marital;Object.assign(marital,{status:'married',lastSixMonthsApart:'yes'});let result=calc(input);assert.equal(result.eligible,true);assert.equal(result.filerFacts.separatedSpouse,true);
 marital.livedApartAtYearEnd='no';assert.equal(calc(input).known,false);Object.assign(marital,{lastSixMonthsApart:'no',separatedUnderStateLaw:'yes',livedApartAtYearEnd:'yes'});assert.equal(calc(input).eligible,true);marital.separatedUnderStateLaw='no';assert.equal(calc(input).eligible,false);marital.lastSixMonthsApart='unknown';assert.equal(calc(input).known,false);
 input.individual.dependents=[];input.individual.earnedIncomeCredit.award.children=[];marital.lastSixMonthsApart='yes';assert.equal(calc(input).eligible,false);
});
test('each joint childless filer needs a U.S. main home and each applicable person needs affirmative annual residency',()=>{
 const input=eicFixture({children:0}),award=input.individual.earnedIncomeCredit.award;award.persons.spouse.usHomeDays=182;let result=calc(input);assert.equal(result.eligible,false);assert.equal(result.filerFacts.mainHomeUS,false);assert.equal(result.filerFacts.noCreditIndicator,true);award.persons.spouse.usHomeDays=183;assert.equal(calc(input).eligible,true);
 award.persons.spouse.citizenshipResidence='unknown';assert.equal(calc(input).known,false);award.persons.spouse.citizenshipResidence='other';assert.equal(calc(input).known,false);award.persons.spouse.citizenshipResidence='fullYearCitizenOrResident';input.individual.eligibility.residency='dualStatus';assert(codes(calc(input)).includes('EIC_SHARED_RESIDENCY_CONFLICT'));
});
test('shared and state identity conflicts gate only relevant age/classification outcomes',()=>{
 const input=eicFixture({children:0,joint:false});input.individual.stateReturns=[{state:'NY',taxpayerDob:'2010-01-01',claimedDependent:'no',dependents:[]}];assert.equal(calc(input).known,false);input.individual.stateReturns[0].taxpayerDob='1991-01-01';assert.equal(calc(input).eligible,true);input.individual.stateReturns[0].claimedDependent='yes';assert.equal(calc(input).known,false);
 const child=eicFixture({children:1,joint:false});child.individual.stateReturns=[{state:'NY',dependents:[{...child.individual.dependents[0],relationship:'parent'}]}];assert(codes(calc(child)).includes('EIC_STATE_CHILD_CONFLICT'));
 child.individual.stateReturns[0].dependents[0].relationship='daughter';assert.equal(calc(child).eligible,true);child.individual.stateReturns[0].taxpayerDob='2020-01-01';assert(codes(calc(child)).includes('EIC_CHILD_PARENT_AGE'));
});
test('filer and dependent duplicate IDs cannot establish a known EIC award',()=>{
 const input=eicFixture();input.individual.spouseTaxId=input.party.taxId;assert(codes(calc(input)).includes('EIC_FILER_IDENTIFIER_CONFLICT'));input.individual.spouseTaxId='000123457';input.individual.dependents[1].taxId='000-12-3460';assert.throws(()=>calc(input),/identifier repeats/);
 const single=eicFixture({joint:false});single.individual.taxpayerIdentifiers.taxpayer.type='itin';const result=calc(single);assert.equal(result.eligible,false);assert.equal(result.filerFacts.noCreditIndicator,true);
});
test('combat sources are owner-specific, reconcile retained W-2 codeQ and aggregates, and do not select elections',()=>{
 const input=eicFixture(),award=input.individual.earnedIncomeCredit.award;input.individual.w2s.push(wage('spouse',1000));award.combatSources=[{...newEicCombatSource('w2-taxpayer','taxpayer'),amountCents:100000,source:'Synthetic W-2 code Q taxpayer',reviewed:true},{...newEicCombatSource('w2-spouse','spouse'),amountCents:200000,source:'Synthetic W-2 code Q spouse',reviewed:true}];input.individual.earnedIncomeCredit.nontaxableCombatPayCents=300000;input.individual.childCredits.nontaxableCombatPayCents=300000;
 let result=calc(input);assert.equal(result.eligible,true);assert.equal(result.filerFacts.combatKnown,true);assert.deepEqual(result.filerFacts.combatByOwner,{taxpayer:100000,spouse:200000});assert.equal(award.combatElections.taxpayer,'unknown');
 input.individual.stateReturns=[{state:'NY',wageRecords:[{w2Id:'w2-taxpayer',box12:[{code:'Q',amountCents:200000}]},{w2Id:'w2-spouse',box12:[{code:'Q',amountCents:100000}]}]}];assert(codes(calc(input)).includes('EIC_COMBAT_NY_W2_CONFLICT'));input.individual.stateReturns=[];award.combatSources[0].owner='spouse';assert(codes(calc(input)).includes('EIC_COMBAT_W2_SOURCE'));award.combatSources[0].owner='taxpayer';input.individual.earnedIncomeCredit.nontaxableCombatPayCents=0;assert(codes(calc(input)).includes('EIC_COMBAT_AGGREGATE_CONFLICT'));
});
test('unsupported income, special residence, prior disallowance and later annual awards stay unknown',()=>{
 for(const mutate of [award=>award.scope.earnedSources='other',award=>award.scope.investmentSources='other',award=>award.scope.priorDisallowance='form8862Required',award=>award.scope.review.children=false,award=>award.persons.taxpayer.homeException='militaryExtendedDuty']){const input=eicFixture();mutate(input.individual.earnedIncomeCredit.award);assert.equal(calc(input).known,false);}
 const input=eicFixture();input.individual.earnedIncomeCredit.award.scope.form2555='yes';assert.equal(calc(input).eligible,false);for(const year of [2026,2027]){input.year=year;assert(codes(calc(input)).includes('EIC_AWARD_ANNUAL_RULES'));assert.equal(calc(input).eligible,null);}
});
for(const year of [2023,2024,2025])test(`${year} first stopping question controls the No/27c marker across simultaneous eligibility failures`,()=>{
 const input=eicFixture({year,children:0,joint:false,wages:10000}),award=input.individual.earnedIncomeCredit.award,person=award.persons.taxpayer,shared=input.individual.eligibility.taxpayer;
 Object.assign(person,{usHomeDays:0,qualifyingChildOfAnother:'yes',qualifyingChildClaimantReturn:'requiredOrOtherPurpose',dependencyClaimantReturn:'requiredOrOtherPurpose'});Object.assign(shared,{dateOfBirth:'1950-01-02',canBeClaimed:'yes'});
 const assertStop=(reason,step,question,marker)=>{const result=calc(input);assert.equal(result.known,true);assert.equal(result.eligible,false);assert.equal(result.filerFacts.firstDenialReason,reason);assert.equal(result.filerFacts.stoppingStep,step);assert.equal(result.filerFacts.stoppingQuestion,question);assert.equal(result.filerFacts.noCreditIndicator,marker);};
 assertStop('EIC_FILER_AGE_INELIGIBLE',4,2,false);shared.dateOfBirth='1990-06-15';assertStop('EIC_FILER_HOME_INELIGIBLE',4,3,true);person.usHomeDays=year===2024?366:365;assertStop('EIC_FILER_QUALIFYING_CHILD_INELIGIBLE',4,5,true);person.qualifyingChildOfAnother='no';assertStop('EIC_FILER_DEPENDENT_INELIGIBLE',4,6,false);
 award.scope.form2555='yes';person.usHomeDays=0;assertStop('EIC_FORM2555_INELIGIBLE',1,3,false);input.individual.taxpayerIdentifiers.taxpayer.type='itin';assertStop('EIC_FILER_SSN_INELIGIBLE',1,2,true);
 input.individual.taxpayerIdentifiers.taxpayer.type='ssn';award.scope.form2555='no';input.individual.filingStatus='marriedSeparate';award.marital.status='married';assertStop('EIC_MARRIED_NO_CHILD_INELIGIBLE',4,1,false);
 const withChild=eicFixture({year,children:1,joint:false});withChild.individual.filingStatus='marriedSeparate';Object.assign(withChild.individual.earnedIncomeCredit.award.marital,{status:'married',lastSixMonthsApart:'no',separatedUnderStateLaw:'no',livedApartAtYearEnd:'no'});Object.assign(withChild.individual.earnedIncomeCredit.award.persons.taxpayer,{qualifyingChildOfAnother:'yes',qualifyingChildClaimantReturn:'requiredOrOtherPurpose'});
 let result=calc(withChild);assert.equal(result.known,true);assert.equal(result.eligible,false);assert.equal(result.filerFacts.firstDenialReason,'EIC_SEPARATED_SPOUSE_INELIGIBLE');assert.equal(result.filerFacts.stoppingStep,3);assert.equal(result.filerFacts.stoppingQuestion,5);assert.equal(result.filerFacts.noCreditIndicator,false);
 Object.assign(withChild.individual.earnedIncomeCredit.award.marital,{lastSixMonthsApart:'yes',livedApartAtYearEnd:'yes'});result=calc(withChild);assert.equal(result.filerFacts.firstDenialReason,'EIC_FILER_QUALIFYING_CHILD_INELIGIBLE');assert.equal(result.filerFacts.stoppingStep,3);assert.equal(result.filerFacts.stoppingQuestion,6);assert.equal(result.filerFacts.noCreditIndicator,true);
});
