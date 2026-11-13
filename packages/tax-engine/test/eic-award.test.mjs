import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eicAward} from '../eic-award.mjs';
import {eicTableLookup,eicWorksheetAnnual} from '../eic-tables.mjs';
import {awardFixture} from './eic-award-fixtures.mjs';
const reference=JSON.parse(readFileSync(new URL('./eic-award-reference.json',import.meta.url)));
test('actual IRS Grey-family worksheet examples use the annual earned and AGI table rows',()=>{
 for(const example of reference.publishedGreyExamples){const {input,context}=awardFixture({year:example.year,filingStatus:example.filingStatus,wages:example.taxpayerWagesDollars,spouseWages:example.spouseWagesDollars,agi:example.agiDollars,children:example.validSsnChildren});context.investmentIncomeCents=example.taxableInterestDollars*100;const before=structuredClone({input,context}),result=eicAward(input,context);
  assert.equal(result.amountCents,example.eicDollars*100);assert.equal(result.worksheet.kind,'A');assert.equal(result.worksheet.earnedLookup.creditCents,example.earnedTableCreditDollars*100);assert.equal(result.worksheet.agiLookup.creditCents,example.agiTableCreditDollars*100);assert.equal(result.worksheet.agiComparison,'compare-AGI');assert.equal(result.selectedCombatPayCents,0);assert.equal(result.noCreditIndicator,false);assert.deepEqual({input,context},before);
 }
});
test('the AGI comparison follows annual Worksheet A at equal, below-threshold and threshold boundaries',()=>{
 for(const year of [2023,2024,2025])for(const filingStatus of ['single','marriedJoint'])for(const children of [0,1]){
  const threshold=eicWorksheetAnnual[year].agiComparisonThresholds[(children?2:0)+(filingStatus==='marriedJoint'?1:0)]/100;
  for(const agi of [threshold-1,threshold,threshold+1]){const {input,context}=awardFixture({year,filingStatus,children,wages:5000,agi}),result=eicAward(input,context);assert.equal(result.worksheet.agiComparison,agi<threshold?'below-comparison-threshold':'compare-AGI');assert.equal(result.worksheet.agiLookup===null,agi<threshold);}
  const equal=awardFixture({year,filingStatus,children,wages:5000,agi:5000});assert.equal(eicAward(equal.input,equal.context).worksheet.agiComparison,'same-as-earned');
 }
 const phaseIn=awardFixture({wages:5000,agi:1000,children:1}),result=eicAward(phaseIn.input,phaseIn.context);assert.equal(result.amountCents,eicTableLookup(500000,{year:2025,filingStatus:'single',qualifyingChildren:1}).creditCents);assert(result.amountCents>eicTableLookup(100000,{year:2025,filingStatus:'single',qualifyingChildren:1}).creditCents);
});
test('Worksheet B uses profit minus actual deductible SE tax, preserving under-threshold and loss owners',()=>{
 for(const year of [2023,2024,2025]){
  const normal=awardFixture({year,wages:1000,profits:[['taxpayer',10000]],children:1}),result=eicAward(normal.input,normal.context);assert.equal(result.worksheet.kind,'B');assert.equal(result.worksheet.lines['1a'],1000000);assert.equal(result.worksheet.lines['1d'],normal.context.halfSeTaxCents);assert.equal(result.worksheet.lines['4b'],1100000-normal.context.halfSeTaxCents);assert.equal(result.worksheet.lines['2b'],0);
  for(const profit of [0,300,-1000]){const value=awardFixture({year,wages:5000,profits:[['taxpayer',profit]],children:1}),computed=eicAward(value.input,value.context);assert.equal(computed.worksheet.kind,'B');assert.equal(computed.worksheet.lines['1a'],0);assert.equal(computed.worksheet.lines['2b'],profit*100);assert.equal(computed.worksheet.earnedIncomeCents,(5000+profit)*100);}
  const mixed=awardFixture({year,filingStatus:'marriedJoint',wages:3000,spouseWages:1000,profits:[['taxpayer',10000],['spouse',300]],children:2}),computed=eicAward(mixed.input,mixed.context);assert.equal(computed.worksheet.lines['1a'],1000000);assert.equal(computed.worksheet.lines['2b'],30000);assert.equal(computed.worksheet.lines['4b'],1430000-mixed.context.halfSeTaxCents);assert.equal(computed.worksheet.ownerSources.length,2);
 }
});
test('each spouse has an independent all-or-none combat election; unresolved elections preserve all candidates',()=>{
 const {input,context}=awardFixture({filingStatus:'marriedJoint',wages:4000,spouseWages:3000,agi:7000,children:2,combat:{taxpayer:6000,spouse:4000}}),before=structuredClone({input,context}),unknown=eicAward(input,context);assert.equal(unknown.amountCents,null);assert.equal(unknown.selectedCombatPayCents,null);assert.equal(unknown.electionCandidates.length,4);assert.deepEqual(unknown.electionCandidates.map(row=>row.combatPayCents),[0,400000,600000,1000000]);assert.deepEqual({input,context},before);
 for(const candidate of unknown.electionCandidates){input.individual.earnedIncomeCredit.award.combatElections=candidate.elections;const result=eicAward(input,context);assert.equal(result.amountCents,candidate.amountCents);assert.equal(result.selectedCombatPayCents,candidate.combatPayCents);assert.deepEqual(result.worksheet,candidate.worksheet);}
 const single=awardFixture({wages:5000,children:1,combat:{taxpayer:10000,spouse:0}});assert.equal(eicAward(single.input,single.context).electionCandidates.length,2);single.input.individual.earnedIncomeCredit.award.combatElections.taxpayer='exclude';const excluded=eicAward(single.input,single.context);assert.equal(excluded.selectedCombatPayCents,0);assert.equal(excluded.worksheet.earnedIncomeCents,500000);
});
test('income limits, investment boundary and exact worksheet stop indicators remain distinct',()=>{
 const zero=awardFixture({wages:0});let result=eicAward(zero.input,zero.context);assert.equal(result.amountCents,0);assert.equal(result.noCreditIndicator,true);assert.equal(result.worksheet.stop,'earned-table-credit-zero');
 const loss=awardFixture({wages:1000,profits:[['taxpayer',-1000]],agi:0});result=eicAward(loss.input,loss.context);assert.equal(result.noCreditIndicator,true);assert.equal(result.worksheet.stop,'earned-income-not-positive');
 const highEarned=awardFixture({wages:20000,profits:[['taxpayer',300]],agi:1000});result=eicAward(highEarned.input,highEarned.context);assert.equal(result.amountCents,0);assert.equal(result.worksheet.stop,'earned-income-at-or-above-limit');assert.equal(result.noCreditIndicator,true);
 for(const year of [2023,2024,2025]){const limit=eicWorksheetAnnual[year].investmentLimitCents,value=awardFixture({year,wages:10000,children:1});value.context.investmentIncomeCents=limit;assert(eicAward(value.input,value.context).amountCents>0);value.context.investmentIncomeCents=limit+100;assert.equal(eicAward(value.input,value.context).reason,'investment-income-exceeds-annual-limit');value.context.investmentIncomeCents=0;value.context.adjustedGrossIncomeCents=eicTableLookup(0,{year,filingStatus:'single',qualifyingChildren:1}).cutoffCents;result=eicAward(value.input,value.context);assert.equal(result.amountCents,0);assert.equal(result.noCreditIndicator,false);}
 const terminal=awardFixture({year:2025,wages:10000,agi:19100});result=eicAward(terminal.input,terminal.context);assert.equal(result.amountCents,0);assert.equal(result.worksheet.agiLookup.terminalFootnote,true);assert.equal(result.noCreditIndicator,false);
});
test('a qualifying child without a valid SSN uses the zero-child amount column without erasing the child branch',()=>{
 const {input,context}=awardFixture({wages:10000,children:0,allChildren:1}),result=eicAward(input,context);assert.equal(result.creditChildren.length,0);assert.equal(result.allQualifyingChildren.length,1);assert.equal(result.worksheet.creditChildrenCount,0);assert.equal(result.amountCents,eicTableLookup(1000000,{year:2025,filingStatus:'single',qualifyingChildren:0}).creditCents);
});
test('missing eligibility, annual tables, source completeness or conflicting owner totals never produce an award',()=>{
 for(const change of [value=>value.context.eligibility.known=false,value=>value.context.eligibility.filerFacts.earnedSourcesKnown=false,value=>value.context.eligibility.filerFacts.investmentSourcesKnown=false,value=>value.context.investmentKnown=false,value=>value.context.otherTreatments=true,value=>value.context.adjustedGrossIncomeCents=null,value=>value.context.wageIncomeCents+=100,value=>value.context.scheduleCProfitCents+=100,value=>value.context.halfSeTaxCents+=100,value=>value.context.eligibility.filerFacts.combatKnown=false]){const value=awardFixture();change(value);assert.equal(eicAward(value.input,value.context).amountCents,null);}
 for(const change of [value=>value.context.seByOwner=[],value=>value.context.seByOwner[0].lines['3']+=100,value=>value.context.seByOwner[0].lines['4b']=100,value=>value.context.businesses[0].incomeUnknown=true]){const value=awardFixture({profits:[['taxpayer',10000]]});change(value);assert.equal(eicAward(value.input,value.context).amountCents,null);}
 for(const year of [2026,2027]){const value=awardFixture({year});assert.equal(eicAward(value.input,value.context).amountCents,null);assert.equal(eicAward(value.input,value.context).electionCandidates.length,0);}
 const denied=awardFixture();denied.context.eligibility.eligible=false;assert.equal(eicAward(denied.input,denied.context).amountCents,0);assert.equal(eicAward(denied.input,denied.context).ineligible,true);
});
test('annual Step1 AGI and Step2 investment stops precede later No/27c instructions without changing a proven zero',()=>{
 for(const year of [2023,2024,2025]){
  const value=awardFixture({year,wages:10000}),facts=value.context.eligibility.filerFacts;value.context.eligibility.eligible=false;
  Object.assign(facts,{firstDenialReason:'EIC_FILER_HOME_INELIGIBLE',stoppingStep:4,stoppingQuestion:3,noCreditIndicator:true});
  let result=eicAward(value.input,value.context);assert.equal(result.amountCents,0);assert.equal(result.noCreditIndicator,true);assert.equal(result.stoppingStep,4);
  value.context.investmentIncomeCents=eicWorksheetAnnual[year].investmentLimitCents+100;result=eicAward(value.input,value.context);assert.equal(result.amountCents,0);assert.equal(result.noCreditIndicator,false);assert.equal(result.stoppingStep,2);assert.equal(result.reason,'investment-income-exceeds-annual-limit');
  Object.assign(facts,{firstDenialReason:'EIC_FILER_SSN_INELIGIBLE',stoppingStep:1,stoppingQuestion:2,noCreditIndicator:true});result=eicAward(value.input,value.context);assert.equal(result.noCreditIndicator,true);assert.equal(result.stoppingStep,1);assert.equal(result.stoppingQuestion,2);
  value.context.adjustedGrossIncomeCents=eicTableLookup(0,{year,filingStatus:'single',qualifyingChildren:0}).cutoffCents;result=eicAward(value.input,value.context);assert.equal(result.noCreditIndicator,false);assert.equal(result.stoppingQuestion,1);assert.equal(result.reason,'AGI-at-or-above-annual-child-count-limit');
  value.context.adjustedGrossIncomeCents=null;result=eicAward(value.input,value.context);assert.equal(result.amountCents,0);assert.equal(result.noCreditIndicator,false);assert(result.diagnostics.some(row=>row.code==='EIC_ZERO_STOP_ORDER_UNRESOLVED'));
  value.context.adjustedGrossIncomeCents=1000000;value.context.investmentKnown=false;Object.assign(facts,{firstDenialReason:'EIC_FILER_QUALIFYING_CHILD_INELIGIBLE',stoppingStep:4,stoppingQuestion:5,noCreditIndicator:true});result=eicAward(value.input,value.context);assert.equal(result.amountCents,0);assert.equal(result.noCreditIndicator,false);assert(result.diagnostics.some(row=>row.code==='EIC_ZERO_STOP_ORDER_UNRESOLVED'));
  value.context.investmentKnown=true;value.context.investmentIncomeCents=0;value.context.otherTreatments=true;result=eicAward(value.input,value.context);assert.equal(result.amountCents,0);assert.equal(result.noCreditIndicator,false);assert(result.diagnostics.some(row=>row.code==='EIC_ZERO_STOP_ORDER_UNRESOLVED'));
 }
 const count=awardFixture({year:2025,filingStatus:'marriedJoint',wages:10000,agi:65000,children:2});count.context.eligibility.eligible=false;Object.assign(count.context.eligibility.filerFacts,{firstDenialReason:'EIC_FILER_SSN_INELIGIBLE',stoppingStep:1,stoppingQuestion:2,noCreditIndicator:true});const result=eicAward(count.input,count.context);assert.equal(result.noCreditIndicator,false);assert.equal(result.stoppingQuestion,1);
});
