import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateReturn,newEicCombatSource,newEicChild,newNYStateReturn} from '../index.mjs';
import {newCTStateReturn} from '../state-returns.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {eicFixture} from './eic-fixtures.mjs';
import {business,wage} from './fixtures.mjs';
import {pdfText} from './pdf-text.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));

for(const [year,expected]of [[2023,545500],[2024,613100],[2025,649800]])test(`${year} actual return and original PDFs carry published Grey EIC with synthetic reviewed eligibility`,async()=>{
 const input=eicFixture({year});input.individual.taxableInterestCents=52500;const before=structuredClone(input),result=calculateReturn(input),main=result.forms.find(row=>row.form==='f1040');
 assert.equal(result.summary.adjustedGrossIncomeCents,3355500);assert.equal(result.summary.earnedIncomeCreditCents,expected);assert.equal(main.lines[year===2025?'27a':'27'],expected);assert.equal(main.lines['32'],expected+result.childCredits.refundableCents);assert.equal(result.summary.refundCents,result.summary.paymentsCents-result.summary.totalTaxCents);assert.equal(result.earnedIncomeCredit.worksheet.agiComparison,'compare-AGI');assert(!result.diagnostics.some(row=>row.severity==='blocking'));assert.equal(result.filingReady,false);
 const packet=await generateDraftPdf(input,{loadTemplate});try{const schedule=packet.audit.find(row=>row.form==='f1040sei');assert(schedule);assert(schedule.filled.some(row=>row.line==='child1:months'));const text=pdfText(packet.bytes,'-layout');assert.match(text,/Schedule EIC/);assert.match(text,/Child0/);assert(packet.audit.find(row=>row.form==='f1040').filled.some(row=>row.line===(year===2025?'27a':'27')));}finally{packet.bytes.fill(0);}assert.deepEqual(input,before);
});

test('actual Schedule C sources feed Worksheet B and the computed EIC flows into ACTC and settlement',()=>{
 const input=eicFixture({children:3,wages:500,joint:false});input.individual.businesses=[business('taxpayer',15000)];const result=calculateReturn(input),eic=result.earnedIncomeCredit;
 assert.equal(eic.worksheet.kind,'B');assert.equal(eic.worksheet.earnedIncomeCents,1550000-result.forms.find(row=>row.form==='f1040sse').lines['13']);assert(eic.amountCents>0);assert.equal(result.childCredits.eic.amountCents,eic.amountCents);assert.equal(result.forms.find(row=>row.form==='f1040').lines['32'],result.childCredits.refundableCents+eic.amountCents);assert.notEqual(result.summary.refundCents,null);
 input.individual.businesses[0].fullyAtRisk=false;input.individual.businesses[0].expenses=[{category:'other',amountCents:2000000,description:'Synthetic loss requiring at-risk review'}];const unknown=calculateReturn(input);assert.equal(unknown.summary.earnedIncomeCreditCents,null);assert.equal(unknown.summary.refundCents,null);
});

test('combat candidate choices remain unsaved until elected and never increase taxable wages',()=>{
 const input=eicFixture({children:2,wages:20000}),value=input.individual.earnedIncomeCredit;value.nontaxableCombatPayCents=4000000;input.individual.childCredits.nontaxableCombatPayCents=4000000;input.individual.childCredits.combatPaySource='Synthetic original W-2 code Q';value.award.combatSources=[{...newEicCombatSource(input.individual.w2s[0].id,'taxpayer'),amountCents:4000000,source:'Synthetic original W-2 code Q',reviewed:true}];
 const original=structuredClone(input),pending=calculateReturn(input);assert.equal(pending.summary.earnedIncomeCreditCents,null);assert.equal(pending.earnedIncomeCredit.electionCandidates.length,2);assert.equal(pending.summary.refundCents,null);assert.deepEqual(input,original);
 for(const election of ['include','exclude']){value.award.combatElections.taxpayer=election;const result=calculateReturn(input),main=result.forms.find(row=>row.form==='f1040'),candidate=pending.earnedIncomeCredit.electionCandidates.find(row=>row.elections.taxpayer===election);assert.equal(result.summary.earnedIncomeCreditCents,candidate.amountCents);assert.equal(main.lines['1i'],election==='include'?4000000:0);assert.equal(main.lines['1z'],2000000);assert.equal(result.summary.adjustedGrossIncomeCents,2000000);assert.equal(result.childCredits.earnedIncomeCents,6000000);}
 value.award.combatSources[0].amountCents=3999900;assert.equal(calculateReturn(input).summary.earnedIncomeCreditCents,null);
});

test('positive federal EIC does not silently settle unsupported Connecticut or New York EIC schedules',()=>{
 const input=eicFixture({children:0,wages:10000,joint:false}),ct=newCTStateReturn(),ny=newNYStateReturn();for(const state of [ct,ny])for(const key of Object.keys(state.review))state.review[key]=true;input.individual.stateReturns=[ct,ny];const result=calculateReturn(input);assert(result.summary.earnedIncomeCreditCents>0);for(const state of result.states){assert.equal(state.summary.paymentsCents,null);assert.equal(state.summary.refundCents,null);assert.equal(state.summary.amountOwedCents,null);}for(const code of ['CT_EITC_SOURCE_REQUIRED','NY_EIC_SOURCE_REVIEW'])assert(result.diagnostics.some(row=>row.code===code));
});

