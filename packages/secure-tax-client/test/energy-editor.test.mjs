import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {newReturn,calculateReturn} from '../../tax-engine/index.mjs';

test('energy editor collects costs, QMID, reviews and carryforward into encrypted-save input and clears private fields on lock',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert(button,label);button.click();await pending;};
 const fill=(key,value)=>{const input=document.querySelector(`#residential-energy-editor [data-return-field="${key}"]`);assert(input,key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  const input=newReturn();input.individual.w2s=[{id:'wages',owner:'taxpayer',employer:'Synthetic employer',wagesCents:5000000,socialSecurityWagesCents:5000000,medicareWagesCents:5000000,federalWithholdingCents:0}];editor.edit(input,'saved-return');
  await click('Add residential energy credits');await click('Add energy item');fill('street','SYNTHETIC PRIVATE ENERGY HOME');fill('city','Hartford');fill('state','CT');fill('zip','06103');fill('category','heatPump');fill('costCents','8000');fill('carryforwardCents','500');
  for(const key of ['scope','costs','property','carryforward'])fill(key,true);
  assert.equal(calculateReturn(editor.getInput()).summary.totalTaxCents,null);fill('qmid','A1B2');assert.equal(calculateReturn(editor.getInput()).summary.energyImprovementCreditCents,200000);
  await click('Encrypt and save return');assert.equal(saved.id,'saved-return');assert.equal(saved.input.individual.energyCredits.home.street,'SYNTHETIC PRIVATE ENERGY HOME');assert.equal(saved.input.individual.energyCredits.items[0].costCents,800000);assert.equal(saved.input.individual.energyCredits.carryforwardCents,50000);
  editor.edit(saved.input,'saved-return');assert.equal(document.querySelector('#residential-energy-editor [data-return-field="qmid"]').value,'A1B2');editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert([...editor.element.querySelectorAll('input,select,button')].every(control=>control.disabled));assert(![...document.querySelectorAll('input')].some(input=>input.value.includes('SYNTHETIC PRIVATE')));
 }finally{dom.window.close();}
});

test('changing an unsaved return year preserves energy source records and applies the 2025 QMID requirement',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending;
 const editor=mountReturnEditor(document,document.querySelector('main'),{proposalOnly:true,allowCreation:true,run:task=>{pending=task();return pending;},confirm:()=>true});editor.setEnabled(true);editor.startNew('1040',2024);
 const click=async label=>{[...document.querySelectorAll('button')].find(b=>b.textContent===label).click();await pending;};
 try{
  await click('Add residential energy credits');await click('Add energy item');document.querySelector('#residential-energy-editor [data-return-field="costCents"]').value='1000';const year=document.getElementById('return-year');year.value='2025';year.dispatchEvent(new dom.window.Event('change'));assert.equal(editor.getInput().individual.energyCredits.items[0].costCents,100000);assert.equal(editor.getInput().year,2025);
  await click('Remove this energy item');assert.equal(editor.getInput().individual.energyCredits.items.length,0);await click('Remove residential energy credits');assert.equal(Object.hasOwn(editor.getInput().individual,'energyCredits'),false);
 }finally{dom.window.close();}
});
