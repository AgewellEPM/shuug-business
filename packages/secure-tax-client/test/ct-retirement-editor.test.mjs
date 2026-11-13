import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {reviewed} from '../../tax-engine/test/fixtures.mjs';
import {retirementFixture,distribution} from '../../tax-engine/test/retirement-fixtures.mjs';
import {calculateReturn,newCTStateReturn} from '../../tax-engine/index.mjs';

test('Connecticut source-linked pension editor saves and reopens elections, recomputes federal changes and clears private sources',async()=>{
 const dom=new JSDOM('<main></main>'),document=dom.window.document;let pending,saved;const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async input=>{saved=input;},confirm:()=>true});editor.setEnabled(true);
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(row=>row.textContent===text);assert(button,text);button.click();await pending;};
 const fill=(key,value,index=0)=>{const input=document.querySelectorAll(`#state-return-editor [data-return-field="${key}"]`)[index];assert(input,key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{const input=reviewed(),retirement=input.individual.retirementIncome=retirementFixture();retirement.distributions=[distribution('qualifiedPlan',30000)];const state=newCTStateReturn();Object.keys(state.review).forEach(key=>state.review[key]=true);state.useTax.reviewed=true;input.individual.stateReturns=[state];editor.edit(input,'synthetic-ct-retirement');
  await click('Connect federal retirement records');await click('Classify this federal pension');fill('kind','teachers');fill('teacherElection','teacher50');fill('source','SYNTHETIC PRIVATE TEACHERS SOURCE');fill('reviewed',true);fill('source','SYNTHETIC PRIVATE CT WORKSHEET',1);fill('reviewed',true,1);
  let draft=editor.getInput(),result=calculateReturn(draft).states[0];assert.equal(result.lines['45'],1500000);assert.equal(result.lines['48b'],0);assert.equal(result.lines['5'],1500000);await click('Encrypt and save return');assert.equal(saved.individual.stateReturns[0].retirement.distributions[0].distributionId,retirement.distributions[0].id);
  editor.edit(saved,'synthetic-ct-retirement');assert.equal(document.querySelector('#state-return-editor [data-return-field="source"]').value,'SYNTHETIC PRIVATE TEACHERS SOURCE');fill('teacherElection','pension');assert.equal(calculateReturn(editor.getInput()).states[0].lines['48b'],3000000);
  draft=editor.getInput();draft.individual.retirementIncome.distributions[0].grossCents=4000000;draft.individual.retirementIncome.distributions[0].reportedTaxableCents=4000000;editor.edit(draft,'synthetic-ct-retirement');assert.equal(calculateReturn(editor.getInput()).states[0].lines['48b'],4000000);
  editor.clear();editor.setEnabled(false);assert(![...document.querySelectorAll('input,textarea')].some(row=>row.value.includes('SYNTHETIC PRIVATE')));assert([...editor.element.querySelectorAll('input,select,textarea,button')].every(row=>row.disabled));
 }finally{dom.window.close();}
});
