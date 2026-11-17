import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountAutoTaxView} from '../browser/auto-tax-view.mjs';

function fixture({recoveryActions=false}={}){
  const dom=new JSDOM('<main><div id="before"></div></main>'),document=dom.window.document;
  let epoch=0,working=false,task=Promise.resolve();const calls=[],errors=[],dirty=[];
  const client={clientOnly:true,unlocked:true,canWrite:true,scope:{profile:'client-only-v1',workspaceId:'synthetic-workspace',accountId:'synthetic-account',clientId:'synthetic-client',keyId:'synthetic-key'}};
  const state={phase:'ready',year:2025,years:[2023,2024,2025,2026,2027],persisted:false,error:null,settings:{version:1,incomeConfirmed:false,businessConfirmed:false,vehicleMethod:'unreviewed',mileageEligible:false,incomeDecisions:{},expenseDecisions:{}},model:{year:2025,input:{},source:{digest:'source-A',records:[{id:'income-1',kind:'income',body:{description:'Synthetic platform receipt',date:'2025-04-01',amountCents:10000,currency:'USD'},fingerprint:'income-fingerprint',origins:[]},{id:'expense-1',kind:'expense',body:{merchant:'Synthetic <script>merchant</script>',date:'2025-04-02',amountCents:2000,currency:'USD'},fingerprint:'expense-fingerprint',origins:[]}],years:[2025],issues:[]},totals:{recordedIncomeCents:10000,recordedExpenseCents:2000,businessDistanceMeters:1609.344,receiptsCents:null,deductionsCents:null,profitCents:null},issues:[{code:'GROSS_REVIEW',message:'Review gross receipts and possible duplicate entries.'}],incomeConfirmed:false,businessConfirmed:false}};
  const view=mountAutoTaxView(document,document.getElementById('before'),{getClient:()=>client,getState:()=>state,onYear:year=>{calls.push(['year',year]);state.year=year;},onSettings:patch=>{calls.push(['settings',patch]);Object.assign(state.settings,patch);},onExpenseReview:async(id,value)=>{calls.push(['expense',id,value]);state.settings.expenseDecisions[id]=value;},onIncomeReview:(id,value)=>{calls.push(['income',id,value]);state.settings.incomeDecisions[id]=value;},onPdf:()=>calls.push(['pdf']),onEdit:()=>calls.push(['edit']),...(recoveryActions?{onReload:()=>calls.push(['reload']),onReviewPrior:()=>calls.push(['prior'])}:{}),run:operation=>{task=Promise.resolve().then(operation).catch(error=>errors.push(error.message));return task;},isWorking:()=>working,captureScope:()=>epoch,isCurrentScope:captured=>captured===epoch,onDirty:value=>dirty.push(value)});
  const find=text=>[...document.querySelectorAll('button')].find(button=>button.textContent===text);
  const change=(element,value,event='change')=>{element.value=value;element.dispatchEvent(new dom.window.Event(event,{bubbles:true}));};
  view.render();return {dom,document,client,state,calls,errors,dirty,view,find,change,flush:async()=>{await task;await Promise.resolve();},switchAccount:()=>{epoch++;client.scope={...client.scope,accountId:'another-account'};},setWorking:value=>{working=value;}};
}

test('private draft separates recorded totals from unknown Schedule C and never creates filing or tax totals',()=>{
  const f=fixture(),text=f.view.element.textContent;
  assert.match(text,/Income recorded in app/);assert.match(text,/\$100\.00/);assert.match(text,/Business miles recorded/);
  assert.equal([...f.document.querySelectorAll('.tax-return-totals dd')].filter(node=>node.textContent==='Needs review').length,3);
  assert.match(text,/not your final income tax, refund or amount owed/);assert.match(text,/not merely bank deposits or net platform payouts/);
  assert.match(text,/No return is signed or filed/);assert.match(text,/Review gross receipts/);
  assert.equal(f.document.querySelectorAll('script').length,0);assert.deepEqual(f.calls,[]);assert.equal(f.find('Download draft PDF').disabled,true);assert.equal(f.find('Open full return editor').disabled,false);assert.match(text,/Review the app amounts/);
  f.client.clientOnly=false;f.view.render();assert.equal(f.view.element.hidden,true);assert.equal(f.view.element.textContent,'');
});

