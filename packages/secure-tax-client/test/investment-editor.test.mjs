import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {newReturn,calculateReturn} from '../../tax-engine/index.mjs';

test('investment editor preserves legacy money, saves payer/disclosure reviews, reopens and clears private values on lock',async()=>{
  const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;
  const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
  const click=async label=>{const target=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(target,label);target.click();await pending;};
  const fill=(key,value,index=0)=>{const input=document.querySelectorAll(`#investment-income-editor [data-return-field="${key}"]`)[index];assert(input,key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  try{
    const input=newReturn();input.individual.taxableInterestCents=123400;input.individual.ordinaryDividendsCents=345600;input.individual.w2s=[{id:'synthetic-w2',owner:'taxpayer',employer:'Synthetic employer',wagesCents:22000000,socialSecurityWagesCents:22000000,medicareWagesCents:22000000,medicareTaxWithheldCents:337000,federalWithholdingCents:3000000}];editor.edit(input,'synthetic-return');
    await click('Add interest/dividend payer records');let draft=editor.getInput();assert.equal(draft.individual.taxableInterestCents,0);assert.equal(draft.individual.ordinaryDividendsCents,0);assert.equal(draft.individual.investmentIncome.interestPayers[0].amountCents,123400);assert.equal(draft.individual.investmentIncome.dividendPayers[0].amountCents,345600);assert.equal(document.querySelector('[data-return-field="taxableInterestCents"]'),null);
    fill('payer','SYNTHETIC PRIVATE BANK');fill('source','SYNTHETIC PRIVATE SOURCE');fill('payer','Synthetic fund',1);fill('foreignAccount','no');fill('foreignTrust','no');for(const key of Object.keys(draft.individual.investmentIncome.review))fill(key,true);
    assert.equal(calculateReturn(editor.getInput()).summary.netInvestmentIncomeTaxCents,17800);
    await click('Encrypt and save return');assert.equal(saved.id,'synthetic-return');assert.equal(saved.input.individual.investmentIncome.interestPayers[0].payer,'SYNTHETIC PRIVATE BANK');editor.edit(saved.input,'synthetic-return');assert.equal(document.querySelector('#investment-income-editor [data-return-field="source"]').value,'SYNTHETIC PRIVATE SOURCE');
    await click('Remove investment section and keep aggregate amounts');draft=editor.getInput();assert.equal(draft.individual.investmentIncome,undefined);assert.equal(draft.individual.taxableInterestCents,123400);assert.equal(draft.individual.ordinaryDividendsCents,345600);
    saved.input.individual.taxableInterestCents=123401;editor.edit(saved.input,'synthetic-return');assert.equal(calculateReturn(editor.getInput()).summary.totalTaxCents,null);fill('taxableInterestCents','0');assert.equal(calculateReturn(editor.getInput()).summary.netInvestmentIncomeTaxCents,17800);
    editor.edit(saved.input,'synthetic-return');editor.clear();editor.setEnabled(false);assert(![...document.querySelectorAll('input')].some(input=>input.value.includes('SYNTHETIC PRIVATE')));assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert([...editor.element.querySelectorAll('input,select,button')].every(control=>control.disabled));
  }finally{dom.window.close();}
});
