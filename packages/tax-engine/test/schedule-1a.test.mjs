import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {schedule1A,tippedOccupations,newSchedule1A} from '../schedule-1a.mjs';
import {calculateReturn} from '../index.mjs';
import {reviewed,wage,business} from './fixtures.mjs';
import {schedule1AFixture,tip,overtime,vehicle,senior,schedule1AContext,identifiersFixture} from './schedule-1a-fixtures.mjs';
const reference=JSON.parse(await readFile(new URL('./schedule-1a-reference.json',import.meta.url),'utf8'));
const calc=(value,context={})=>schedule1A(value,{...schedule1AContext(),...context});

test('published 2025 overtime methods calculate only the FLSA premium',()=>{
 for(const {amountDollars:amount,method,qualifiedDollars:expected}of reference.publishedOvertimeExamples){const value=schedule1AFixture();value.overtime=[overtime(amount,method)];const result=calc(value);assert.equal(result.overtimeDeductionCents,expected*100);assert.equal(result.lines['14a'],expected*100);assert.deepEqual(result.diagnostics,[]);}
 const value=schedule1AFixture();value.overtime=[overtime(0,'hoursRate',{regularRateCents:2000,overtimeHoursHundredths:50000})];assert.equal(calc(value).overtimeDeductionCents,500000);
});

test('tips and overtime round phaseout down, vehicle interest rounds it up',()=>{
 const value=schedule1AFixture();value.tips=[tip(10000)];value.overtime=[overtime(15000)];
 for(const [agi,expectedTip,expectedOt]of [[150000,10000,5000],[150001,10000,5000],[150999,10000,5000],[151000,9900,4900],[250000,0,0]]){const result=calc(value,{adjustedGrossIncomeCents:agi*100});assert.equal(result.tipsDeductionCents,expectedTip*100);assert.equal(result.overtimeDeductionCents,expectedOt*100);}
 value.tips=[];value.overtime=[];value.vehicles=[vehicle()];for(const [agi,expected]of [[100000,5000],[100001,4800],[100999,4800],[101000,4800],[101001,4600],[150000,0]])assert.equal(calc(value,{adjustedGrossIncomeCents:agi*100}).vehicleInterestDeductionCents,expected*100);
});

test('joint limits are one tips cap, doubled overtime cap and per-recipient senior reduction',()=>{
 const value=schedule1AFixture(),context=schedule1AContext();context.filingStatus='marriedJoint';context.w2s.push({id:'w2-spouse',owner:'spouse',wagesCents:10000000});value.tips=[tip(20000),tip(20000,{owner:'spouse',incomeId:'w2-spouse'})];value.overtime=[overtime(60000,'timeAndHalfTotal'),overtime(60000,'timeAndHalfTotal',{owner:'spouse',w2Id:'w2-spouse'})];let result=calc(value,context);assert.equal(result.tipsDeductionCents,2500000);assert.equal(result.overtimeDeductionCents,2500000);assert.equal(result.lines['4a'],0);assert.equal(result.lines['4c'],4000000);
 context.eligibility.taxpayer.dateOfBirth='1961-01-01';context.eligibility.spouse.dateOfBirth='1960-06-15';context.adjustedGrossIncomeCents=20000000;value.seniors=[senior(),senior('spouse')];result=calc(value,context);assert.equal(result.seniorDeductionCents,600000);assert.equal(result.lines['36a'],300000);assert.equal(result.lines['36b'],300000);
});

test('final 71-occupation list, lawful voluntary tips and source reporting are enforced',()=>{
 assert.equal(tippedOccupations.length,71);assert.equal(new Set(tippedOccupations.map(row=>row.code)).size,71);for(const code of ['509','510','810'])assert(tippedOccupations.some(row=>row.code===code));
 const value=schedule1AFixture();value.tips=[tip()];for(const key of ['voluntaryCash','lawful','occupation','reporting']){value.tips[0].review[key]=false;assert.equal(calc(value).tipsDeductionCents,null,key);value.tips[0].review[key]=true;}
 value.tips[0].occupationCode='999';assert.equal(calc(value).tipsDeductionCents,null);value.tips[0].occupationCode='102';value.tips[0].reporting='form4137';assert.equal(calc(value).tipsDeductionCents,null);value.tips[0].reporting='w2Box7';value.tips[0].sstbStatus='unknown';assert.equal(calc(value).tipsDeductionCents,null);
});

