import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {earnedIncomeCredit,newEarnedIncomeCredit,earnedIncomeCreditAnnual} from '../earned-income-credit.mjs';
import {calculateDependents} from '../dependents.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfText} from './pdf-text.mjs';
import {childFixture,childContext,identifierFixture} from './child-credits-fixtures.mjs';
const input=(options={})=>{const value=childFixture({children:0,wages:18000,...options});delete value.individual.childCredits;delete value.individual.earnedIncomeCredit;return value;};
const review=(value,qualifyingChildren='none')=>value.individual.earnedIncomeCredit={...newEarnedIncomeCredit(),qualifyingChildren,source:'Synthetic independent EIC child/earnings/combat sources',reviewed:true,earnedSourcesReviewed:true};
const calc=(value,options={})=>earnedIncomeCredit(value,{...childContext(18000),...options});
test('no dependent/child-credit section never silently establishes EIC zero',()=>{
 const value=input();assert.equal(calc(value).amountCents,null);assert(calc(value).diagnostics.some(row=>row.code==='EIC_SOURCE_REVIEW_REQUIRED'));
 value.individual.earnedIncomeCredit=newEarnedIncomeCredit();assert.equal(calc(value,{adjustedGrossIncomeCents:5000000,wageIncomeCents:5000000}).amountCents,null);
 review(value);assert.equal(calc(value,{adjustedGrossIncomeCents:5000000,wageIncomeCents:5000000}).amountCents,0);assert.equal(calc(value).amountCents,null);
});
test('published annual childless and all-family cutoffs: below, equal, above, joint and other statuses',()=>{
 const expected={2023:[[17640,24210],[56838,63398]],2024:[[18591,25511],[59899,66819]],2025:[[19104,26214],[61555,68675]],2026:[[19540,26820],[62974,70244]],2027:[[20164,27684],[65002,72512]]};
 for(const [year,pairs]of Object.entries(expected))for(const status of ['single','marriedSeparate','headOfHousehold','survivingSpouse','marriedJoint'])for(const [offset,kind]of ['none','maximum'].entries()){
  const value=input({year:Number(year)});value.individual.filingStatus=status;if(kind==='none')review(value);const cutoff=pairs[offset][status==='marriedJoint'?1:0]*100;
  assert.equal(earnedIncomeCreditAnnual[year][kind][status==='marriedJoint'?1:0],cutoff);
  for(const delta of [-100,0,100]){const result=calc(value,{adjustedGrossIncomeCents:cutoff+delta,wageIncomeCents:null});assert.equal(result.amountCents,delta<0?null:0,`${year}/${status}/${kind}/${delta}`);assert.equal(result.cutoffCents,cutoff);}
 }
 const value=input();review(value);assert.equal(calc(value,{adjustedGrossIncomeCents:1910349,wageIncomeCents:null}).amountCents,null);assert.equal(calc(value,{adjustedGrossIncomeCents:1910350,wageIncomeCents:null}).amountCents,0);
});
test('known U.S. child and unresolved dependent evidence disable the childless proof, preserving independent maximum proof',()=>{
 const value=input({children:1});review(value);let result=calc(value,{adjustedGrossIncomeCents:5000000,wageIncomeCents:5000000});assert.equal(result.amountCents,null);assert.equal(result.cutoffKind,'all-family-maximum');assert(result.diagnostics.some(row=>row.code==='EIC_CHILD_SOURCE_CONFLICT'));
 result=calc(value,{adjustedGrossIncomeCents:8000000});assert.equal(result.amountCents,0);assert(result.diagnostics.some(row=>row.code==='EIC_CHILD_SOURCE_CONFLICT'));
 value.individual.dependents[0].review.identity=false;assert.equal(calculateDependents(value).known,false);assert.equal(calc(value,{adjustedGrossIncomeCents:5000000}).amountCents,null);
});
test('retained unclaimed or self-supporting children remain possible EIC children; reviewed exclusions do not force a child count',()=>{
 const value=input({children:1,wages:30000});review(value);const row=value.individual.dependents[0];row.claim='no';const context={adjustedGrossIncomeCents:3000000,wageIncomeCents:3000000};
 assert.equal(calc(value,context).amountCents,null);assert(calc(value,context).diagnostics.some(item=>item.code==='EIC_CHILD_SOURCE_CONFLICT'));
 row.relationship='parent';row.review.relationship=false;assert.equal(calc(value,context).amountCents,null);row.review.relationship=true;assert.equal(calc(value,context).amountCents,0);row.relationship='child';
 row.ownSupportCents=row.totalSupportCents;row.taxpayerSupportCents=0;assert.equal(calc(value,context).amountCents,null);
 row.usResidencyDays=100;assert.equal(calc(value,context).amountCents,0);row.review.residency=false;assert.equal(calc(value,context).amountCents,null);row.review.residency=true;row.usResidencyDays=365;
 row.dateOfBirth='1990-06-15';row.studentMonths=0;assert.equal(calc(value,context).amountCents,0);row.permanentlyDisabled='unknown';assert.equal(calc(value,context).amountCents,null);row.permanentlyDisabled='yes';assert.equal(calc(value,context).amountCents,null);
 row.jointReturn='yes';assert.equal(calc(value,context).amountCents,0);row.review.jointReturn=false;assert.equal(calc(value,context).amountCents,null);
});
test('zero earned income needs complete actual-source review, including both combat-pay elections',()=>{
 const value=input(),zero={adjustedGrossIncomeCents:0,wageIncomeCents:0};assert.equal(calc(value,zero).amountCents,null);const source=review(value);assert.equal(calc(value,zero).amountCents,0);
 source.earnedSourcesReviewed=false;assert.equal(calc(value,zero).amountCents,null);source.earnedSourcesReviewed=true;source.nontaxableCombatPayCents=1000000;assert.equal(calc(value,zero).amountCents,null);
 assert.equal(calc(value,{...zero,scheduleCProfitCents:-1000000}).amountCents,0);assert.equal(calc(value,{...zero,scheduleCProfitCents:-999900}).amountCents,null);
 assert.equal(calc(value,{...zero,combatPayCents:0}).amountCents,null);source.nontaxableCombatPayCents=0;assert.equal(calc(value,{...zero,otherTreatments:true}).amountCents,null);
 assert.equal(calc(value,{...zero,halfSeTaxCents:null}).amountCents,null);assert.equal(calc(value,{...zero,scheduleCProfitCents:undefined}).amountCents,null);
});
test('high earned proof excludes elective combat, includes actual business losses and half-SE deduction',()=>{
 const value=input(),source=review(value,'present');source.nontaxableCombatPayCents=7000000;
 assert.equal(calc(value,{adjustedGrossIncomeCents:1000000,wageIncomeCents:1000000}).amountCents,null);
 source.nontaxableCombatPayCents=0;assert.equal(calc(value,{adjustedGrossIncomeCents:1000000,wageIncomeCents:7000000}).amountCents,0);
 assert.equal(calc(value,{adjustedGrossIncomeCents:1000000,wageIncomeCents:7000000,scheduleCProfitCents:-1000000}).amountCents,null);
 assert.equal(calc(value,{adjustedGrossIncomeCents:1000000,wageIncomeCents:6155500,halfSeTaxCents:100}).amountCents,null);source.earnedSourcesReviewed=false;assert.equal(calc(value,{adjustedGrossIncomeCents:1000000,wageIncomeCents:7000000}).amountCents,null);
});
test('combat facts reconcile child-credit and existing NY W-2 evidence; independent AGI proof remains valid',()=>{
 const value=childFixture({children:0,wages:0});review(value);value.individual.childCredits.nontaxableCombatPayCents=100000;
 let result=calc(value,{adjustedGrossIncomeCents:0,wageIncomeCents:0});assert.equal(result.amountCents,null);assert(result.diagnostics.some(row=>row.code==='EIC_COMBAT_SOURCE_CONFLICT'));
 assert.equal(calc(value,{adjustedGrossIncomeCents:8000000}).amountCents,0);delete value.individual.childCredits;value.individual.stateReturns=[{state:'NY',wageRecords:[{box12:[{code:'Q',amountCents:100000}]}]}];assert.equal(calc(value,{adjustedGrossIncomeCents:0,wageIncomeCents:0}).amountCents,null);
});
test('required filer employment SSN known false proves zero; missing or unresolved identifiers do not',()=>{
 for(const year of [2023,2024,2025,2026,2027]){const value=input({year,joint:true});delete value.individual.taxpayerIdentifiers;assert.equal(calc(value).amountCents,null);
  value.individual.taxpayerIdentifiers={taxpayer:identifierFixture(),spouse:{...identifierFixture(),type:'itin',validForEmployment:'no'}};assert.equal(calc(value).amountCents,0);
  value.individual.taxpayerIdentifiers.spouse.reviewed=false;assert.equal(calc(value).amountCents,null);value.individual.taxpayerIdentifiers.spouse=identifierFixture();value.individual.taxpayerIdentifiers.taxpayer.issuedByDueDate='no';assert.equal(calc(value).amountCents,0);
 }
});
test('contradictory repeated joint-filer identifiers cannot prove a required SSN is absent',()=>{
 const value=input({joint:true});value.individual.spouseTaxId=value.party.taxId;value.individual.taxpayerIdentifiers.spouse={...identifierFixture(),type:'itin',validForEmployment:'no'};
 let result=calc(value);assert.equal(result.amountCents,null);assert(result.diagnostics.some(row=>row.code==='EIC_FILER_IDENTIFIER_CONFLICT'));
 result=calc(value,{adjustedGrossIncomeCents:8000000});assert.equal(result.amountCents,0);assert(result.diagnostics.some(row=>row.code==='EIC_FILER_IDENTIFIER_CONFLICT'));
});
test('unresolved income and malformed source overrides never become a calculated credit',()=>{
 const value=input();review(value);assert.equal(calc(value,{adjustedGrossIncomeCents:8000000,otherTreatments:true}).amountCents,null);assert.equal(calc(value,{adjustedGrossIncomeCents:null,wageIncomeCents:null}).amountCents,null);
 value.individual.earnedIncomeCredit.amountCents=100;assert.throws(()=>calc(value),/unsupported field/);delete value.individual.earnedIncomeCredit.amountCents;value.individual.earnedIncomeCredit.nontaxableCombatPayCents=-1;assert.throws(()=>calc(value),/nonnegative/);
});
test('actual draft packet retains independent EIC evidence without dependent forms and leaves possible-credit settlement unknown',async()=>{
 const value=input({wages:50000});review(value);const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
 let packet=await generateDraftPdf(value,{loadTemplate}),text=pdfText(packet.bytes,'-layout');assert.equal(packet.result.summary.earnedIncomeCreditCents,0);assert(!packet.result.childCredits.required);assert.match(text,/Earned Income Credit source review and zero-credit proof/);assert.match(text,/Synthetic independent EIC child\/earnings\/combat sources/);assert.match(text,/AGI-at-or-above-reviewed-no-qualifying-children/);assert.match(text,/19,?104\.00/);
 delete value.individual.earnedIncomeCredit;packet=await generateDraftPdf(value,{loadTemplate});text=pdfText(packet.bytes,'-layout');assert.equal(packet.result.summary.earnedIncomeCreditCents,null);assert.equal(packet.result.summary.paymentsCents,null);assert.equal(packet.result.summary.refundCents,null);assert.equal(packet.result.summary.amountOwedCents,null);assert.match(text,/No EIC source review was entered/);assert.match(text,/separate-EIC-calculation-required/);assert.equal(packet.result.filingReady,false);
});