test('explicit income and eligibility controls emit only reviewed settings and fingerprint-bound choices',async()=>{
  const f=fixture();f.find('Exclude this income').click();await f.flush();
  assert.deepEqual(f.calls.pop(),['income','income-1',{fingerprint:'income-fingerprint',include:false}]);
  f.document.getElementById('auto-tax-income-confirmed').click();await f.flush();assert.deepEqual(f.calls.pop(),['settings',{incomeConfirmed:true}]);
  f.document.getElementById('auto-tax-business-confirmed').click();await f.flush();assert.deepEqual(f.calls.pop(),['settings',{businessConfirmed:true}]);
  f.change(f.document.getElementById('auto-tax-vehicle-method'),'standard');await f.flush();assert.deepEqual(f.calls.pop(),['settings',{vehicleMethod:'standard',mileageEligible:false}]);
  f.view.render();f.document.getElementById('auto-tax-mileage-eligible').click();await f.flush();assert.deepEqual(f.calls.pop(),['settings',{mileageEligible:true}]);
});

test('expense typing remains unsaved and pauses navigation until exact-money review or explicit cancellation',async()=>{
  const f=fixture(),category=f.document.querySelector('#auto-tax-expense-review select'),amount=f.document.querySelector('#auto-tax-expense-review input');
  assert.equal(amount.value,'');f.change(category,'meals');f.change(amount,'12.34','input');
  assert.equal(f.view.dirty,true);assert.equal(f.document.getElementById('auto-tax-year').disabled,true);assert.equal(f.find('Download draft PDF').disabled,true);assert.equal(f.document.getElementById('auto-tax-income-confirmed').disabled,true);assert.equal(f.document.getElementById('auto-tax-vehicle-method').disabled,true);assert.deepEqual(f.calls,[]);
  f.view.render();assert.equal(f.document.querySelector('#auto-tax-expense-review input').value,'12.34');
  f.find('Save this expense review').click();await f.flush();
  assert.deepEqual(f.calls.pop(),['expense','expense-1',{fingerprint:'expense-fingerprint',category:'meals',deductibleCents:1234}]);
  assert.equal(f.view.dirty,false);assert.equal(f.document.getElementById('auto-tax-year').disabled,false);
  f.change(f.document.querySelector('#auto-tax-expense-review input'),'0','input');f.find('Save this expense review').click();await f.flush();assert.equal(f.calls.at(-1)[2].deductibleCents,0);
  f.change(f.document.querySelector('#auto-tax-expense-review input'),'9.00','input');f.find('Cancel this expense input').click();assert.equal(f.view.dirty,false);assert.equal(f.document.querySelector('#auto-tax-expense-review input').value,'0.00');
});

test('invalid or excessive deduction never reaches controller and original input remains editable',async()=>{
  const f=fixture();f.change(f.document.querySelector('#auto-tax-expense-review select'),'supplies');
  for(const value of ['20.01','1.001','-1','NaN','1e3']){
    f.change(f.document.querySelector('#auto-tax-expense-review input'),value,'input');f.find('Save this expense review').click();await f.flush();
    assert.equal(f.calls.length,0);assert.equal(f.view.dirty,true);assert.equal(f.document.querySelector('#auto-tax-expense-review input').value,value);
  }
  assert.match(f.view.element.textContent,/amount|decimal/);f.find('Cancel unfinished expense inputs').click();assert.equal(f.view.dirty,false);
});

test('detached controls cannot approve changed sources or a different account',async()=>{
  const f=fixture(),income=f.find('Include this income'),confirm=f.document.getElementById('auto-tax-income-confirmed');
  f.state.model.source.records[0].fingerprint='income-changed';income.click();await f.flush();assert.equal(f.calls.length,0);
  f.state.model.source.digest='source-B';confirm.click();await f.flush();assert.equal(f.calls.length,0);
  const expense=f.find('Save this expense review');f.switchAccount();expense.click();await f.flush();assert.equal(f.calls.length,0);
  f.view.render();assert.equal(f.view.dirty,false);assert.match(f.errors.join(' '),/changed/);
});