test('business tips are limited to represented net income after allocated half-SE tax',()=>{
 const value=schedule1AFixture();value.tips=[tip(10000,{kind:'business',incomeId:'c1',reportedGrossCents:3000000,reporting:'1099K'})];const context={w2s:[],businesses:[{copyId:'c1',owner:'taxpayer',profitCents:800000,lines:{'1':3000000}}],selfEmploymentAdjustments:[{owner:'taxpayer',halfTaxCents:56500}]};let result=calc(value,context);assert.equal(result.tipsDeductionCents,743500);assert.deepEqual(result.qbiReductionByBusiness,[{businessId:'c1',amountCents:743500}]);
 context.businesses[0].profitCents=-100;result=calc(value,context);assert.equal(result.tipsDeductionCents,0);context.businesses[0].profitCents=800000;context.businesses.push({copyId:'c2',owner:'taxpayer',profitCents:100});assert.equal(calc(value,context).tipsDeductionCents,null);context.businesses.pop();value.tips[0].reportedGrossCents=3000100;assert.equal(calc(value,context).tipsDeductionCents,null);
});

test('known ineligible identifiers deny only that recipient while unknown identifiers block',()=>{
 const value=schedule1AFixture(),context=schedule1AContext();context.eligibility.taxpayer.dateOfBirth='1961-01-01';value.tips=[tip()];value.overtime=[overtime()];value.seniors=[senior()];
 for(const patch of [{type:'itin'},{issuedByDueDate:'no'},{validForEmployment:'no'}]){context.identifiers=identifiersFixture();Object.assign(context.identifiers.taxpayer,patch);const result=calc(value,context);assert.equal(result.deductionCents,0);assert(result.diagnostics.some(row=>row.code==='S1A_IDENTIFIER_INELIGIBLE'));assert(result.diagnostics.every(row=>row.severity==='information'));}
 context.identifiers=identifiersFixture();context.identifiers.taxpayer.issuedByDueDate='unknown';assert.equal(calc(value,context).deductionCents,null);
 context.filingStatus='marriedJoint';context.identifiers.taxpayer.issuedByDueDate='no';context.w2s.push({id:'w2-spouse',owner:'spouse',wagesCents:6000000});value.tips.push(tip(5000,{owner:'spouse',incomeId:'w2-spouse'}));assert.equal(calc(value,context).tipsDeductionCents,500000);
});

test('senior birthday, published death example and source conflicts preserve actual eligibility',()=>{
 const value=schedule1AFixture(),context=schedule1AContext();value.seniors=[senior()];for(const [dob,expected]of [['1961-01-01',600000],['1961-01-02',0]]){context.eligibility.taxpayer.dateOfBirth=dob;assert.equal(calc(value,context).seniorDeductionCents,expected);}
 Object.assign(context.eligibility.taxpayer,{dateOfBirth:'1960-02-14',deceased:'yes',dateOfDeath:'2025-02-13'});assert.equal(calc(value,context).seniorDeductionCents,600000);context.eligibility.taxpayer.dateOfDeath='2025-02-12';assert.equal(calc(value,context).seniorDeductionCents,0);
 const young=schedule1AContext();young.identifiers.taxpayer.issuedByDueDate='unknown';assert.equal(calc(value,young).seniorDeductionCents,0);
 assert.equal(calc(undefined,{eligibilityConflict:true}).seniorDeductionCents,null);assert.equal(calc(newSchedule1A(),{eligibilityConflict:true}).seniorDeductionCents,null);assert.equal(calc(undefined,{year:2024,eligibilityConflict:true}).deductionCents,0);
 const older=schedule1AContext();older.eligibility.taxpayer.dateOfBirth='1960-01-01';assert.equal(calc(undefined,older).deductionCents,null);older.identifiers.taxpayer.type='itin';assert.equal(calc(undefined,older).deductionCents,0);
});

test('vehicle loan records calculate personal interest once and preserve unsupported treatments',()=>{
 const value=schedule1AFixture();value.vehicles=[vehicle(5000,{deductedElsewhereCents:100000,businessId:'c1'})];const context={businesses:[{copyId:'c1',owner:'taxpayer',lines:{'16b':100000}}]};assert.equal(calc(value,context).vehicleInterestDeductionCents,400000);
 for(const key of Object.keys(value.vehicles[0].review)){value.vehicles[0].review[key]=false;assert.equal(calc(value,context).vehicleInterestDeductionCents,null,key);value.vehicles[0].review[key]=true;}
 value.vehicles[0].gvwrPounds=14000;assert.equal(calc(value,context).vehicleInterestDeductionCents,null);value.vehicles[0].gvwrPounds=4500;value.vehicles[0].purchaseDate='2024-12-31';assert.equal(calc(value,context).vehicleInterestDeductionCents,null);value.vehicles[0].purchaseDate='2025-03-15';value.vehicles.push(vehicle(1000,{vin:'1HGCM82633A004353',deductedElsewhereCents:10000,businessId:'c1'}));assert.equal(calc(value,context).vehicleInterestDeductionCents,null);
});

