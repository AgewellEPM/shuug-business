import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn} from '../../tax-engine/index.mjs';
import {reviewed,wage} from '../../tax-engine/test/fixtures.mjs';
test('encrypted-return editor preserves reviewed eligibility, removes source assumptions and clears private birth dates',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const target=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(target,label);target.click();await pending;};
 const fill=(key,value,index=0)=>{const input=document.querySelectorAll(`#federal-eligibility-editor [data-return-field="${key}"]`)[index];assert(input,key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  const input=reviewed();input.year=2024;input.individual.w2s=[wage('taxpayer',7000,500)];delete input.individual.eligibility;editor.edit(input,'synthetic-eligibility-return');assert.equal(calculateReturn(editor.getInput()).summary.taxableIncomeCents,null);await click('Add federal eligibility sources');assert.equal(editor.getInput().individual.eligibility.taxpayer.blind,'unknown');
  for(const [key,value]of Object.entries({residency:'fullYearCitizenOrResident',returnPeriod:'fullYear',deductionChoice:'standard',dateOfBirth:'2006-06-15',blind:'yes',canBeClaimed:'yes',deceased:'no',source:'SYNTHETIC PRIVATE eligibility source',reviewed:true,status:true,earnedIncome:true}))fill(key,value);fill('source','SYNTHETIC PRIVATE filing status review',1);
  let result=calculateReturn(editor.getInput());assert.equal(result.standardDeduction.deductionCents,940000);assert.equal(result.forms[0].lines['12'],940000);await click('Encrypt and save return');assert.equal(saved.id,'synthetic-eligibility-return');editor.edit(saved.input,saved.id);assert.equal(document.querySelector('#federal-eligibility-editor [data-return-field="dateOfBirth"]').value,'2006-06-15');
  fill('blind','unknown');result=calculateReturn(editor.getInput());assert.equal(result.standardDeduction.deductionCents,null);assert.equal(result.summary.taxableIncomeCents,null);assert.equal(result.summary.totalTaxCents,null);
  editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...document.querySelectorAll('input,textarea')].some(input=>input.value.includes('SYNTHETIC PRIVATE')||input.value==='2006-06-15'));assert([...editor.element.querySelectorAll('input,select,textarea,button')].every(control=>control.disabled));
 }finally{dom.window.close();}
});
