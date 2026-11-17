import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateReturn,newReturn} from '../../tax-engine/index.mjs';
import {extractAutoTaxRecords} from '../browser/auto-tax-records.mjs';
import {newAutoTaxSettings,prepareAutoTaxDraft} from '../browser/auto-tax-model.mjs';
import {bytes,scope,income,expense,trip,journal,feed} from './auto-tax-fixtures.mjs';
const managed=input=>input.individual.businesses.find(row=>row.id==='auto-gig-business-'+input.year);
async function reviewed(records,{year=2025,method='none'}={}){
  const source=await extractAutoTaxRecords(records,{scope}),settings=newAutoTaxSettings(year);
  Object.assign(settings,{incomeConfirmed:true,reviewedSourceDigest:source.digest,businessConfirmed:true,vehicleMethod:method,mileageEligible:method==='standard'});
  return {source,settings,prepare:()=>prepareAutoTaxDraft(records,{scope,year,settings})};
}
const decide=(fixture,id,category,deductibleCents)=>{const row=fixture.source.records.find(row=>row.id===id);fixture.settings.expenseDecisions[id]={fingerprint:row.fingerprint,category,deductibleCents};};

test('new automatic draft populates provisional recorded income and leaves deductions/AGI/tax unknown until source review',async()=>{
  const records=feed([income(),expense(),expense('synthetic-meal',9000,'meals'),trip('synthetic-trip',{earningsCents:500000,platformFeesCents:40000})]),before=[...records.values()].map(row=>row.plaintext.slice());
  const settings=newAutoTaxSettings(2025),original=structuredClone(settings),result=await prepareAutoTaxDraft(records,{scope,year:2025,settings});
  assert.equal(managed(result.input).receiptsCents,1000000,'trip fares and fees never silently augment entered income');assert.deepEqual(managed(result.input).expenses,[]);assert.equal(managed(result.input).businessCode,'');assert.equal(result.input.individual.filingStatus,'single');assert.equal(result.input.review.identity,false);
  assert.equal(result.totals.recordedIncomeCents,1000000);assert.equal(result.totals.recordedExpenseCents,29000);assert.equal(result.totals.receiptsCents,null);assert.equal(result.totals.deductionsCents,null);assert.equal(result.totals.profitCents,null);assert.equal(result.incomeConfirmed,false);assert.equal(result.businessConfirmed,false);
  const tax=calculateReturn(result.input);assert.equal(tax.filingReady,false);assert.equal(tax.summary.adjustedGrossIncomeCents,null);assert.equal(tax.summary.totalTaxCents,null);
  assert(result.returnIssues.some(row=>row.code==='IDENTITY_INCOMPLETE'));assert(result.issues.some(row=>row.code==='REVIEW_INCOME'));assert(result.issues.some(row=>row.code==='COVERAGE_REVIEW_REQUIRED'));
  assert.deepEqual(settings,original);assert.deepEqual([...records.values()].map(row=>row.plaintext),before);
});

test('reviewed source amounts populate only the reserved Schedule C and preserve manual identities/W2/states/businesses/reviews',async()=>{
  const records=feed([income(),expense()]),f=await reviewed(records);decide(f,'synthetic-expense','supplies',12000);
  const base=f.settings.baseInput;Object.assign(base.party,{name:'SYNTHETIC PRIVATE CLIENT',firstName:'Synthetic',lastName:'Client',taxId:'000000001'});base.notes='SYNTHETIC manual source notes';base.review.identity=true;base.features=['capital-income','auto-tax:expense-review'];
  base.individual.filingStatus='headOfHousehold';base.individual.w2s=[{id:'synthetic-w2',owner:'taxpayer',employer:'SYNTHETIC original W2',wagesCents:5000000,socialSecurityWagesCents:5000000,medicareWagesCents:5000000,federalWithholdingCents:50000,medicareTaxWithheldCents:72500}];base.individual.stateReturns=[{state:'CA',source:'SYNTHETIC unsupported state source preserved'}];
  const manual={id:'synthetic-other-business',owner:'taxpayer',name:'SYNTHETIC separate activity',ein:'',businessCode:'123456',receiptsCents:50000,returnsCents:0,costOfGoodsCents:0,otherIncomeCents:0,expenses:[],materialParticipation:true,fullyAtRisk:true};base.individual.businesses=[manual,{...manual,id:'auto-gig-business-2025',name:'SYNTHETIC client chosen name',businessCode:'654321',expenses:[],receiptsCents:999}];
  const original=structuredClone(base),result=await f.prepare(),business=managed(result.input);
  assert.equal(result.incomeConfirmed,true);assert.equal(result.businessConfirmed,true);assert.equal(result.totals.receiptsCents,1000000);assert.equal(result.totals.deductionsCents,12000);assert.equal(result.totals.profitCents,988000);
  assert.equal(business.name,'SYNTHETIC client chosen name');assert.equal(business.businessCode,'654321');assert.equal(business.materialParticipation,true);assert.equal(business.receiptsCents,1000000);assert.equal(business.expenses[0].amountCents,12000);
  for(const key of ['party','review','notes'])assert.deepEqual(result.input[key],original[key]);for(const key of ['w2s','stateReturns','filingStatus'])assert.deepEqual(result.input.individual[key],original.individual[key]);assert.deepEqual(result.input.individual.businesses.find(row=>row.id===manual.id),manual);assert.deepEqual(result.input.features,['capital-income']);assert.deepEqual(base,original);
});