test('lock and pagehide clear all private nodes and unfinished inputs without callbacks',()=>{
  const f=fixture();f.change(f.document.querySelector('#auto-tax-expense-review input'),'10','input');assert.equal(f.view.dirty,true);
  f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide'));assert.equal(f.view.element.textContent,'');assert.equal(f.view.element.hidden,true);assert.equal(f.view.dirty,false);assert.deepEqual(f.calls,[]);
  f.dom.window.dispatchEvent(new f.dom.window.Event('pageshow'));f.view.render();f.state.phase='locked';f.view.render();assert.equal(f.view.element.textContent,'');
  f.state.phase='ready';f.client.unlocked=false;f.view.render();assert.equal(f.view.element.hidden,true);
});

test('PDF and deep editor actions are explicit, disable while saving, and preserve known negative draft profit',async()=>{
  const f=fixture();f.state.model.incomeConfirmed=true;f.state.model.businessConfirmed=true;f.state.model.totals.receiptsCents=10000;f.state.model.totals.deductionsCents=12000;f.state.model.totals.profitCents=-2000;f.state.persisted=true;f.view.render();
  assert.match(f.view.element.textContent,/\$-20\.00/);assert.match(f.document.getElementById('auto-tax-save-status').textContent,/saved encrypted/);assert.deepEqual(f.calls,[]);
  f.find('Download draft PDF').click();await f.flush();f.find('Open full return editor').click();await f.flush();assert.deepEqual(f.calls,[['pdf'],['edit']]);
  f.state.phase='saving';f.view.render();assert.equal(f.find('Download draft PDF').disabled,true);assert.match(f.document.getElementById('auto-tax-save-status').textContent,/Saving/);
  f.state.phase='error';f.state.error='Synthetic encrypted save needs retry';f.view.render();assert.match(f.view.element.textContent,/Synthetic encrypted save needs retry/);
});

test('changed source shows income confirmation unchecked even when older saved settings were confirmed',async()=>{
  const f=fixture();f.state.settings.incomeConfirmed=true;f.state.settings.reviewedSourceDigest='source-older';f.state.model.incomeConfirmed=false;f.view.render();
  const confirm=f.document.getElementById('auto-tax-income-confirmed');assert.equal(confirm.checked,false);confirm.click();await f.flush();
  assert.deepEqual(f.calls,[['settings',{incomeConfirmed:true}]]);
});

test('error reload and earlier-copy review are explicit private scoped actions and pause for unfinished input',async()=>{
  const f=fixture({recoveryActions:true});f.state.phase='error';f.state.error='Synthetic conflicting private draft';f.state.archivedCount=2;f.view.render();
  assert.match(f.view.element.textContent,/2 earlier encrypted draft copies/);assert.deepEqual(f.calls,[]);
  f.find('Reload saved private draft').click();await f.flush();f.find('Review earlier saved draft').click();await f.flush();assert.deepEqual(f.calls,[['reload'],['prior']]);
  f.change(f.document.querySelector('#auto-tax-expense-review input'),'5.00','input');assert.equal(f.find('Reload saved private draft').disabled,true);assert.equal(f.find('Review earlier saved draft').disabled,true);
  f.find('Cancel this expense input').click();assert.equal(f.find('Reload saved private draft').disabled,false);
  const oldReload=f.find('Reload saved private draft'),oldPrior=f.find('Review earlier saved draft');f.switchAccount();oldReload.click();await f.flush();oldPrior.click();await f.flush();assert.equal(f.calls.length,2);
  f.client.unlocked=false;f.view.render();assert.equal(f.view.element.textContent,'');assert.equal(f.view.element.hidden,true);
});

test('reload remains available without a model but unavailable while loading or without callbacks',async()=>{
  const f=fixture({recoveryActions:true});f.state.phase='error';f.state.model=null;f.view.render();f.find('Reload saved private draft').click();await f.flush();assert.deepEqual(f.calls,[['reload']]);
  f.state.archivedCount=1;f.state.phase='saving';f.view.render();assert.equal(f.find('Review earlier saved draft').disabled,true);
  const absent=fixture();absent.state.phase='error';absent.state.archivedCount=1;absent.view.render();assert.equal(absent.find('Reload saved private draft').disabled,true);assert.equal(absent.find('Review earlier saved draft').disabled,true);
});

