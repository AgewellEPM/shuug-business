import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn} from '../../tax-engine/index.mjs';
import {nyEmpireChildFixture} from '../../tax-engine/test/state-ny-child-fixtures.mjs';

function harness(){
 const dom=new JSDOM('<main></main>'),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async input=>{saved=input;},confirm:()=>true});editor.setEnabled(true);
 return {dom,document,editor,get saved(){return saved;},async click(label){const button=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(button,label);button.click();await pending;},fill(section,key,value){const control=document.querySelector(`${section} [data-return-field="${key}"]`);assert(control,key);if(control.type==='checkbox')control.checked=value;else control.value=value;control.dispatchEvent(new dom.window.Event('input',{bubbles:true}));},clear(){editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...document.querySelectorAll('input,textarea')].some(control=>control.value.includes('SYNTHETIC PRIVATE')));assert([...editor.element.querySelectorAll('input,select,textarea,button')].every(control=>control.disabled));}};
}

for(const year of [2023,2025])test(`${year} Empire State source editor creates, links, calculates, saves and reopens actual child sources`,async()=>{
 const h=harness();try{
  const {input,state}=nyEmpireChildFixture({year,children:1,wages:30000,joint:false,locality:'none'});delete state.empireChildCredit;h.editor.edit(input,'synthetic-NY-child');await h.click('Add Empire State child-credit review');
  h.fill('#ny-child-editor','filingStatus','sameAsFederal');h.fill('#ny-child-editor','source','SYNTHETIC PRIVATE NY CHILD ORIGINALS');
  for(const key of ['filing','children','identityTiming','competingClaims',...(year===2025?[]:['federalCreditSources','foreignBondSources'])])h.fill('#ny-child-editor',key,true);
  if(year!==2025)for(const key of ['buildAmericaBondInterest','magiExclusions','otherCreditTreatments'])h.fill('#ny-child-editor',key,'none');
  assert.equal(calculateReturn(h.editor.getInput()).states[0].lines['63'],null);await h.click('Link another child for Empire State review');
  h.fill('#ny-child-claims','claim','yes');h.fill('#ny-child-claims','competingClaim','none');h.fill('#ny-child-claims','source','SYNTHETIC PRIVATE CHILD CLAIM');h.fill('#ny-child-claims','reviewed',true);
  const result=calculateReturn(h.editor.getInput()).states[0];assert.equal(result.lines['63'],33000);assert.equal(result.empireChildCredit.known,true);assert.equal(result.summary.amountOwedCents,null,'separate care review remains unresolved');
  await h.click('Calculate draft');assert.match(h.document.querySelector('.ny-child-credit-results').textContent,/330\.00 USD/);assert.match(h.document.querySelector('.ny-child-credit-results').textContent,/Other required state amounts remain unresolved/);
  await h.click('Encrypt and save return');assert.equal(h.saved.individual.stateReturns[0].empireChildCredit.children[0].dependentId,input.individual.dependents[0].id);h.editor.edit(h.saved,'synthetic-NY-child');assert.equal(h.document.querySelector('#ny-child-editor [data-return-field="source"]').value,'SYNTHETIC PRIVATE NY CHILD ORIGINALS');
  await h.click('Remove this New York child claim');assert.equal(calculateReturn(h.editor.getInput()).states[0].lines['63'],null);h.clear();
 }finally{h.dom.window.close();}
});

test('2025 unclaimed child keeps shared identity and New York claim separate when edited and corrected',async()=>{
 const h=harness();try{
  const {input,state}=nyEmpireChildFixture({year:2025,children:1,wages:30000,joint:false,locality:'none'});input.individual.dependents[0].claim='no';state.dependents=[];h.editor.edit(input,'synthetic-NY-unclaimed-child');
  assert.equal(calculateReturn(h.editor.getInput()).states[0].lines['63'],33000);h.fill('#ny-child-claims','source','SYNTHETIC PRIVATE INDEPENDENT NY CLAIM');await h.click('Encrypt and save return');assert.equal(h.saved.individual.dependents[0].claim,'no');assert.equal(h.saved.individual.stateReturns[0].empireChildCredit.children[0].claim,'yes');
  h.editor.edit(h.saved,'synthetic-NY-unclaimed-child');h.fill('#ny-child-claims','reviewed',false);const result=calculateReturn(h.editor.getInput()).states[0];assert.equal(result.lines['63'],null);assert.equal(result.summary.amountOwedCents,null);h.clear();
 }finally{h.dom.window.close();}
});
