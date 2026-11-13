import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn} from '../../tax-engine/index.mjs';
import {reviewed,wage} from '../../tax-engine/test/fixtures.mjs';
test('EIC editor saves and reopens explicit source review and clears private facts',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const target=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(target,label);target.click();await pending;};
 const fill=(key,value)=>{const field=document.querySelector(`#earned-income-credit-editor [data-return-field="${key}"]`);assert(field,key);if(field.type==='checkbox')field.checked=value;else field.value=value;field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  const input=reviewed();input.year=2025;input.individual.w2s=[wage('taxpayer',50000,2000)];delete input.individual.earnedIncomeCredit;editor.edit(input,'synthetic-eic-source');assert.equal(calculateReturn(editor.getInput()).summary.earnedIncomeCreditCents,null);assert.equal(calculateReturn(editor.getInput()).summary.amountOwedCents,null);
  await click('Add EIC source review');assert.equal(editor.getInput().individual.earnedIncomeCredit.qualifyingChildren,'unknown');fill('qualifyingChildren','none');fill('source','SYNTHETIC PRIVATE EIC source');fill('reviewed',true);fill('earnedSourcesReviewed',true);fill('nontaxableCombatPayCents','0.00');assert.equal(calculateReturn(editor.getInput()).summary.earnedIncomeCreditCents,0);
  await click('Encrypt and save return');assert.equal(saved.id,'synthetic-eic-source');editor.edit(saved.input,saved.id);assert.equal(editor.getInput().individual.earnedIncomeCredit.source,'SYNTHETIC PRIVATE EIC source');assert.equal(calculateReturn(editor.getInput()).summary.earnedIncomeCreditCents,0);
  fill('reviewed',false);assert.equal(calculateReturn(editor.getInput()).summary.earnedIncomeCreditCents,null);fill('reviewed',true);await click('Remove EIC source review');assert.equal(calculateReturn(editor.getInput()).summary.earnedIncomeCreditCents,null);
  editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...document.querySelectorAll('input,textarea')].some(field=>field.value.includes('SYNTHETIC PRIVATE')));assert([...editor.element.querySelectorAll('input,select,textarea,button')].every(control=>control.disabled));
 }finally{dom.window.close();}
});
