import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn,newEicCombatSource} from '../../tax-engine/index.mjs';
import {eicFixture} from '../../tax-engine/test/eic-fixtures.mjs';

function editorHarness(){
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const target=[...document.querySelectorAll('button')].find(row=>row.textContent===label);assert(target,label);target.click();await pending;};
 const fill=(selector,value)=>{const input=document.querySelector(selector);assert(input,selector);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 return {dom,document,editor,click,fill,get saved(){return saved;}};
}
test('EIC award editor preserves annual source decisions, months and privacy through save/reopen and lock',async()=>{
 const h=editorHarness();try{
  const empty=eicFixture();delete empty.individual.earnedIncomeCredit.award;h.editor.edit(empty,'synthetic-eic');await h.click('Add EIC award sources');const defaults=h.editor.getInput().individual.earnedIncomeCredit.award;assert.equal(defaults.persons.taxpayer.citizenshipResidence,'unknown');assert(Object.values(defaults.scope.review).every(value=>value===false));assert.equal(calculateReturn(h.editor.getInput()).summary.earnedIncomeCreditCents,null);
  for(const [year,expected]of [[2023,545500],[2024,613100],[2025,649800]]){const input=eicFixture({year});input.individual.taxableInterestCents=52500;input.individual.dependents[0].residencyDays=200;input.individual.dependents[0].usResidencyDays=200;h.editor.edit(input,'synthetic-eic-'+year);
   h.fill('#eic-award-editor [data-eic-owner="taxpayer"] [data-return-field="source"]','SYNTHETIC PRIVATE EIC residence '+year);h.fill('#eic-award-editor [data-eic-child="synthetic-dependent-0"] [data-return-field="text"]','7');assert.equal(h.editor.getInput().individual.earnedIncomeCredit.award.children[0].usHomeMonths,7);assert.equal(calculateReturn(h.editor.getInput()).summary.earnedIncomeCreditCents,expected);
   h.fill('#eic-award-editor [data-return-field="investment"]',false);assert.equal(calculateReturn(h.editor.getInput()).summary.earnedIncomeCreditCents,null);h.fill('#eic-award-editor [data-return-field="investment"]',true);await h.click('Encrypt and save return');assert.equal(h.saved.id,'synthetic-eic-'+year);h.editor.edit(h.saved.input,h.saved.id);assert.equal(calculateReturn(h.editor.getInput()).summary.earnedIncomeCreditCents,expected);assert.equal(h.editor.getInput().individual.earnedIncomeCredit.award.persons.taxpayer.source,'SYNTHETIC PRIVATE EIC residence '+year);
  }
  await h.click('Remove EIC award sources');assert.equal(calculateReturn(h.editor.getInput()).summary.earnedIncomeCreditCents,null);h.editor.clear();h.editor.setEnabled(false);assert(!h.document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...h.document.querySelectorAll('input,textarea')].some(row=>row.value.includes('SYNTHETIC PRIVATE')));assert([...h.editor.element.querySelectorAll('input,select,textarea,button')].every(row=>row.disabled));
 }finally{h.dom.window.close();}
});
test('the actual return view shows combat candidates and the editor retains the chosen owner election',async()=>{
 const h=editorHarness();try{
  const input=eicFixture({wages:20000}),source=input.individual.earnedIncomeCredit;source.nontaxableCombatPayCents=4000000;input.individual.childCredits.nontaxableCombatPayCents=4000000;input.individual.childCredits.combatPaySource='Synthetic code Q';source.award.combatSources=[{...newEicCombatSource(input.individual.w2s[0].id,'taxpayer'),amountCents:4000000,source:'Synthetic code Q',reviewed:true}];h.editor.edit(input,'synthetic-combat-election');
  await h.click('Calculate draft');assert.equal(h.document.querySelectorAll('.eic-election-results li').length,2);assert.match(h.document.querySelector('.eic-election-results').textContent,/Taxpayer: include combat pay/);assert.match(h.document.querySelector('.eic-election-results').textContent,/Taxpayer: exclude combat pay/);assert.equal(h.editor.getInput().individual.earnedIncomeCredit.award.combatElections.taxpayer,'unknown');assert.equal(calculateReturn(h.editor.getInput()).summary.refundCents,null);
  h.fill('#eic-award-editor [data-return-field="taxpayer"]','exclude');await h.click('Encrypt and save return');h.editor.edit(h.saved.input,h.saved.id);assert.equal(h.editor.getInput().individual.earnedIncomeCredit.award.combatElections.taxpayer,'exclude');assert(calculateReturn(h.editor.getInput()).summary.earnedIncomeCreditCents>0);
 }finally{h.dom.window.close();}
});
