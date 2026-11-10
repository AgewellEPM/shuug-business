import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { newReturn,calculateReturn } from '@shuug/tax-engine';
import { mountReturnEditor } from '../browser/return-editor.mjs';
import { renderStaffRecords } from '../browser/staff-view.mjs';
import { maskedDisplay } from '../browser/forms.mjs';
const dom=()=>new JSDOM('<!doctype html><body><main></main></body>',{pretendToBeVisual:true});
function click(document,text){const button=[...document.querySelectorAll('button')].find(button=>button.textContent===text);assert(button,`Button ${text} exists`);button.click();}
function fill(document,key,value){const input=document.querySelector(`[data-return-field="${key}"]`);assert(input,key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));}

test('real return editor supports wages and Schedule C without JSON and saves integer cents',async()=>{
  const view=dom(),document=view.window.document,pending=[],saved=[],editor=mountReturnEditor(document,document.querySelector('main'),{onSave:async value=>saved.push(value),run:operation=>{const task=operation();pending.push(task);return task;}});editor.setEnabled(true);
  fill(document,'name','Synthetic Client');fill(document,'taxId','000123456');click(document,'Add W-2');await pending.at(-1);fill(document,'wagesCents','50000');fill(document,'socialSecurityWagesCents','50000');fill(document,'medicareWagesCents','50000');fill(document,'federalWithholdingCents','5000');
  assert(editor.dirty);click(document,'Calculate draft');await pending.at(-1);assert.match(document.body.textContent,/3875.00 USD/);assert.match(document.body.textContent,/not transmitted/);
  click(document,'Encrypt and save return');await pending.at(-1);assert.equal(saved.length,1);assert.equal(saved[0].individual.w2s[0].wagesCents,5000000);assert.equal(editor.dirty,false);
  click(document,'Add Schedule C business');await pending.at(-1);fill(document,'receiptsCents','123.456');click(document,'Calculate draft');await assert.rejects(()=>pending.at(-1),/two decimal/);assert.equal(document.querySelector('[data-return-field="receiptsCents"]').value,'123.456');view.window.close();
});
test('both business families preserve exact percentages, additional treatments and form coverage',async()=>{
  for(const kind of ['1065','1120S','1120']){const view=dom(),document=view.window.document,pending=[],saved=[],editor=mountReturnEditor(document,document.querySelector('main'),{onSave:async value=>saved.push(value),run:operation=>{const task=operation();pending.push(task);return task;}});editor.setEnabled(true);const choice=document.getElementById('return-kind');choice.value=kind;choice.dispatchEvent(new view.window.Event('change'));
    fill(document,'name','Synthetic Business');fill(document,'receiptsCents','1000.01');click(document,'Add owner');await pending.at(-1);fill(document,'value','100.00');
    // Percentage is a separate display field because stored shares are basis points.
    click(document,'Encrypt and save return');await pending.at(-1);assert.equal(saved[0].kind,kind);assert.equal(saved[0].entity.owners[0].shareBps,10000);assert.equal(saved[0].entity.receiptsCents,100001);assert.equal(calculateReturn(saved[0]).filingReady,false);view.window.close();}
});
test('lock clears every identity/amount and scope changes discard pending completion',async()=>{
  const view=dom(),document=view.window.document;let scope=1,operation,release,saved=false;
  const editor=mountReturnEditor(document,document.querySelector('main'),{captureScope:()=>scope,isCurrentScope:value=>value===scope,onSave:async()=>{await new Promise(resolve=>{release=resolve;});saved=true;},run:task=>{operation=task();}});editor.setEnabled(true);fill(document,'name','SYNTHETIC PRIVATE RETURN');fill(document,'taxId','000123456');click(document,'Encrypt and save return');scope++;editor.clear();editor.setEnabled(false);release();await operation;assert(saved);assert.equal(editor.dirty,false);assert.equal([...document.querySelectorAll('input,textarea')].some(input=>input.value.includes('000123456')||input.value.includes('SYNTHETIC PRIVATE RETURN')),false);assert([...document.querySelectorAll('input,button')].every(input=>input.disabled));view.window.close();
});
test('staff return view calculates only shared input, hides IDs and never offers a client write',()=>{
  const view=dom(),document=view.window.document,input=newReturn('1120');input.party.name='<img src=x onerror=untrusted()>';input.party.taxId='000123456';input.entity.receiptsCents=10000000;const records=new Map([['return',{domain:'tax-document',objectId:'return',revision:2,plaintext:new TextEncoder().encode(JSON.stringify(input))}]]);document.body.append(renderStaffRecords(document,records,{workspaceId:'synthetic',accountId:'account',clientId:'client'}));
  assert.match(document.body.textContent,/21000.00 USD/);assert.equal(document.querySelectorAll('input,textarea,select,img,script').length,0);assert(!document.body.textContent.includes('000123456'));assert(!document.body.textContent.includes('Encrypt and save'));assert.deepEqual(maskedDisplay({taxId:'000123456',spouseTaxId:'000654321',ein:'123456789'}),{taxId:'•••-••-3456',spouseTaxId:'•••-••-4321',ein:'•••-••-6789'});view.window.close();
});
