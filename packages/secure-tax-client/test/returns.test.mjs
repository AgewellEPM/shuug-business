import {fillEligibility} from './eligibility-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { newReturn,calculateReturn } from '@shuug/tax-engine';
import { mountReturnEditor } from '../browser/return-editor.mjs';
import { renderStaffRecords } from '../browser/staff-view.mjs';
import { maskedDisplay } from '../browser/forms.mjs';
import {mountStaffUpdates} from '../browser/staff-updates.mjs';
const dom=()=>new JSDOM('<!doctype html><body><main></main></body>',{pretendToBeVisual:true});
function click(document,text){const button=[...document.querySelectorAll('button')].find(button=>button.textContent===text);assert(button,`Button ${text} exists`);button.click();}
function fill(document,key,value){const input=document.querySelector(`[data-return-field="${key}"]`);assert(input,key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));}

test('W-2 box 6 keeps unknown, explicit zero and entered withholding separate through editing and save',async()=>{
  const view=dom(),document=view.window.document;let operation,saved;
  const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{operation=task();return operation;},onSave:async value=>{saved=value;}});editor.setEnabled(true);
  try{
    click(document,'Add W-2');await operation;
    for(const field of ['wagesCents','medicareWagesCents','socialSecurityWagesCents'])fill(document,field,'220000');
    const value=()=>editor.getInput();assert.equal(value().individual.w2s[0].medicareTaxWithheldCents,undefined);assert.equal(calculateReturn(value()).summary.paymentsCents,null);
    fill(document,'medicareTaxWithheldCents','0');assert.equal(value().individual.w2s[0].medicareTaxWithheldCents,0);assert.equal(calculateReturn(value()).summary.paymentsCents,0);
    const year=document.getElementById('return-year');year.value='2024';year.dispatchEvent(new view.window.Event('change'));assert.equal(document.querySelector('[data-return-field="medicareTaxWithheldCents"]').value,'0.00');assert.equal(value().individual.w2s[0].medicareTaxWithheldCents,0);
    fill(document,'medicareTaxWithheldCents','3370');assert.equal(calculateReturn(value()).summary.additionalMedicareWithholdingCents,18000);
    fill(document,'medicareTaxWithheldCents','');assert.equal(Object.hasOwn(value().individual.w2s[0],'medicareTaxWithheldCents'),false);assert.equal(calculateReturn(value()).summary.amountOwedCents,null);
    fill(document,'medicareTaxWithheldCents','3370');click(document,'Encrypt and save return');await operation;assert.equal(saved.individual.w2s[0].medicareTaxWithheldCents,337000);
  }finally{view.window.close();}
});

