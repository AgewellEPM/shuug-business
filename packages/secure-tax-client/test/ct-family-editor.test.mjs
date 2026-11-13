import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {ctEitcFixture} from '../../tax-engine/test/state-ct-eitc-fixtures.mjs';
import {calculateReturn} from '../../tax-engine/index.mjs';

test('CT family source editor saves, reopens, recomputes changed wages and clears private fields',async()=>{
 const dom=new JSDOM('<main></main>'),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async input=>{saved=input;},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(button,label);button.click();await pending;};
 const fill=(section,key,value,index=0)=>{const control=document.querySelectorAll(`${section} [data-return-field="${key}"]`)[index];assert(control,key);if(control.type==='checkbox')control.checked=value;else control.value=value;control.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  const {input,ct}=ctEitcFixture({year:2025});input.individual.taxableInterestCents=52500;delete ct.earnedIncomeCredit;editor.edit(input,'synthetic-ct-family');
  await click('Review Connecticut dependent disclosure');fill('#ct-dependent-editor','source','SYNTHETIC PRIVATE CT DEPENDENT SOURCE');fill('#ct-dependent-editor','reviewed',true);
  await click('Add Connecticut EITC source review');fill('#ct-eitc-editor','returnStatus','original');fill('#ct-eitc-editor','filingStatus','sameAsFederal');fill('#ct-eitc-editor','source','SYNTHETIC PRIVATE CT EITC SOURCE');for(const key of ['residency','federalCredit','children','incomeSources'])fill('#ct-eitc-editor',key,true);
  await click('Link another EITC wage source');fill('#ct-eitc-editor','employerFederalId','00-1122300');fill('#ct-eitc-editor','stateIdStatus','notOnSource');fill('#ct-eitc-editor','source','SYNTHETIC PRIVATE CT WAGE SOURCE',1);fill('#ct-eitc-editor','reviewed',true);
  let result=calculateReturn(editor.getInput());assert.equal(result.states[0].earnedIncomeCredit.amountCents,284900);assert.notEqual(result.states[0].summary.refundCents,null);await click('Encrypt and save return');assert.equal(saved.individual.stateReturns[0].earnedIncomeCredit.wageSources[0].w2Id,input.individual.w2s[0].id);editor.edit(saved,'synthetic-ct-family');assert.equal(document.querySelector('#ct-eitc-editor [data-return-field="source"]').value,'SYNTHETIC PRIVATE CT EITC SOURCE');assert.equal(document.querySelector('#ct-dependent-editor [data-return-field="source"]').value,'SYNTHETIC PRIVATE CT DEPENDENT SOURCE');
  const corrected=editor.getInput();for(const key of ['wagesCents','socialSecurityWagesCents','medicareWagesCents'])corrected.individual.w2s[0][key]=4000000;editor.edit(corrected,'synthetic-ct-family');result=calculateReturn(editor.getInput());assert.notEqual(result.states[0].earnedIncomeCredit.amountCents,284900);assert.equal(result.states[0].earnedIncomeCredit.wageSources[0].wagesCents,4000000);
  fill('#ct-eitc-editor','filingStatus','different');assert.equal(calculateReturn(editor.getInput()).states[0].summary.refundCents,null);
  editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...document.querySelectorAll('input,textarea')].some(control=>control.value.includes('SYNTHETIC PRIVATE')));assert([...editor.element.querySelectorAll('input,select,textarea,button')].every(control=>control.disabled));
 }finally{dom.window.close();}
});
