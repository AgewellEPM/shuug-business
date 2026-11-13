import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn,newEicCombatSource} from '../../tax-engine/index.mjs';
import {nyEicFixture,nyNoncustodialFixture} from '../../tax-engine/test/state-ny-eic-fixtures.mjs';

function harness(){
 const dom=new JSDOM('<main></main>'),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async input=>{saved=input;},confirm:()=>true});editor.setEnabled(true);
 return {dom,document,editor,get saved(){return saved;},async click(label){const button=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(button,label);button.click();await pending;},fill(section,key,value,index=0){const control=document.querySelectorAll(`${section} [data-return-field="${key}"]`)[index];assert(control,key);if(control.type==='checkbox')control.checked=value;else control.value=value;control.dispatchEvent(new dom.window.Event('input',{bubbles:true}));},clear(){editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...document.querySelectorAll('input,textarea')].some(control=>control.value.includes('SYNTHETIC PRIVATE')));assert([...editor.element.querySelectorAll('input,select,textarea,button')].every(control=>control.disabled));}};
}

test('New York EIC source editor creates the review, saves, reopens and recomputes changed original wages',async()=>{
 const h=harness();try{
  const {input,state}=nyEicFixture();delete state.earnedIncomeCredit;h.editor.edit(input,'synthetic-ny-eic');await h.click('Add New York EIC source review');
  for(const [key,value]of [['filingStatus','sameAsFederal'],['returnType','original'],['worksheetBCredits','none'],['source','SYNTHETIC PRIVATE NY EIC SOURCE']])h.fill('#ny-eic-editor',key,value);for(const key of ['filing','federal','income','worksheetB'])h.fill('#ny-eic-editor',key,true);
  h.fill('#ny-noncustodial-editor','source','SYNTHETIC PRIVATE COMPLETE CHILD REVIEW');h.fill('#ny-noncustodial-editor','children',true);h.fill('#ny-noncustodial-editor','orders',true);
  let result=calculateReturn(h.editor.getInput()).states[0];assert.equal(result.lines['65'],15000);assert.equal(result.lines['70'],16200);assert.equal(result.summary.refundCents,29500);await h.click('Encrypt and save return');assert.equal(h.saved.individual.stateReturns[0].earnedIncomeCredit.noncustodial.source,'SYNTHETIC PRIVATE COMPLETE CHILD REVIEW');h.editor.edit(h.saved,'synthetic-ny-eic');assert.equal(h.document.querySelector('#ny-eic-editor [data-return-field="source"]').value,'SYNTHETIC PRIVATE NY EIC SOURCE');
  const after=h.editor.getInput();for(const key of ['wagesCents','socialSecurityWagesCents','medicareWagesCents'])after.individual.w2s[0][key]=1500000;Object.assign(after.individual.stateReturns[0].wageRecords[0],{nyWagesCents:1500000,nycWagesCents:1500000});h.editor.edit(after,'synthetic-ny-eic');result=calculateReturn(h.editor.getInput()).states[0];assert.notEqual(result.lines['65'],15000);assert.notEqual(result.summary.refundCents,null);h.fill('#ny-eic-editor','worksheetBCredits','other');assert.equal(calculateReturn(h.editor.getInput()).states[0].summary.refundCents,null);h.clear();
 }finally{h.dom.window.close();}
});

test('NY noncustodial orders and distinct combat elections roundtrip through the editor and calculated candidate view',async()=>{
 const h=harness();try{
  const {input,source}=nyNoncustodialFixture();source.noncustodial.orders[0].source='SYNTHETIC PRIVATE SUPPORT ORDER';const eic=input.individual.earnedIncomeCredit;eic.nontaxableCombatPayCents=200000;eic.award.combatSources=[{...newEicCombatSource(input.individual.w2s[0].id,'taxpayer'),amountCents:200000,source:'Synthetic original combat source',reviewed:true}];eic.award.combatElections.taxpayer='exclude';if(input.individual.childCredits)Object.assign(input.individual.childCredits,{nontaxableCombatPayCents:200000,combatPaySource:'Synthetic original combat source'});
  h.editor.edit(input,'synthetic-ny-noncustodial');await h.click('Calculate draft');const comparison=h.document.querySelector('.ny-eic-election-results');assert(comparison);assert.match(comparison.textContent,/1,?623\.00/);assert.match(comparison.textContent,/1,?355\.00/);assert.equal(calculateReturn(h.editor.getInput()).states[0].summary.refundCents,null);
  h.fill('#ny-noncustodial-editor','taxpayer','include');let result=calculateReturn(h.editor.getInput()).states[0];assert.equal(result.lines['66'],135500);assert.equal(result.lines['65'],0);assert.equal(result.earnedIncomeCredit.noncustodial.selectedElection.combatPayCents,200000);await h.click('Encrypt and save return');assert.equal(h.saved.individual.earnedIncomeCredit.award.combatElections.taxpayer,'exclude');assert.equal(h.saved.individual.stateReturns[0].earnedIncomeCredit.noncustodial.combatElections.taxpayer,'include');h.editor.edit(h.saved,'synthetic-ny-noncustodial');assert.equal(h.document.querySelector('#ny-noncustodial-editor [data-return-field="claimantRelationship"]').value,'biological');
  h.fill('#ny-noncustodial-editor','currentSupportPaidCents','1000');result=calculateReturn(h.editor.getInput()).states[0];assert.equal(result.lines['66'],0);assert.equal(result.lines['65'],15000);assert.equal(result.earnedIncomeCredit.noncustodial.reason,'current-support-not-paid-for-every-order');h.clear();
 }finally{h.dom.window.close();}
});
