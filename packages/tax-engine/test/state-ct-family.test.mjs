import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateReturn,newCTDependentDisclosure,newCTEarnedIncomeCredit} from '../index.mjs';
import {ctEitcFixture} from './state-ct-eitc-fixtures.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfText} from './pdf-text.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
const disclosure=ct=>{ct.dependentDisclosure={...newCTDependentDisclosure(),source:'Synthetic original federal and Connecticut dependent disclosure',reviewed:true};};

// Federal Grey examples are published; these CT amounts are derived from the
// annual CT schedules using synthetic residency/identity/source facts.
for(const [year,federal,credit]of [[2023,545500,218200],[2024,613100,245200],[2025,649800,284900]])test(`${year} source-linked CT family credit settles the actual return and original state schedules`,async()=>{
 const {input,ct}=ctEitcFixture({year});input.individual.taxableInterestCents=52500;disclosure(ct);const before=structuredClone(input),result=calculateReturn(input),state=result.states[0];
 assert.equal(result.summary.earnedIncomeCreditCents,federal);assert.equal(state.earnedIncomeCredit.amountCents,credit);assert.equal(state.lines['20a'],credit);assert.equal(state.lines['21'],credit);assert.equal(state.summary.refundCents,Math.max(0,credit-state.summary.totalTaxCents));assert.equal(state.dependentDisclosure.totalDependents,2);assert.equal(state.dependentDisclosure.known,true);assert.equal(result.filingReady,false);
 for(const id of ['ct1040','ctdependent','ct1040eitc'])assert(state.forms.some(form=>form.form===id),id);
 const packet=await generateDraftPdf(input,{loadTemplate});try{const text=pdfText(packet.bytes,'-layout');assert.match(text,/Schedule CT.Dependent/);assert.match(text,/Schedule CT.EITC/);for(const id of ['ct1040','ctdependent','ct1040eitc'])assert(packet.audit.some(row=>row.form===id),id);assert(packet.audit.find(row=>row.form==='ct1040').fields.some(row=>row.line==='20a'));assert(packet.audit.find(row=>row.form==='ct1040eitc').fields.some(row=>row.line==='16'));assert(!JSON.stringify(packet.audit).includes(input.individual.dependents[0].taxId));}finally{packet.bytes.fill(0);}assert.deepEqual(input,before);
});

test('CT dependent source review and federal claim changes invalidate or remove the actual attachment',()=>{
 const {input,ct}=ctEitcFixture();let result=calculateReturn(input),state=result.states[0];assert.equal(state.earnedIncomeCredit.known,true);assert.equal(state.dependentDisclosure.known,false);assert.equal(state.summary.paymentsCents,null);assert(!state.forms.some(row=>row.form==='ctdependent'));
 disclosure(ct);state=calculateReturn(input).states[0];assert.equal(state.dependentDisclosure.known,true);assert.notEqual(state.summary.refundCents,null);
 input.individual.dependents[0].review.support=false;state=calculateReturn(input).states[0];assert.equal(state.dependentDisclosure.known,false);assert.equal(state.summary.refundCents,null);
 input.individual.dependents[0].review.support=true;for(const row of input.individual.dependents)row.claim='no';state=calculateReturn(input).states[0];assert.equal(state.dependentDisclosure.required,false);assert.equal(state.dependentDisclosure.known,true);assert(!state.forms.some(row=>row.form==='ctdependent'));assert.equal(state.earnedIncomeCredit.amountCents,289600);assert.notEqual(state.summary.refundCents,null);
});

test('existing declared CT family requirements resolve only after their source workflows are completed',()=>{
 const {input,ct}=ctEitcFixture();ct.unsupportedTreatments=['dependents','earnedIncomeCredit'];let state=calculateReturn(input).states[0];assert.equal(state.summary.refundCents,null);disclosure(ct);state=calculateReturn(input).states[0];assert.notEqual(state.summary.refundCents,null);assert(!state.diagnostics.some(row=>row.code==='CT_ADDITIONAL_TREATMENT'));
 ct.unsupportedTreatments.push('otherCredit');state=calculateReturn(input).states[0];assert.equal(state.summary.refundCents,null);assert(state.diagnostics.some(row=>row.code==='CT_ADDITIONAL_TREATMENT'));
});

test('dependent ITIN disclosure and unresolved federal claims do not become complete SSN schedules',()=>{
 const {input,ct}=ctEitcFixture({wages:80000});disclosure(ct);const child=input.individual.dependents[0];child.identifier.type='itin';child.identifier.validForEmployment='no';let state=calculateReturn(input).states[0];assert.equal(state.dependentDisclosure.known,false);assert(state.dependentDisclosure.diagnostics.some(row=>row.code==='CT_DEPENDENT_IDENTIFIER_REVIEW'));assert.equal(state.summary.refundCents,null);
 child.identifier.type='ssn';child.identifier.validForEmployment='yes';child.claim='unknown';state=calculateReturn(input).states[0];assert.equal(state.dependentDisclosure.known,false);assert(!state.forms.some(row=>row.form==='ctdependent'));
});

test('CT dependent disclosure remains strict even when no dependent claim is required',()=>{
 const {input,ct}=ctEitcFixture({children:0});disclosure(ct);ct.dependentDisclosure.unrecognized=true;assert.equal(calculateReturn(input).status,'invalid-input');delete ct.dependentDisclosure.unrecognized;ct.dependentDisclosure.reviewed='yes';assert.equal(calculateReturn(input).status,'invalid-input');
});

test('blank source factories cannot dismiss previously declared dependent or EITC requirements after a federal zero',()=>{
 for(const treatment of ['dependents','earnedIncomeCredit']){
  const {input,ct}=ctEitcFixture({children:0,wages:80000});delete ct.earnedIncomeCredit;ct.unsupportedTreatments=[treatment];let state=calculateReturn(input).states[0];assert.equal(state.summary.refundCents,null);
  if(treatment==='dependents')ct.dependentDisclosure=newCTDependentDisclosure();else ct.earnedIncomeCredit=newCTEarnedIncomeCredit();state=calculateReturn(input).states[0];assert.equal(state.summary.refundCents,null);assert(state.diagnostics.some(row=>row.code==='CT_ADDITIONAL_TREATMENT'));
 }
});

test('2026 and 2027 keep strict CT source intake without substituting an earlier annual calculation',()=>{
 for(const year of [2026,2027]){
  const {input,ct}=ctEitcFixture({year});ct.dependentDisclosure=newCTDependentDisclosure();ct.earnedIncomeCredit=newCTEarnedIncomeCredit();let result=calculateReturn(input);assert.equal(result.calculationAvailable,true);assert(result.states[0].diagnostics.some(row=>row.code==='CT_YEAR_UNAVAILABLE'));assert.deepEqual(result.states[0].forms,[]);assert(Object.values(result.states[0].summary).every(value=>value===null));
  ct.dependentDisclosure.reviewed='yes';assert.equal(calculateReturn(input).status,'invalid-input');ct.dependentDisclosure.reviewed=false;ct.earnedIncomeCredit.amountCents=10000;assert.equal(calculateReturn(input).status,'invalid-input');delete ct.earnedIncomeCredit.amountCents;ct.earnedIncomeCredit.returnStatus='assumedOriginal';assert.equal(calculateReturn(input).status,'invalid-input');
 }
});
