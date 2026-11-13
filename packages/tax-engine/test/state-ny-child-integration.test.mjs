import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateReturn,newNYEmpireChildCredit} from '../index.mjs';
import {nyEmpireChildFixture} from './state-ny-child-fixtures.mjs';

for(const year of [2023,2024,2025])test(`${year} original Empire credit flows to IT201 independently of unfinished care and city credits`,()=>{
 const {input}=nyEmpireChildFixture({year,children:1,wages:30000,joint:false,locality:'nyc'}),before=structuredClone(input),result=calculateReturn(input),ny=result.states[0];
 assert.equal(ny.empireChildCredit.known,true);assert.equal(ny.lines['63'],33000);assert.equal(ny.lines['64'],null);assert.equal(ny.summary.paymentsCents,null);assert.equal(ny.summary.amountOwedCents,null);assert(ny.forms.some(row=>row.form==='nyit213'));assert(ny.diagnostics.some(row=>row.code==='NY_CHILD_CREDIT_REVIEW'));if(year===2025)assert(ny.diagnostics.some(row=>row.code==='NY_CITY_ELIMINATION_REVIEW'));assert.equal(result.filingReady,false);assert.deepEqual(input,before);
});

test('2025 unclaimed child credit does not imply that separate care credit is zero',()=>{
 const {input,state}=nyEmpireChildFixture({year:2025,children:1,wages:30000,joint:false,locality:'none'}),child=input.individual.dependents[0];child.claim='no';child.dateOfBirth='2015-06-15';state.dependents=[];
 let ny=calculateReturn(input).states[0];assert.equal(ny.lines['63'],33000);assert.equal(ny.lines['64'],null);assert.equal(ny.summary.amountOwedCents,null);assert(ny.diagnostics.some(row=>row.code==='NY_CHILD_CREDIT_REVIEW'));
 for(const birth of ['2012-06-15','2011-06-15']){child.dateOfBirth=birth;ny=calculateReturn(input).states[0];assert.equal(ny.lines['63'],33000);assert.equal(ny.lines['64'],null,'year-end age and no permanent disability do not establish care-service ages or absence of incapacity');assert.equal(ny.summary.amountOwedCents,null);}
 child.review.studentDisability=false;ny=calculateReturn(input).states[0];assert.equal(ny.lines['63'],33000);assert.equal(ny.lines['64'],null);assert.equal(ny.summary.amountOwedCents,null);
});

test('2026/2027 retain strict Empire source intake without substituting an older calculation or PDF',()=>{
 for(const year of [2026,2027]){
  const {input,state}=nyEmpireChildFixture({year,children:1,wages:30000,joint:false,locality:'none'});let result=calculateReturn(input);assert.equal(result.status,'needs-attention');assert(result.states[0].diagnostics.some(row=>row.code==='NY_YEAR_UNAVAILABLE'));assert.deepEqual(result.states[0].forms,[]);
  state.empireChildCredit.amountCents=33000;assert.equal(calculateReturn(input).status,'invalid-input');state.empireChildCredit=newNYEmpireChildCredit();state.empireChildCredit.review.children='yes';assert.equal(calculateReturn(input).status,'invalid-input');
 }
});

test('an ordinary Empire source cannot erase a retained declaration of additional family-credit treatment',()=>{
 const {input,state}=nyEmpireChildFixture();state.unsupportedTreatments.push('childCredits');const ny=calculateReturn(input).states[0];assert.equal(ny.lines['63'],null);assert.equal(ny.summary.refundCents,null);assert(ny.diagnostics.some(row=>row.code==='NY_EMPIRE_SPECIAL_TREATMENT'));
});
