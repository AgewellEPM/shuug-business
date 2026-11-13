import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateReturn,newNYEic} from '../index.mjs';
import {nyEicFixture,nyNoncustodialFixture} from './state-ny-eic-fixtures.mjs';

for(const [year,amount]of [[2023,52800],[2024,60900],[2025,65200]])test(`${year} federal zero still flows to a separately established New York noncustodial credit`,()=>{
 const {input}=nyNoncustodialFixture({year,wages:30000}),before=structuredClone(input),result=calculateReturn(input),state=result.states[0];assert.equal(result.summary.earnedIncomeCreditCents,0);assert.equal(state.lines['65'],0);assert.equal(state.lines['66'],amount);assert.equal(state.lines['76'],amount);assert.equal(state.summary.amountOwedCents,Math.max(0,state.summary.totalTaxCents-amount));assert(state.forms.some(row=>row.form==='nyit209'));assert.equal(result.filingReady,false);assert.deepEqual(input,before);
});

test('a known federal zero without the separate noncustodial source review keeps NY state credits and settlement unresolved',()=>{
 const {input,state}=nyEicFixture({wages:30000,locality:'none'});delete state.earnedIncomeCredit;let result=calculateReturn(input).states[0];assert.equal(result.earnedIncomeCredit.ordinaryStateCreditCents,0);assert.equal(result.lines['66'],null);assert.equal(result.summary.refundCents,null);assert(result.diagnostics.some(row=>row.code==='NY_IT209_CHILD_COMPLETENESS'));state.earnedIncomeCredit=newNYEic();result=calculateReturn(input).states[0];assert.equal(result.summary.refundCents,null);
});

test('household and EIC worksheet amounts remain independent of unfinished Empire State child and NYC elimination credits',()=>{
 const {input}=nyEicFixture({children:2,wages:10000,joint:true}),result=calculateReturn(input).states[0];assert.equal(result.lines['40'],10500);assert.equal(result.earnedIncomeCredit.known,true);assert.equal(result.earnedIncomeCredit.worksheetB.lines['1'],result.lines['39']);assert.notEqual(result.lines['65'],null);assert.notEqual(result.lines['70'],null);assert.equal(result.summary.refundCents,null);assert(result.diagnostics.some(row=>row.code==='NY_CHILD_CREDIT_REVIEW'));assert(result.diagnostics.some(row=>row.code==='NY_CITY_ELIMINATION_REVIEW'));
});

test('2026 and 2027 NY EIC source intake is strict and never borrows an earlier annual state calculation',()=>{
 for(const year of [2026,2027]){const {input,state}=nyEicFixture({year});let result=calculateReturn(input);assert.equal(result.calculationAvailable,true);assert(result.states[0].diagnostics.some(row=>row.code==='NY_YEAR_UNAVAILABLE'));assert.deepEqual(result.states[0].forms,[]);assert(Object.values(result.states[0].summary).every(value=>value===null));state.earnedIncomeCredit.amountCents=10000;assert.equal(calculateReturn(input).status,'invalid-input');delete state.earnedIncomeCredit.amountCents;state.earnedIncomeCredit.noncustodial.review.children='yes';assert.equal(calculateReturn(input).status,'invalid-input');}
});

test('2025 independent Empire State child scope prevents an unclaimed eligible child from silently becoming zero credit',()=>{
 const {input,state}=nyEicFixture({year:2025,children:1,wages:30000,joint:false,locality:'none'});input.individual.dependents[0].claim='no';state.dependents=[];const result=calculateReturn(input).states[0];assert.equal(result.earnedIncomeCredit.known,true);assert.equal(result.lines['65'],97800);assert.equal(result.lines['63'],null);assert.equal(result.summary.refundCents,null);assert.equal(result.summary.amountOwedCents,null);assert(result.diagnostics.some(row=>row.code==='NY_EMPIRE_UNCLAIMED_CHILD_REVIEW'));
 const nc=nyNoncustodialFixture({year:2025,wages:30000});let out=calculateReturn(nc.input).states[0];assert(!out.diagnostics.some(row=>row.code==='NY_EMPIRE_UNCLAIMED_CHILD_REVIEW'));assert.equal(out.lines['63'],0);nc.input.individual.dependents[0].review.residency=false;out=calculateReturn(nc.input).states[0];assert(out.diagnostics.some(row=>row.code==='NY_EMPIRE_UNCLAIMED_CHILD_REVIEW'));assert.equal(out.summary.amountOwedCents,null);
});