test('expense review uses exact cents, caps recorded business-use share, refuses personal contradictions and never invents meal fractions',async()=>{
  const f=await reviewed(feed([income(),expense('synthetic-shared',101,'phone',{businessUsePercent:50}),expense('synthetic-personal',9000,'supplies',{classification:'personal'}),expense('synthetic-meal',9000,'meals')]));
  decide(f,'synthetic-shared','utilities',51);decide(f,'synthetic-personal','supplies',100);decide(f,'synthetic-meal','meals',777);
  const bad=await f.prepare();assert.equal(bad.totals.deductionsCents,null);assert(bad.issues.some(row=>row.code==='APP_EXPENSE_AMOUNT_CONFLICT'));assert.deepEqual(managed(bad.input).expenses.map(row=>[row.category,row.amountCents]),[['meals',777]]);
  decide(f,'synthetic-shared','utilities',50);decide(f,'synthetic-personal','supplies',0);
  const result=await f.prepare();assert.equal(result.totals.deductionsCents,827);assert.equal(managed(result.input).expenses.find(row=>row.category==='meals').amountCents,777,'the client’s reviewed amount is used without an invented 50% rule');
});

test('actual vehicle operating amounts are unavailable for every method; explicit zero exclusions allow reviewed standard mileage plus tolls',async()=>{
  for(const method of ['none','unreviewed','standard'])for(const category of ['fuel','ev_charging','repairs','maintenance','tires','cleaning','insurance','registration','rental','lease','interest']){
    const f=await reviewed(feed([income(),expense('synthetic-operating',10000,category)]),{method});decide(f,'synthetic-operating','other',100);
    const result=await f.prepare();assert.equal(result.totals.deductionsCents,null,method+'/'+category);assert(result.issues.some(row=>['APP_ACTUAL_VEHICLE_UNSUPPORTED','APP_VEHICLE_DOUBLE_COUNT'].includes(row.code)));assert.equal(managed(result.input).expenses.length,0);
  }
  const f=await reviewed(feed([income(),expense('synthetic-fuel',10000,'fuel'),expense('synthetic-toll',1000,'tolls'),trip()]),{method:'standard'});decide(f,'synthetic-fuel','other',0);decide(f,'synthetic-toll','other',1000);
  const result=await f.prepare();assert.equal(result.totals.deductionsCents,1070);assert.equal(managed(result.input).expenses.find(row=>row.category==='vehicle').amountCents,70);assert.equal(result.mileage.amountCents,70);
  f.settings.reviewedSourceDigest=null;const stale=await f.prepare();assert.equal(stale.totals.deductionsCents,null);assert.equal(stale.incomeConfirmed,false);assert.equal(stale.mileage.amountCents,null);
});