test('real return editor supports wages and Schedule C without JSON and saves integer cents',async()=>{
  const view=dom(),document=view.window.document,pending=[],saved=[],editor=mountReturnEditor(document,document.querySelector('main'),{onSave:async value=>saved.push(value),run:operation=>{const task=operation();pending.push(task);return task;}});editor.setEnabled(true);
  fill(document,'name','Synthetic Client');fill(document,'taxId','000123456');click(document,'Add W-2');await pending.at(-1);fill(document,'wagesCents','50000');fill(document,'socialSecurityWagesCents','50000');fill(document,'medicareWagesCents','50000');fill(document,'federalWithholdingCents','5000');
  fillEligibility(document);assert(editor.dirty);click(document,'Calculate draft');await pending.at(-1);assert.match(document.body.textContent,/3875.00 USD/);assert.match(document.body.textContent,/not transmitted/);
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
test('ordinary proposal forms keep return family fixed and pause staff refresh until saved or cleared',async()=>{
  const view=dom(),document=view.window.document,root=document.querySelector('main'),target=document.createElement('div'),editorArea=document.createElement('div');root.append(target,editorArea);let editor,reads=0,operation,saved;
  const input=newReturn('1120'),record={domain:'tax-document',objectId:'synthetic-return',revision:1,plaintext:new TextEncoder().encode(JSON.stringify(input))},client={identity:{staffAccountId:'synthetic'},unlocked:true,selectedGrant:{accountId:'synthetic-account',clientId:'synthetic-client'},config:{workspaceId:'synthetic'},records:new Map([[record.objectId,record]]),sync:async()=>{reads++;return {items:1};}};
  const run=task=>{operation=task();return operation;};editor=mountReturnEditor(document,editorArea,{proposalOnly:true,run,confirm:()=>true,onSave:async value=>{saved=value;}});editor.setEnabled(true);
  const updates=mountStaffUpdates(document,target,{getClient:()=>client,run,canRefresh:()=>!editor.dirty,onReturnEdit:(data,id)=>editor.edit(data,id),timers:{setTimer:()=>1,clearTimer:()=>{}}});
  try{await updates.check();assert.equal(reads,1);click(document,'Propose return correction');await operation;assert.equal(editor.element.hidden,false);assert(document.getElementById('return-kind').disabled);assert.equal(await updates.check(),false);assert.equal(reads,1);fill(document,'receiptsCents','2000');click(document,'Save private correction review kit');await operation;assert.equal(saved.entity.receiptsCents,200000);assert.equal(editor.element.hidden,true);assert.equal(editor.dirty,false);await updates.check();assert.equal(reads,2);
    click(document,'Propose return correction');await operation;fill(document,'receiptsCents','9999');click(document,'Discard correction');assert.equal(editor.dirty,false);assert.equal(editor.element.hidden,true);assert.equal(document.querySelector('[data-return-field="receiptsCents"]').value,'');await updates.check();assert.equal(reads,3);
  }finally{updates.destroy();view.window.close();}
});
test('new staff-return proposals offer both families, pause refresh and clear private input without weakening corrections',async()=>{
  const view=dom(),document=view.window.document,root=document.querySelector('main'),target=document.createElement('div'),editorArea=document.createElement('div');root.append(target,editorArea);let editor,operation,reads=0;const saved=[];
  const client={identity:{staffAccountId:'synthetic-preparer'},unlocked:true,selectedGrant:{accountId:'synthetic-account',clientId:'synthetic-client'},config:{workspaceId:'synthetic'},records:new Map(),sync:async()=>{reads++;return {items:0};}},run=task=>{operation=task();return operation;};
  editor=mountReturnEditor(document,editorArea,{proposalOnly:true,allowCreation:true,confirm:()=>true,run,onSave:async(value,id)=>saved.push({value,id,mode:editor.proposalMode})});editor.setEnabled(true);
  const updates=mountStaffUpdates(document,target,{getClient:()=>client,run,canRefresh:()=>!editor.dirty,timers:{setTimer:()=>1,clearTimer:()=>{}}});
  try{
    assert.equal(editor.element.hidden,true);await updates.check();assert.equal(reads,1);
    for(const kind of ['1040','1065','1120S','1120']){
      editor.startNew();assert.equal(editor.proposalMode,'creation');assert.equal(editor.element.hidden,false);assert.equal(editor.editingId,null);assert.equal(editor.dirty,true);assert.equal(document.getElementById('return-kind').disabled,false);assert.equal(await updates.check(),false);
      const choice=document.getElementById('return-kind');choice.value=kind;choice.dispatchEvent(new view.window.Event('change'));fill(document,'name','SYNTHETIC PRIVATE NEW RETURN');fill(document,'taxId','000123456');
      if(kind==='1040'){click(document,'Add W-2');await operation;fill(document,'wagesCents','50000');}else fill(document,'receiptsCents','1000.01');
      click(document,'Save private new-return review kit');await operation;const item=saved.at(-1);assert.equal(item.value.kind,kind);assert.equal(item.mode,'creation');assert.equal(item.id,null);assert.equal(item.value.party.taxId,'000123456');assert.equal(editor.element.hidden,true);assert.equal(editor.dirty,false);await updates.check();
    }
    editor.edit(newReturn('1120'),'existing-return');assert.equal(editor.proposalMode,'correction');const choice=document.getElementById('return-kind');assert.equal(choice.disabled,true);choice.value='1065';choice.dispatchEvent(new view.window.Event('change'));assert.equal(editor.getInput().kind,'1120');assert.equal(choice.value,'1120');click(document,'Discard correction');
    editor.startNew('1065');fill(document,'name','SYNTHETIC PRIVATE UNSAVED RETURN');fill(document,'taxId','000123456');click(document,'Discard new return');assert.equal(editor.active,false);assert.equal(editor.element.hidden,true);await updates.check();
    editor.startNew('1040');fill(document,'name','SYNTHETIC PRIVATE LOCKED RETURN');editor.clear();editor.setEnabled(false);assert.equal(editor.dirty,false);assert.equal(editor.active,false);assert.equal(editor.element.hidden,true);assert([...editor.element.querySelectorAll('input,textarea,select,button')].every(control=>control.disabled));assert(![...editor.element.querySelectorAll('input,textarea')].some(control=>control.value.includes('SYNTHETIC PRIVATE')||control.value.includes('000123456')));
  }finally{updates.destroy();view.window.close();}
});

test('year selection preserves entered data, drives annual calculations and stays fixed for corrections',async()=>{
  const view=dom(),document=view.window.document;let operation,saved;
  const editor=mountReturnEditor(document,document.querySelector('main'),{proposalOnly:true,allowCreation:true,confirm:()=>true,run:task=>{operation=task();return operation;},onSave:async value=>{saved=value;}});editor.setEnabled(true);
  try{for(const [year,tax]of [[2023,'4121.00'],[2024,'4019.00']]){
    editor.startNew('1040');fillEligibility(document);fill(document,'name','Synthetic annual return');click(document,'Add W-2');await operation;fill(document,'wagesCents','50000');
    const select=document.getElementById('return-year');assert.deepEqual([...select.options].map(option=>option.value),['2023','2024','2025','2026','2027']);select.value=String(year);select.dispatchEvent(new view.window.Event('change'));assert.equal(editor.getInput().party.name,'Synthetic annual return');
    click(document,'Calculate draft');await operation;assert.match(document.body.textContent,new RegExp(tax));click(document,'Save private new-return review kit');await operation;assert.equal(saved.year,year);
    editor.edit(saved,'annual-existing');assert.equal(select.disabled,true);select.value=String(year===2023?2024:2023);select.dispatchEvent(new view.window.Event('change'));assert.equal(editor.getInput().year,year);click(document,'Discard correction');
  }}finally{view.window.close();}
});
