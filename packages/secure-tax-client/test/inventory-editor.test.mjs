import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn} from '../../tax-engine/index.mjs';
import {reviewed,business} from '../../tax-engine/test/fixtures.mjs';

test('inventory editor preserves source amounts, reconciles prior totals, saves and reopens through actual return editor',async()=>{
 const dom=new JSDOM('<main></main>'),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>(pending=Promise.resolve().then(task)),onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
 const click=async text=>{const target=[...document.querySelectorAll('button')].find(button=>button.textContent===text);assert(target,text);target.click();await pending;};
 const fill=(key,value)=>{const input=document.querySelector(`[data-inventory-editor] [data-return-field="${key}"]`);assert(input,key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  const original=reviewed();original.individual.businesses=[{...business(),costOfGoodsCents:300049}];editor.edit(original,'inventory-return');await click('Add inventory workpaper');
  fill('beginningCents','1000.49');fill('purchasesCents','3000.49');fill('closingCents','1000.49');fill('source','SYNTHETIC PRIVATE COUNT');fill('methodChanged','no');fill('subnormalWriteDown','no');fill('lifo','none');fill('section263a','exempt');fill('capitalizationExplanation','Synthetic exemption and accounting source');for(const key of Object.keys(editor.getInput().individual.businesses[0].inventory.review))fill(key,true);
  let value=editor.getInput();assert.equal(value.individual.businesses[0].inventory.beginningCents,100049);assert.equal(value.individual.businesses[0].costOfGoodsCents,300049);assert.equal(calculateReturn(value).forms.find(row=>row.form==='f1040sc').lines['4'],300000);
  await click('Encrypt and save return');assert.equal(saved.id,'inventory-return');editor.edit(saved.input,saved.id);assert.equal(editor.getInput().individual.businesses[0].inventory.source,'SYNTHETIC PRIVATE COUNT');
  fill('closingCents','1500');value=editor.getInput();assert.equal(calculateReturn(value).summary.totalTaxCents,null);assert(calculateReturn(value).diagnostics.some(row=>row.code==='INVENTORY_AGGREGATE_CONFLICT'));
  editor.clear();editor.setEnabled(false);assert(![...document.querySelectorAll('input,textarea')].some(node=>node.value.includes('SYNTHETIC PRIVATE COUNT')));
 }finally{dom.window.close();}
});