test('duplicate income requires fingerprint decisions and the same bank transaction cannot be counted twice',async()=>{
  const a=income('synthetic-a'),b=income('synthetic-b'),f=await reviewed(feed([a,b]));
  let result=await f.prepare();assert.equal(result.incomeConfirmed,false);assert.equal(result.totals.receiptsCents,null);assert.equal(managed(result.input).receiptsCents,2000000);
  for(const row of f.source.records)f.settings.incomeDecisions[row.id]={fingerprint:row.fingerprint,include:row.id==='synthetic-a'};
  result=await f.prepare();assert.equal(result.incomeConfirmed,true);assert.equal(result.totals.receiptsCents,1000000);
  const reference={provider:'plaid',transactionId:'SYNTHETIC-original-bank-row',accountLabel:'SYNTHETIC account'},sameBank=await reviewed(feed([income('synthetic-a',10000,'2025-01-01',{bankReference:reference}),income('synthetic-b',20000,'2025-01-02',{bankReference:reference})]));
  for(const row of sameBank.source.records)sameBank.settings.incomeDecisions[row.id]={fingerprint:row.fingerprint,include:true};
  assert.equal((await sameBank.prepare()).incomeConfirmed,false);sameBank.settings.incomeDecisions['synthetic-b'].include=false;assert.equal((await sameBank.prepare()).totals.receiptsCents,10000);
});

test('changed/deleted/conflicted sources invalidate global gross review and stale row decisions cannot restore old amounts',async()=>{
  const records=feed([income(),expense()]),f=await reviewed(records);decide(f,'synthetic-expense','supplies',12000);assert.equal((await f.prepare()).totals.profitCents,988000);
  const updated=expense();updated.body.amountCents=30000;records.set('synthetic-journal',journal([income(),updated],{revision:2}));
  let result=await f.prepare();assert.equal(result.incomeConfirmed,false);assert.equal(result.totals.deductionsCents,null);assert.equal(result.totals.profitCents,null);assert.equal(managed(result.input).expenses.length,0);assert(result.issues.some(row=>row.code==='APP_EXPENSE_REVIEW_STALE'));
  const deleted=income();deleted.deleted=true;records.set('synthetic-journal',journal([deleted],{revision:3}));result=await f.prepare();assert.equal(managed(result.input).receiptsCents,0);assert.equal(result.totals.receiptsCents,null);assert.equal(calculateReturn(result.input).summary.adjustedGrossIncomeCents,null);
  const original=income(),different=income();different.body.amountCents+=1;records.set('synthetic-journal',journal([original]));records.set('synthetic-copy',journal([different],{objectId:'synthetic-copy'}));result=await f.prepare();assert.equal(result.totals.profitCents,null);assert(result.source.issues.some(row=>row.code==='APP_RECORD_CONFLICT'));
});

test('year, entity, reserved-business and exact-review boundaries fail closed without replacing manual source',async()=>{
  const f=await reviewed(feed([income('synthetic-current'),income('synthetic-prior',5000,'2024-12-31')],{extra:{coachIntake:{taxYear:2025,businessType:'partnership'}}}));
  let result=await f.prepare();assert.equal(result.businessConfirmed,false);assert.equal(result.totals.receiptsCents,1000000);assert.equal(result.totals.profitCents,null);assert.deepEqual(result.source.years,[2024,2025]);assert(result.issues.some(row=>row.code==='APP_ENTITY_UNSUPPORTED'));
  assert.throws(()=>newAutoTaxSettings(2022),/annual/);const wrong=newAutoTaxSettings(2025);wrong.baseInput=newReturn('1120',2025);await assert.rejects(()=>prepareAutoTaxDraft([], {scope,year:2025,settings:wrong}),/1040/);
  await assert.rejects(()=>prepareAutoTaxDraft([], {scope,year:2024,settings:newAutoTaxSettings(2025)}),/exact tax year/);
  const invalid=newAutoTaxSettings(2025);invalid.expenseDecisions.bad={fingerprint:'a'.repeat(64),category:'invented-deduction',deductibleCents:1};await assert.rejects(()=>prepareAutoTaxDraft([], {scope,year:2025,settings:invalid}),/Schedule C/);
  const noIncome=await reviewed(feed([trip('synthetic-fares',{earningsCents:50000})]));result=await noIncome.prepare();assert.equal(result.incomeConfirmed,false);assert.equal(result.totals.receiptsCents,null);assert(result.issues.some(row=>row.code==='APP_GROSS_SOURCE_REQUIRED'));
});

