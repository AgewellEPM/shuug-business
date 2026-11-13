import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn} from '../../tax-engine/index.mjs';

test('household editor preserves unknown quarters, saves payroll and clears names/EIN on lock',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async input=>{saved=input;},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert(button,label);button.click();await pending;};
 const fill=(label,value)=>{const caption=[...document.querySelectorAll('#household-employment-editor label')].find(l=>l.textContent===label);assert(caption,label);const input=document.getElementById(caption.htmlFor);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  await click('Add household employer');await click('Add household worker');fill('Household employer EIN (hidden)','00-0123456');fill('Worker name','SYNTHETIC PRIVATE PAYROLL');fill('2025 quarter 1 cash wages (USD)','10000');fill('Social Security / Medicare treatment','ordinary');fill('Federal unemployment treatment','ordinary');fill('State unemployment jurisdiction (two letters)','CT');fill('State unemployment contributions paid (USD; blank is unknown)','270');
  for(const input of document.querySelectorAll('#household-employment-editor input[type=checkbox]'))input.checked=true;
  fill('Assigned a 0% state experience rate; no contributions due',false);
  let value=editor.getInput();assert.deepEqual(value.individual.householdEmployers[0].priorYearFutaQuartersCents,[null,null,null,null]);assert.equal(calculateReturn(value).summary.householdEmploymentTaxCents,157200);
  fill('2025 quarter 1 cash wages (USD)','775');fill('2025 quarter 2 cash wages (USD)','775');fill('2025 quarter 3 cash wages (USD)','775');fill('2025 quarter 4 cash wages (USD)','775');assert.equal(calculateReturn(editor.getInput()).summary.totalTaxCents,null);
  for(let q=1;q<=4;q++)fill(`Prior-year quarter ${q} (USD; blank is unknown)`,'0');assert.equal(calculateReturn(editor.getInput()).summary.householdEmploymentTaxCents,47400);
  await click('Encrypt and save return');assert.equal(saved.individual.householdEmployers[0].employees[0].name,'SYNTHETIC PRIVATE PAYROLL');editor.edit(saved,'saved-household');assert.equal(editor.getInput().individual.householdEmployers[0].employees[0].quartersCents[3],77500);
  editor.clear();editor.setEnabled(false);assert(![...document.querySelectorAll('input')].some(input=>input.value.includes('SYNTHETIC PRIVATE')||input.value==='00-0123456'));assert([...editor.element.querySelectorAll('input,select,button')].every(control=>control.disabled));
 }finally{dom.window.close();}
});
test('household source quarters survive a tax-year change; removing employer removes the optional input',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending;
 const editor=mountReturnEditor(document,document.querySelector('main'),{proposalOnly:true,allowCreation:true,run:task=>{pending=task();return pending;},confirm:()=>true});editor.setEnabled(true);editor.startNew('1040',2024);
 const click=async label=>{[...document.querySelectorAll('button')].find(b=>b.textContent===label).click();await pending;};
 try{
  await click('Add household employer');await click('Add household worker');const caption=[...document.querySelectorAll('#household-employment-editor label')].find(l=>l.textContent==='2024 quarter 1 cash wages (USD)');document.getElementById(caption.htmlFor).value='2700';
  const year=document.getElementById('return-year');year.value='2025';year.dispatchEvent(new dom.window.Event('change'));assert.equal(editor.getInput().individual.householdEmployers[0].employees[0].quartersCents[0],270000);assert(document.body.textContent.includes('2025 quarter 1 cash wages'));
  await click('Remove this household worker');assert.equal(editor.getInput().individual.householdEmployers[0].employees.length,0);await click('Remove this household employer');assert.equal(Object.hasOwn(editor.getInput().individual,'householdEmployers'),false);
 }finally{dom.window.close();}
});
test('Section B editor saves rates, late payments and worker/state allocations; missing amounts stay unknown and lock clears private source text',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;
 const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async input=>{saved=input;},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert(button,label);button.click();await pending;};
 const fill=(label,value)=>{const caption=[...document.querySelectorAll('#household-employment-editor label')].find(l=>l.textContent===label);assert(caption,label);const input=document.getElementById(caption.htmlFor);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  await click('Add household employer');await click('Add household worker');fill('Household employer EIN (hidden)','00-0123456');fill('Worker name','SYNTHETIC PRIVATE STATE PAYROLL');fill('2025 quarter 1 cash wages (USD)','10000');fill('Social Security / Medicare treatment','ordinary');fill('Federal unemployment treatment','ordinary');
  for(const input of document.querySelectorAll('#household-employment-editor input[type=checkbox]'))input.checked=true;
  fill('All required state contributions paid by the original return due date',false);fill('Assigned a 0% state experience rate; no contributions due',false);
  await click('Add detailed state unemployment / Section B');await click('Add state rate period');fill('Rate-period state (two letters)','CA');fill('State taxable wages (USD; blank is unknown)','10000');fill('State experience-rate assignment','assigned');fill('Assigned experience rate (%)','2.7');fill('Rate period begins (YYYY-MM-DD)','2025-01-01');fill('Rate period ends (YYYY-MM-DD)','2025-12-31');fill('Eligible contributions paid after original due date (USD)','270');fill('State rate / payment source reference','PRIVATE SYNTHETIC PAYMENT NOTICE');
  await click('Add worker/state FUTA allocation');const workerId=editor.getInput().individual.householdEmployers[0].employees[0].id;fill('FUTA allocation worker',workerId);fill('FUTA allocation state (two letters or EX)','CA');fill('Allocated capped FUTA wages (USD; blank is unknown)','7000');fill('Reviewed: every eligible worker’s capped FUTA wages allocated once; state-excluded wages identified',true);fill('Reviewed: all state rate periods and eligible employer payments recorded; no employee charges, penalties, interest, voluntary payments or excess-credit letter claims',true);
  assert.equal(calculateReturn(editor.getInput()).summary.householdEmploymentTaxCents,null);assert.equal(Object.hasOwn(editor.getInput().individual.householdEmployers[0].unemployment.sectionB.rows[0],'paidOnTimeCents'),false);
  fill('Eligible contributions paid by original due date (USD)','0');assert.equal(calculateReturn(editor.getInput()).summary.householdEmploymentTaxCents,166700);
  await click('Encrypt and save return');assert.equal(saved.individual.householdEmployers[0].unemployment.sectionB.rows[0].experienceRate,'2.7');editor.edit(saved,'state-detail');assert.equal(calculateReturn(editor.getInput()).summary.householdEmploymentTaxCents,166700);
  const year=document.getElementById('return-year');assert.equal(year.disabled,true);year.value='2024';year.dispatchEvent(new dom.window.Event('change'));assert.equal(editor.getInput().year,2025);const differentYear=editor.getInput();differentYear.year=2024;assert.equal(calculateReturn(differentYear).summary.householdEmploymentTaxCents,null);
  editor.clear();editor.setEnabled(false);assert(![...document.querySelectorAll('input')].some(input=>input.value.includes('PRIVATE SYNTHETIC')||input.value.includes('PRIVATE STATE')));
 }finally{dom.window.close();}
});
