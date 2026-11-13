import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountReturnEditor} from '../browser/return-editor.mjs';
import {calculateReturn} from '../../tax-engine/index.mjs';
import {reviewed,wage} from '../../tax-engine/test/fixtures.mjs';
import {identifiersFixture} from '../../tax-engine/test/schedule-1a-fixtures.mjs';

test('Schedule1A editor saves source records, calculates all four deductions, reopens and clears private input',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending,saved;const editor=mountReturnEditor(document,document.querySelector('main'),{run:task=>{pending=task();return pending;},onSave:async(input,id)=>{saved={input,id};},confirm:()=>true});editor.setEnabled(true);
 const click=async label=>{const target=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(target,label);target.click();await pending;},fill=(key,value,index=0)=>{const field=document.querySelectorAll(`#schedule-1a-editor [data-return-field="${key}"]${typeof value==='boolean'?'[type="checkbox"]':':not([type="checkbox"])'}`)[index];assert(field,key);if(field.type==='checkbox')field.checked=value;else field.value=value;field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{
  const input=reviewed();input.individual.w2s=[wage('taxpayer',65000)];input.individual.eligibility.taxpayer.dateOfBirth='1961-01-01';input.individual.taxpayerIdentifiers=identifiersFixture();editor.edit(input,'synthetic-s1a-return');
  await click('Add Schedule 1-A sources');await click('Add qualified tip source');fill('incomeId','w2-taxpayer');fill('payer','SYNTHETIC PRIVATE TIP EMPLOYER');fill('occupationCode','102');fill('tipAmountCents','10000');fill('sstbStatus','transitionRelief');fill('source','Synthetic employer tip statement');
  await click('Add qualified overtime source');fill('w2Id','w2-taxpayer');fill('method','hoursRate');fill('regularRateCents','20');fill('overtimeHoursHundredths','500');fill('source','Synthetic FLSA payroll hours and regular rate',1);
  await click('Add vehicle purchase loan');fill('vin','1HGCM82633A004352');fill('description','SYNTHETIC PRIVATE VEHICLE');fill('pounds','4500');fill('purchaseDate','2025-03-15');fill('loanDate','2025-03-15');fill('interestCents','5000');fill('source','Synthetic original loan and assembly source',2);
  await click('Add senior deduction review');fill('source','Synthetic senior review',3);for(const check of document.querySelectorAll('#schedule-1a-editor input[type="checkbox"]'))check.checked=true;
  let draft=editor.getInput(),result=calculateReturn(draft);assert.equal(result.calculationAvailable,true);assert.equal(result.schedule1A.deductionCents,2600000);assert.equal(draft.individual.schedule1A.overtime[0].overtimeHoursHundredths,50000);assert.equal(draft.individual.schedule1A.vehicles[0].gvwrPounds,4500);
  await click('Encrypt and save return');assert.equal(saved.id,'synthetic-s1a-return');editor.edit(saved.input,saved.id);assert.equal(document.querySelector('#schedule-1a-editor [data-return-field="payer"]').value,'SYNTHETIC PRIVATE TIP EMPLOYER');assert.equal(document.querySelector('#schedule-1a-editor [data-return-field="interestCents"]').value,'5000.00');fill('lawful',false);assert.equal(calculateReturn(editor.getInput()).summary.totalTaxCents,null);
  editor.clear();editor.setEnabled(false);assert(!document.body.textContent.includes('SYNTHETIC PRIVATE'));assert(![...document.querySelectorAll('input,textarea')].some(field=>field.value.includes('SYNTHETIC PRIVATE')));assert([...editor.element.querySelectorAll('input,select,textarea,button')].every(control=>control.disabled));
 }finally{dom.window.close();}
});

test('year change preserves Schedule1A sources and unsupported 2024 cannot reuse a2025 calculation',async()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),document=dom.window.document;let pending;const editor=mountReturnEditor(document,document.querySelector('main'),{proposalOnly:true,allowCreation:true,run:task=>{pending=task();return pending;},confirm:()=>true});editor.setEnabled(true);editor.startNew('1040',2025);
 const click=async label=>{const target=[...document.querySelectorAll('button')].find(button=>button.textContent===label);assert(target,label);target.click();await pending;};
 try{await click('Add Schedule 1-A sources');await click('Add vehicle purchase loan');const vin=document.querySelector('#schedule-1a-editor [data-return-field="vin"]');vin.value='1HGCM82633A004352';const year=document.getElementById('return-year');year.value='2024';year.dispatchEvent(new dom.window.Event('change'));assert.equal(editor.getInput().individual.schedule1A.vehicles[0].vin,'1HGCM82633A004352');assert(calculateReturn(editor.getInput()).diagnostics.some(row=>row.code==='S1A_YEAR_UNSUPPORTED'));await click('Remove this vehicle loan');await click('Remove Schedule 1-A sources');assert.equal(editor.getInput().individual.schedule1A,undefined);}finally{dom.window.close();}
});