test('source overlap, missing MAGI and section-specific unknown amounts cannot become final deductions',()=>{
 const value=schedule1AFixture();value.overtime=[overtime(),overtime()];assert(calc(value).diagnostics.some(row=>row.code==='S1A_OVERTIME_W2_DUPLICATE'));value.overtime=[overtime()];value.tips=[tip(63000)];assert.equal(calc(value).deductionCents,null);value.tips=[tip()];value.vehicles=[vehicle()];value.tips[0].review.lawful=false;let result=calc(value);assert.equal(result.tipsDeductionCents,null);assert.equal(result.overtimeDeductionCents,500000);assert.equal(result.vehicleInterestDeductionCents,500000);value.tips[0].review.lawful=true;for(const extra of [{incomeUnknown:true},{otherTreatments:true},{adjustedGrossIncomeCents:null}])assert.equal(calc(value,extra).deductionCents,null);
 const copy=structuredClone(value);calc(value);assert.deepEqual(value,copy);
});

test('MFS denial, prior years and final2026 statutory calculations never borrow an annual form',()=>{
 const value=schedule1AFixture();value.tips=[tip()];value.overtime=[overtime()];value.vehicles=[vehicle()];assert.equal(calc(value,{filingStatus:'marriedSeparate'}).deductionCents,500000);for(const year of [2023,2024]){assert.equal(calc(undefined,{year}).deductionCents,0);const result=calc(value,{year});assert.equal(result.deductionCents,null);assert.equal(result.forms.length,0);}
 value.tips[0].reporting='w2TP';value.overtime[0].method='w2TT';value.overtime[0].amountCents=500000;const result=calc(value,{year:2026});assert.equal(result.deductionCents,2000000);assert.equal(result.forms.length,0);assert(result.diagnostics.some(row=>row.code==='S1A_2026_FORM_UNAVAILABLE'));value.overtime[0].method='premiumStatement';assert.equal(calc(value,{year:2026}).overtimeDeductionCents,null);
});

test('integrated business tip deduction reduces QBI and its taxable-income limit, without changing AGI or SE tax',()=>{
 const input=reviewed();input.individual.taxpayerIdentifiers=identifiersFixture();input.individual.businesses=[business('taxpayer',20000)];const baseline=calculateReturn(input);input.individual.schedule1A=schedule1AFixture();input.individual.schedule1A.tips=[tip(10000,{kind:'business',incomeId:'business-taxpayer',reporting:'1099K',reportedGrossCents:2000000})];const result=calculateReturn(input),qbi=result.forms.find(row=>row.form==='f8995'),before=baseline.forms.find(row=>row.form==='f8995');assert.equal(result.summary.adjustedGrossIncomeCents,baseline.summary.adjustedGrossIncomeCents);assert.equal(result.summary.selfEmploymentTaxCents,baseline.summary.selfEmploymentTaxCents);assert.equal(result.forms[0].lines['13b'],1000000);assert.equal(qbi.lines['2'],before.lines['2']-1000000);assert.equal(qbi.lines['11'],Math.max(0,before.lines['11']-1000000));assert.equal(result.summary.taxableIncomeCents,0);
});

test('mixed capped business/employee tips preserve the total while unresolved QBI allocation blocks final tax',()=>{
 const input=reviewed();input.individual.taxpayerIdentifiers=identifiersFixture();input.individual.w2s=[wage('taxpayer',60000)];input.individual.businesses=[business('taxpayer',50000)];input.individual.schedule1A=schedule1AFixture();input.individual.schedule1A.tips=[tip(20000),tip(20000,{kind:'business',incomeId:'business-taxpayer',reporting:'1099K',reportedGrossCents:5000000})];const result=calculateReturn(input);assert.equal(result.schedule1A.deductionCents,2500000);assert.equal(result.schedule1A.qbiUnknown,true);assert.equal(result.summary.adjustedGrossIncomeCents,10646700);assert.equal(result.summary.totalTaxCents,null);
});

test('integrated senior deduction leaves AGI unchanged and uses the shared federal aged standard deduction',()=>{
 const input=reviewed();input.individual.w2s=[wage('taxpayer',50000)];input.individual.eligibility.taxpayer.dateOfBirth='1961-01-01';input.individual.taxpayerIdentifiers=identifiersFixture();input.individual.schedule1A=schedule1AFixture();input.individual.schedule1A.seniors=[senior()];const result=calculateReturn(input);assert.equal(result.summary.adjustedGrossIncomeCents,5000000);assert.equal(result.forms[0].lines['12e'],1775000);assert.equal(result.forms[0].lines['13b'],600000);assert.equal(result.summary.taxableIncomeCents,2625000);assert.equal(result.filingReady,false);
});