test('annual unavailable awards and missing or malformed source reviews never become a credit',()=>{
 for(const year of [2026,2027]){const input=eicFixture({year});const result=calculateReturn(input);assert.equal(result.summary.earnedIncomeCreditCents,null);assert(!result.forms.some(row=>row.form==='f1040sei'));assert(result.diagnostics.some(row=>row.code==='EIC_AWARD_YEAR_UNAVAILABLE'));}
 const input=eicFixture();input.individual.earnedIncomeCredit.award.scope.review.investment=false;assert.equal(calculateReturn(input).summary.earnedIncomeCreditCents,null);input.individual.earnedIncomeCredit.award.extra='unrecognized';assert.equal(calculateReturn(input).status,'invalid-input');
});

test('new award source conflicts participate before legacy childless and earned-income zero proofs',()=>{
 const combat=eicFixture({children:0,wages:0,joint:false});delete combat.individual.childCredits;combat.individual.w2s=[wage('taxpayer',0)];combat.individual.earnedIncomeCredit.award.combatSources=[{...newEicCombatSource('w2-taxpayer'),amountCents:1000000,source:'Synthetic retained W-2 code Q',reviewed:true}];combat.individual.earnedIncomeCredit.award.combatElections.taxpayer='include';let result=calculateReturn(combat);assert.equal(result.summary.earnedIncomeCreditCents,null);assert.equal(result.summary.refundCents,null);assert(result.diagnostics.some(row=>row.code==='EIC_COMBAT_AGGREGATE_CONFLICT'));
 combat.individual.w2s[0]=wage('taxpayer',80000);result=calculateReturn(combat);assert.equal(result.summary.earnedIncomeCreditCents,0);assert(result.diagnostics.some(row=>row.code==='EIC_COMBAT_AGGREGATE_CONFLICT'));
 const child=eicFixture({children:0,wages:30000,joint:false});child.individual.earnedIncomeCredit.award.children=[{...newEicChild('missing-retained-child'),claim:'taxpayer',usHomeMonths:12,competingClaim:'none',source:'Synthetic retained child source',reviewed:true}];result=calculateReturn(child);assert.equal(result.summary.earnedIncomeCreditCents,null);assert(result.diagnostics.some(row=>row.code==='EIC_CHILD_LINK_MISSING'));
 for(const wages of [0,80000]){const special=eicFixture({children:0,wages,joint:false});special.individual.earnedIncomeCredit.award.scope.earnedSources='other';result=calculateReturn(special);assert.equal(result.summary.earnedIncomeCreditCents,null);assert(result.diagnostics.some(row=>row.code==='EIC_AWARD_EARNED_SCOPE'));}
});

test('annual AGI stop precedes an SSN denial and uses the reviewed valid-SSN child count',()=>{
 for(const year of [2023,2024,2025]){const input=eicFixture({year,children:1,wages:60000});input.individual.taxpayerIdentifiers.taxpayer.type='itin';input.individual.taxpayerIdentifiers.taxpayer.validForEmployment='no';const result=calculateReturn(input);assert.equal(result.earnedIncomeCredit.eligibility.known,true);assert.equal(result.earnedIncomeCredit.eligibility.creditChildren.length,1);assert.equal(result.summary.earnedIncomeCreditCents,0);assert.match(result.earnedIncomeCredit.reason,/AGI-at-or-above/);assert.equal(result.earnedIncomeCredit.noCreditIndicator,false);assert(result.earnedIncomeCredit.cutoffCents<6000000);}
});

test('2025 zero federal table amount does not assume zero Connecticut qualifying-child supplement',async()=>{
 const input=eicFixture({year:2025,children:1,wages:57550,joint:true});input.individual.dependents[0].claim='no';const ct=newCTStateReturn();for(const key of Object.keys(ct.review))ct.review[key]=true;ct.useTax.reviewed=true;ct.town='Hartford';ct.townZip='06103';input.individual.stateReturns=[ct];let result=calculateReturn(input);assert.equal(result.summary.earnedIncomeCreditCents,0);assert.equal(result.earnedIncomeCredit.eligibility.eligible,true);assert.equal(result.earnedIncomeCredit.worksheet.earnedLookup.terminalFootnote,true);assert.equal(result.dependents.required,false);assert(result.diagnostics.some(row=>row.code==='CT_EIC_ZERO_CHILD_SUPPLEMENT_REVIEW'));for(const key of ['paymentsCents','refundCents','amountOwedCents'])assert.equal(result.states[0].summary[key],null);assert.equal(result.forms.find(row=>row.form==='ct1040').lines['20a'],null);
 const packet=await generateDraftPdf(input,{loadTemplate});try{assert.equal(packet.result.states[0].summary.amountOwedCents,null);assert(!packet.audit.find(row=>row.form==='ct1040').fields.some(row=>row.line==='20a'));}finally{packet.bytes.fill(0);}
 // A proven income disqualification is distinct from a zero table cell.
 const wage=input.individual.w2s[0];wage.wagesCents=wage.socialSecurityWagesCents=wage.medicareWagesCents=5755400;result=calculateReturn(input);assert.equal(result.summary.earnedIncomeCreditCents,0);assert.match(result.earnedIncomeCredit.reason,/AGI-at-or-above/);assert(!result.diagnostics.some(row=>row.code==='CT_EIC_ZERO_CHILD_SUPPLEMENT_REVIEW'));assert.equal(result.forms.find(row=>row.form==='ct1040').lines['20a'],0);assert.notEqual(result.states[0].summary.amountOwedCents,null);
});
