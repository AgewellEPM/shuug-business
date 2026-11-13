import {eligibilityFixture} from './eligibility-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {newReturn,calculateReturn} from '../../tax-engine/index.mjs';

test('Connecticut editor calculates separate state totals, preserves unavailable-state data and roundtrips private sources',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const target=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(target,label);target.click();await pending;};
 const fill=(key,value,index=0)=>{const target=document.querySelectorAll(`#state-return-editor [data-return-field="${key}"]`)[index];assert(target,key);if(target.type==='checkbox')target.checked=value;else target.value=value;target.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  const input=newReturn();input.individual.eligibility=eligibilityFixture();Object.assign(input.individual.earnedIncomeCredit,{qualifyingChildren:'none',source:'Synthetic reviewed EIC childlessness and complete wage sources',reviewed:true,earnedSourcesReviewed:true});Object.assign(input.party,{name:'Synthetic State Example',firstName:'Synthetic',lastName:'State Example',taxId:'000000001',street:'1 Synthetic Street',city:'Hartford',state:'CT',zip:'06103'});for(const key of Object.keys(input.review))input.review[key]=true;input.individual.w2s=[{id:'synthetic-ct-wage',owner:'taxpayer',employer:'Synthetic employer',wagesCents:5000000,socialSecurityWagesCents:5000000,medicareWagesCents:5000000,medicareTaxWithheldCents:72500,federalWithholdingCents:500000}];input.individual.stateReturns=[{state:'NY',retainedSource:{reference:'SYNTHETIC PRIVATE NY SOURCE'}}];editor.edit(input,'synthetic-state-return');
  await click('Add Connecticut resident return');await click('Add Connecticut withholding statement');fill('payer','SYNTHETIC PRIVATE CT EMPLOYER');fill('payerId','00-0000002');fill('wagesCents','50000');fill('withholdingCents','2000');fill('source','SYNTHETIC PRIVATE CT STATEMENT');fill('reviewed',true);fill('reviewed',true,1);
  for(const key of ['residency','adjustments','withholding','payments','credits','filingCharges','coverage'])if(key!=='residency')fill(key,true);fill('residency',true,1);
  let draft=editor.getInput(),result=calculateReturn(draft),state=result.states.find(item=>item.state==='CT');assert.equal(result.calculationAvailable,true);assert.equal(state.summary.incomeTaxCents,180000);assert.equal(state.summary.refundCents,20000);assert.equal(result.summary.totalTaxCents,387500);assert.equal(result.states.find(item=>item.state==='NY').summary.totalTaxCents,null);
  await click('Encrypt and save return');assert.equal(saved.id,'synthetic-state-return');assert.deepEqual(saved.input.individual.stateReturns[0],input.individual.stateReturns[0]);assert.equal(saved.input.individual.stateReturns[1].withholdings[0].source,'SYNTHETIC PRIVATE CT STATEMENT');editor.edit(saved.input,saved.id);assert.equal(document.querySelector('#state-return-editor [data-return-field="payer"]').value,'SYNTHETIC PRIVATE CT EMPLOYER');
  fill('selected',true,0);state=calculateReturn(editor.getInput()).states.find(item=>item.state==='CT');assert.equal(state.summary.totalTaxCents,null);assert(state.diagnostics.some(item=>item.code==='CT_ADDITIONAL_TREATMENT'));
  editor.edit(saved.input,saved.id);await click('Remove Connecticut state return');assert.deepEqual(editor.getInput().individual.stateReturns,input.individual.stateReturns);editor.edit(saved.input,saved.id);editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...document.querySelectorAll('input')].some(input=>input.value.includes('SYNTHETIC PRIVATE')));assert([...editor.element.querySelectorAll('input,select,button')].every(control=>control.disabled));
 }finally{dom.window.close();}
});