function addProfile(records,name,{objectId='synthetic-client-profile',...extra}={}){
  records.set(objectId,{objectId,revision:1,domain:'tax-identity',scope:{...scope},context:{workspaceId:scope.workspaceId,accountId:scope.accountId},envelopeDigest:'SYNTHETIC authenticated private profile',plaintext:bytes({version:1,type:'client-profile',legalName:name,email:'SYNTHETIC-CONTACT@example.test',phone:'SYNTHETIC PHONE',mailingAddress:'SYNTHETIC UNPARSED ADDRESS',...extra})});
}

test('a decrypted client legal name fills only a blank return name without completing identity review or guessing name parts',async()=>{
  const records=feed([income()]);addProfile(records,'SYNTHETIC  María del Río');
  const settings=newAutoTaxSettings(2025),original=structuredClone(settings),result=await prepareAutoTaxDraft(records,{scope,year:2025,settings});
  assert.equal(result.source.profileName,'SYNTHETIC  María del Río');assert.deepEqual(result.input.party,{...original.baseInput.party,name:'SYNTHETIC  María del Río'});assert.equal(result.input.review.identity,false);assert.deepEqual(settings,original);
  for(const code of ['IDENTITY_INCOMPLETE','NAME_PARTS_REQUIRED','REVIEW_IDENTITY'])assert(result.returnIssues.some(row=>row.code===code));
  const serialized=JSON.stringify(result.input);for(const value of ['SYNTHETIC-CONTACT','SYNTHETIC PHONE','SYNTHETIC UNPARSED ADDRESS'])assert(!serialized.includes(value));assert.equal(calculateReturn(result.input).filingReady,false);
});

test('an entered manual name is preserved while a different profile name explicitly reopens identity review',async()=>{
  const records=feed([income()]);addProfile(records,'SYNTHETIC PROFILE NAME');const f=await reviewed(records);
  Object.assign(f.settings.baseInput.party,{name:'SYNTHETIC MANUALLY REVIEWED NAME',firstName:'Synthetic',lastName:'Manual',taxId:'000000001',street:'SYNTHETIC ENTERED STREET'});f.settings.baseInput.review.identity=true;
  const original=structuredClone(f.settings.baseInput),result=await f.prepare();
  assert.deepEqual(result.input.party,original.party);assert.equal(result.input.review.identity,false);assert(result.issues.some(row=>row.code==='APP_PROFILE_IDENTITY_REVIEW'));assert(result.input.features.includes('auto-tax:identity-review'));assert(result.returnIssues.some(row=>row.code==='REVIEW_IDENTITY'));assert.deepEqual(f.settings.baseInput,original);
  f.settings.baseInput.party.name='SYNTHETIC PROFILE NAME';const matching=await f.prepare();assert.equal(matching.input.review.identity,true);assert(!matching.issues.some(row=>row.code==='APP_PROFILE_IDENTITY_REVIEW'));
});

test('conflicting profiles block complete amounts and an owner or unsupported identity source cannot fill the name',async()=>{
  const records=feed([income()]);addProfile(records,'SYNTHETIC CLIENT');addProfile(records,'SYNTHETIC OTHER CLIENT',{objectId:'synthetic-profile-conflict'});const f=await reviewed(records);
  f.settings.baseInput.review.identity=true;let result=await f.prepare();assert.equal(result.source.profileName,null);assert.equal(result.input.party.name,'');assert.equal(result.input.review.identity,false);assert.equal(result.totals.profitCents,null);assert.equal(result.totals.receiptsCents,null);assert(result.issues.some(row=>row.code==='APP_PROFILE_NAME_CONFLICT'));
  const ignored=feed([income()]);addProfile(ignored,'SYNTHETIC OWNER',{type:'owner-profile'});addProfile(ignored,'SYNTHETIC OTHER IDENTITY',{objectId:'synthetic-other-identity',type:'tax-identity',taxId:'000000001'});
  result=await prepareAutoTaxDraft(ignored,{scope,year:2025});assert.equal(result.source.profileName,null);assert.equal(result.input.party.name,'');assert.equal(result.input.party.taxId,'');
  await assert.rejects(()=>prepareAutoTaxDraft(ignored,{scope:{...scope,profile:'firm-recovery-v1'},year:2025}),/client-only/);
  const foreign=feed([income()]);addProfile(foreign,'SYNTHETIC FOREIGN PROFILE');foreign.get('synthetic-client-profile').scope.accountId='workspace-owner';await assert.rejects(()=>prepareAutoTaxDraft(foreign,{scope,year:2025}),/another private account/);
});