test('no-vehicle choice and expense review explain separate workpapers and reject positive vehicle costs',async()=>{
  const f=fixture();assert.equal(f.document.querySelector('#auto-tax-vehicle-method option[value="none"]').textContent,'Do not claim mileage or vehicle operating costs from these records');
  assert.match(f.view.element.textContent,/Actual vehicle costs and depreciation need separate workpapers/);
  f.change(f.document.querySelector('#auto-tax-expense-review select'),'vehicle');f.change(f.document.querySelector('#auto-tax-expense-review input'),'10.00','input');f.find('Save this expense review').click();await f.flush();assert.equal(f.calls.length,0);assert.match(f.errors.join(' '),/Use 0 to exclude/);
  f.change(f.document.querySelector('#auto-tax-expense-review input'),'0','input');f.find('Save this expense review').click();await f.flush();assert.deepEqual(f.calls,[['expense','expense-1',{fingerprint:'expense-fingerprint',category:'vehicle',deductibleCents:0}]]);
});

test('PDF stays disabled for unknown app totals and stale enabled controls cannot export revoked review',async()=>{
  const f=fixture();f.state.model.incomeConfirmed=true;f.state.model.businessConfirmed=true;f.state.model.totals.receiptsCents=10000;f.state.model.totals.deductionsCents=null;f.view.render();
  assert.equal(f.find('Download draft PDF').disabled,true);assert.equal(f.find('Open full return editor').disabled,false);
  f.state.model.totals.deductionsCents=2000;f.view.render();const prior=f.find('Download draft PDF');assert.equal(prior.disabled,false);
  f.state.model.incomeConfirmed=false;prior.click();await f.flush();assert.deepEqual(f.calls,[]);assert.match(f.errors.join(' '),/Review app receipts/);
});

test('native expense hints suggest exact floored business-share amounts without applying a deduction',async()=>{
  const f=fixture(),record=f.state.model.source.records.find(row=>row.kind==='expense');
  Object.assign(record.body,{category:'fees',classification:'business',businessUsePercent:33,amountCents:3333,businessPurpose:'Synthetic platform selling fees'});f.view.render();
  assert.equal(f.document.querySelector('#auto-tax-expense-review select').value,'commissions');assert.equal(f.document.querySelector('#auto-tax-expense-review input').value,'10.99');
  assert.match(f.view.element.textContent,/SUGGESTED tax category: Commissions and fees/);assert.match(f.view.element.textContent,/UNREVIEWED/);assert.match(f.view.element.textContent,/business use 33%/);assert.match(f.view.element.textContent,/Synthetic platform selling fees/);
  assert.equal(f.view.dirty,false);assert.deepEqual(f.calls,[]);assert.equal(f.state.model.totals.deductionsCents,null);
  f.find('Save this expense review').click();await f.flush();assert.deepEqual(f.calls,[['expense','expense-1',{fingerprint:'expense-fingerprint',category:'commissions',deductibleCents:1099}]]);
});

test('expense suggestions retain conservative blank amounts, personal exclusions and unsupported vehicle exclusions',()=>{
  const cases=[
    [{category:'supplies',classification:'business'},'supplies',''],
    [{category:'supplies',classification:'business',businessUsePercent:'50'},'supplies',''],
    [{category:'supplies',classification:'business',businessUsePercent:50.5},'supplies',''],
    [{category:'supplies',classification:'business',businessUsePercent:50,currency:'EUR'},'supplies',''],
    [{category:'supplies',classification:'unclassified',businessUsePercent:50},'supplies',''],
    [{category:'meals',classification:'business',businessUsePercent:100},'meals',''],
    [{category:'phone',classification:'personal'},'utilities','0.00'],
    [{category:'fuel',classification:'business',businessUsePercent:100},'vehicle','0.00'],
    [{category:'training',classification:'business',businessUsePercent:100},'','20.00'],
    [{category:'equipment',classification:'business',businessUsePercent:100},'','20.00']
  ];
  for(const [body,category,amount]of cases){const f=fixture(),record=f.state.model.source.records.find(row=>row.kind==='expense');Object.assign(record.body,body);f.view.render();assert.equal(f.document.querySelector('#auto-tax-expense-review select').value,category);assert.equal(f.document.querySelector('#auto-tax-expense-review input').value,amount);assert.deepEqual(f.calls,[]);assert.equal(f.view.dirty,false);assert.match(f.view.element.textContent,/Equipment, depreciation/);}
});
