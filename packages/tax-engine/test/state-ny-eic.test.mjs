import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {calculateNYEic,newNYEic,newNYEicChild,newNYEicOrder,validateNYEic} from '../state-ny-eic.mjs';
import {nyCityEicRate,nyOrdinaryEic,nyNoncustodialWorksheet,nyNoncustodialAnnual} from '../state-ny-eic-calculation.mjs';
import {nyEicIncomeSources} from '../state-ny-eic-sources.mjs';
import {eicTableLookup} from '../eic-tables.mjs';
import {newEicCombatSource} from '../eic-model.mjs';
import {business} from './fixtures.mjs';
import {nyEicFixture,nyNoncustodialFixture,computeNYEicFixture} from './state-ny-eic-fixtures.mjs';
const D=value=>value*100,codes=result=>result.diagnostics.map(row=>row.code),compute=f=>computeNYEicFixture(f).result;

test('annual IT-209 tables independently match every published NY cell and partial-interval footnote',async()=>{
 const bytes=await readFile(new URL('../data/state-ny-eic-reference.json',import.meta.url)),reference=JSON.parse(bytes),manifest=JSON.parse(await readFile(new URL('../data/state-ny-eic-sources.json',import.meta.url)));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.reference.sha256);assert.equal(bytes.length,manifest.reference.bytes);
 for(const year of [2023,2024,2025]){const table=reference.tables[year];assert.equal(table.rows.length,{2023:932,2024:982,2025:1009}[year]);let previous=1;
  for(const [lower,upper,...amounts] of table.rows){assert.equal(lower,previous);previous=upper;for(let column=0;column<3;column++)if(typeof amounts[column]==='number')for(const income of [lower,upper-1])assert.equal(eicTableLookup(D(income),{year,filingStatus:column===2?'marriedJoint':'single',qualifyingChildren:column===0?1:0}).creditCents,D(amounts[column]),`${year}/${lower}/${column}`);}
  for(const [column,lower,upper,amount] of table.terminals)for(const income of [lower,upper-1,upper])assert.equal(eicTableLookup(D(income),{year,filingStatus:column===2?'marriedJoint':'single',qualifyingChildren:column===0?1:0}).creditCents,D(income===upper?0:amount));
 }
});

test('all three annual ordinary credits use actual federal lines, household reduction and graduated NYC calculation',()=>{
 for(const [year,federal,state,city] of [[2023,583,130,146],[2024,632,145,158],[2025,649,150,162]]){const f=nyEicFixture({year}),value=computeNYEicFixture(f),r=value.result;assert.equal(value.federal.earnedIncomeCredit.amountCents,D(federal));assert.equal(r.known,true,JSON.stringify(r.diagnostics));assert.equal(r.stateCreditCents,D(state));assert.equal(r.cityCreditCents,D(city));assert.equal(r.noncustodialCreditCents,0);assert.equal(r.lines['9'],D(10000));assert.equal(r.worksheetB.lines['1'],D(81));assert.equal(r.lines['15'],D(45));assert.equal(r.forms[0].eic.known,true);assert.equal(r.forms[0].form,'nyit215');}
});

test('NYC intermediate rates round to four decimals and honor all exact rate boundaries',()=>{
 for(const year of [2023,2024,2025])for(const [agi,bps] of [[-1000,3000],[4999,3000],[5000,3000],[5001,3000],[5002,2999],[7499,2500],[7500,2500],[14999,2500],[15000,2500],[17499,2000],[17500,2000],[19999,2000],[20000,2000],[22499,1500],[22500,1500],[39999,1500],[40000,1500],[42499,1000],[42500,1000],[50000,1000]])assert.equal(nyCityEicRate(D(agi),{year}).rateBasisPoints,bps,`${year}/${agi}`);
});

test('Worksheet B reduces household subtraction only by available tax after both specified credits',()=>{
 const base={year:2025,federalEicCents:D(1000),stateTaxBeforeCreditsCents:D(80),householdCreditCents:D(100)};
 let r=nyOrdinaryEic(base);assert.equal(r.stateCreditCents,D(220));r=nyOrdinaryEic({...base,residentCreditCents:D(50),availableAccumulationCreditCents:D(20)});assert.equal(r.worksheetB.lines['5'],D(10));assert.equal(r.stateCreditCents,D(290));r=nyOrdinaryEic({...base,residentCreditCents:D(500)});assert.equal(r.stateCreditCents,D(300));
 const f=nyEicFixture(),{federal,context}=computeNYEicFixture(f);f.source.worksheetBCredits='other';r=calculateNYEic(f.input,f.state,federal,context);assert.equal(r.stateCreditCents,null);assert.equal(r.cityCreditCents,D(162));assert(codes(r).includes('NY_EIC_WORKSHEET_B_CREDITS'));
});

test('ordinary child statements retain the full valid federal qualifying group and reject unresolved child identity scope',()=>{
 const f=nyEicFixture({children:4,wages:33030,joint:true}),{federal,context,result}=computeNYEicFixture(f);assert.equal(federal.earnedIncomeCredit.eligibility.attachmentChildren.length,3);assert.equal(result.children.length,4);assert.equal(result.known,true);assert.equal(result.forms[0].eic.children.length,4);
 federal.earnedIncomeCredit.eligibility.creditChildren[0].taxId='';assert.equal(calculateNYEic(f.input,f.state,federal,context).forms.length,0);
});

test('unknown federal awards, source reviews, independent state tax and locality preserve only known component credits',()=>{
 for(const mutation of [f=>f.source.review.income=false,f=>f.state.wageRecords[0].payerId='',f=>f.source.returnType='amended',f=>f.source.filingStatus='different']){const f=nyEicFixture();mutation(f);assert.equal(compute(f).stateCreditCents,null);}
 const f=nyEicFixture(),{federal,context}=computeNYEicFixture(f);let r=calculateNYEic(f.input,f.state,federal,{...context,stateTaxBeforeCreditsCents:null});assert.equal(r.stateCreditCents,null);assert.equal(r.cityCreditCents,D(162));r=calculateNYEic(f.input,f.state,federal,{...context,localityKnown:false});assert.equal(r.cityCreditCents,null);assert.equal(r.stateCreditCents,D(150));federal.earnedIncomeCredit.amountCents=null;r=calculateNYEic(f.input,f.state,federal,context);assert.equal(r.stateCreditCents,null);assert.equal(r.cityCreditCents,null);
});

test('noncustodial award applies both annual table branches even when federal age test denies EIC',()=>{
 for(const [year,expected] of [[2023,1458],[2024,1580],[2025,1623]]){const f=nyNoncustodialFixture({year});f.input.individual.eligibility.taxpayer.dateOfBirth=`${year-20}-01-02`;f.state.taxpayerDob=f.input.individual.eligibility.taxpayer.dateOfBirth;const {federal,result:r}=computeNYEicFixture(f);assert.equal(federal.earnedIncomeCredit.amountCents,0);assert.equal(r.known,true,JSON.stringify(r.diagnostics));assert.equal(r.noncustodialCreditCents,D(expected));assert.equal(r.stateCreditCents,0);assert.equal(r.forms[0].form,'nyit209');assert.equal(r.forms[0].eic.flags['33'],false);assert.equal(r.noncustodial.lines['31'],D(expected));}
});

test('noncustodial state alternative selects the larger claim while retaining actual federal NYC credit',()=>{
 const f=nyNoncustodialFixture({locality:'nyc'}),r=compute(f);assert.equal(r.selectedKind,'noncustodial');assert.equal(r.ordinaryStateCreditCents,D(150));assert.equal(r.noncustodialCreditCents,D(1623));assert.equal(r.cityCreditCents,D(162));assert.equal(r.forms[0].lines['42'],D(150));assert.equal(r.forms[0].lines['43'],D(1623));assert.equal(r.forms[0].lines['45'],D(162));
 const g=nyNoncustodialFixture({children:2,wages:33030,joint:true});assert.equal(compute(g).selectedKind,'ordinary');assert.equal(compute(g).noncustodialCreditCents,0);
});

test('NY noncustodial comparisons retain the annual state thresholds rather than substituting federal thresholds',()=>{
 assert.deepEqual(Object.values(nyNoncustodialAnnual).map(r=>[r.childComparisonCents,...r.noneComparisonCents]),[[D(21600),D(9800),D(16400)],[D(22750),D(10350),D(17250)],[D(23350),D(10650),D(17750)]]);
 for(const year of [2023,2024,2025]){const rules=nyNoncustodialAnnual[year];let r=nyNoncustodialWorksheet({year,filingStatus:'single',earnedIncomeCents:D(8000),federalAgiCents:rules.childComparisonCents-100});assert.equal(r.flags['20'],true);assert.equal(r.lines['21'],undefined);r=nyNoncustodialWorksheet({year,filingStatus:'single',earnedIncomeCents:D(8000),federalAgiCents:rules.childComparisonCents});assert.equal(r.flags['20'],false);assert(Number.isSafeInteger(r.lines['21']));}
});

test('federal zero alone never establishes absent noncustodial credit; high actual AGI independently excludes it',()=>{
 let f=nyEicFixture({wages:20000});delete f.state.earnedIncomeCredit;let r=compute(f);assert.equal(r.noncustodialCreditCents,null);assert(codes(r).includes('NY_IT209_CHILD_COMPLETENESS'));f=nyEicFixture({wages:80000});delete f.state.earnedIncomeCredit;r=compute(f);assert.equal(r.known,true);assert.equal(r.noncustodialCreditCents,0);
});

test('retained unreviewed child facts and both contradictory residence directions remain unresolved',()=>{
 for(const mutation of [f=>f.source.noncustodial.children[0].mainHome='withClaimant',f=>{f.input.individual.dependents[0].residencyDays=365;},f=>{f.input.individual.dependents[0].relationship='parent';f.input.individual.dependents[0].review.relationship=false;f.source.noncustodial.children=[];f.source.noncustodial.orders=[];},f=>{f.input.individual.dependents[0].relationship='other';f.source.noncustodial.children=[];f.source.noncustodial.orders=[];}]){const f=nyNoncustodialFixture();mutation(f);assert.equal(compute(f).noncustodialCreditCents,null);}
 const f=nyEicFixture();f.source.noncustodial.orders=[{...newNYEicOrder(),id:'unlinked',childIds:['missing'],source:'Synthetic order',reviewed:true}];assert(codes(compute(f)).includes('NY_IT209_ORDER_CHILD_LINK'));
});

test('support eligibility uses full order-set obligations, exact half-year dates and reviewed current payments',()=>{
 for(const mutation of [f=>f.source.noncustodial.orders[0].currentSupportPaidCents--,f=>f.source.noncustodial.orders[0].effectiveFrom='2025-08-01',f=>f.source.noncustodial.orders[0].throughNYSCU='no']){const f=nyNoncustodialFixture();mutation(f);const r=compute(f);assert.equal(r.noncustodial.known,true);assert.equal(r.noncustodial.amountCents,0);}
 const f=nyNoncustodialFixture({year:2024});f.source.noncustodial.orders[0].effectiveFrom='2024-07-01';assert(compute(f).noncustodialCreditCents>0);f.source.noncustodial.orders[0].effectiveFrom='2024-07-02';assert.equal(compute(f).noncustodialCreditCents,null);f.source.noncustodial.orders[0].effectiveFrom='2024-08-01';assert.equal(compute(f).noncustodialCreditCents,0);
 const g=nyNoncustodialFixture();g.source.noncustodial.orders.push({...g.source.noncustodial.orders[0],id:'another-court',throughNYSCU:'no',currentSupportPaidCents:0});assert.equal(compute(g).noncustodialCreditCents,0);g.source.noncustodial.orders[1].reviewed=false;assert.equal(compute(g).noncustodialCreditCents,null);
});

test('claimant-specific biological/adoptive sources and distinct identities cannot be inferred from joint filing',()=>{
 const f=nyNoncustodialFixture({joint:true});f.source.noncustodial.claimant='spouse';f.source.noncustodial.children[0].claimantRelationship='unknown';assert.equal(compute(f).noncustodialCreditCents,null);f.source.noncustodial.children[0].claimantRelationship='biological';assert(compute(f).noncustodialCreditCents>0);const {federal,context}=computeNYEicFixture(f);f.input.individual.dependents[0].taxId=f.input.party.taxId;assert(codes(calculateNYEic(f.input,f.state,federal,context)).includes('NY_IT209_CHILD_IDENTITY_CONFLICT'));
});

test('marital contradiction, invalid filer source and exceptional income cannot silently establish an NC award',()=>{
 for(const mutation of [f=>f.input.individual.earnedIncomeCredit.award.marital.status='married',f=>f.input.individual.taxpayerIdentifiers.taxpayer.reviewed=false,f=>f.state.wageRecords[0].allocatedTipsCents=D(10)]){const f=nyNoncustodialFixture();mutation(f);assert.equal(compute(f).noncustodialCreditCents,null);}
 const f=nyNoncustodialFixture();f.input.individual.earnedIncomeCredit.award.scope.form2555='yes';assert.equal(compute(f).noncustodialCreditCents,0);
});

test('source-linked Schedule C and ordinary half-SE deductions reconcile both federal worksheets',()=>{
 const f=nyEicFixture({wages:0});f.input.individual.businesses=[business('taxpayer',10000)];f.source.primaryBusinessId='business-taxpayer';let {federal,result:r}=computeNYEicFixture(f);assert.equal(r.known,true,JSON.stringify(r.diagnostics));assert.equal(r.lines['8'],D(9293));assert.equal(r.businessIdentifier,f.input.party.taxId);federal.forms.find(row=>row.form==='f1040sse').halfTaxCents++;const income=nyEicIncomeSources(f.input,f.state,federal,f.source);assert.equal(income.known,false);assert(codes(income).includes('NY_EIC_SE_RECONCILIATION'));
});

test('explicit unknown federal investment lines remain unknown and stale wage links cannot be reused',()=>{
 const f=nyEicFixture(),{federal}=computeNYEicFixture(f);federal.forms.find(row=>row.form==='f1040').lines['2a']=null;assert.equal(nyEicIncomeSources(f.input,f.state,federal,f.source).known,false);const g=nyEicFixture();g.state.wageRecords[0].w2Id='stale';assert.equal(compute(g).stateCreditCents,null);
});

test('NY noncustodial combat elections are explicit, independent of federal election and preserve all candidates',()=>{
 const f=nyNoncustodialFixture(),a=f.input.individual.earnedIncomeCredit.award;a.combatSources=[{...newEicCombatSource(f.input.individual.w2s[0].id,'taxpayer'),amountCents:D(2000),source:'Synthetic original W-2 combat pay',reviewed:true}];f.input.individual.earnedIncomeCredit.nontaxableCombatPayCents=D(2000);f.input.individual.childCredits.nontaxableCombatPayCents=D(2000);f.state.wageRecords[0].box12=[{code:'Q',amountCents:D(2000)}];a.combatElections.taxpayer='exclude';let r=compute(f);assert.equal(r.noncustodialCreditCents,null);assert.equal(r.noncustodial.electionCandidates.length,2);f.source.noncustodial.combatElections.taxpayer='include';r=compute(f);assert.equal(r.known,true,JSON.stringify(r.diagnostics));assert.equal(r.noncustodial.selectedElection.combatPayCents,D(2000));assert.equal(r.lines['6'],D(10000));assert.equal(r.noncustodial.lines['13'],D(12000));
});

test('strict source validation preserves unknown defaults and rejects duplicate orders or unsupported fields',()=>{
 const source=newNYEic();assert.equal(validateNYEic(source),source);assert.equal(source.noncustodial.claimant,'unknown');assert.equal(newNYEicChild().claimantRelationship,'unknown');source.extra=true;assert.throws(()=>validateNYEic(source));delete source.extra;source.noncustodial.orders=[{...newNYEicOrder(),id:'x',childIds:['y']},{...newNYEicOrder(),id:'x',childIds:['y']}];assert.throws(()=>validateNYEic(source),/distinct/);
});

test('successor support-order periods stay unresolved until their continuity is established',()=>{
 const f=nyNoncustodialFixture();f.source.noncustodial.orders[0].effectiveThrough='2025-04-30';f.source.noncustodial.orders.push({...f.source.noncustodial.orders[0],id:'replacement',effectiveFrom:'2025-05-01',effectiveThrough:'2025-08-31'});assert(codes(compute(f)).includes('NY_IT209_ORDER_SUCCESSION'));assert.equal(compute(f).noncustodialCreditCents,null);
});

test('IT209 income worksheets preserve owner-linked business deductions and stop nonpositive earnings',()=>{
 const f=nyNoncustodialFixture({wages:0});f.input.individual.businesses=[business('taxpayer',10000)];f.source.primaryBusinessId='business-taxpayer';let r=compute(f);assert.equal(r.noncustodial.incomeWorksheet.b['1a'],D(10000));assert.equal(r.noncustodial.incomeWorksheet.b['1d'],D(707));assert.equal(r.noncustodial.incomeWorksheet.b['4'],D(9293));
 f.input.individual.businesses[0].receiptsCents=0;r=compute(f);assert.equal(r.noncustodial.amountCents,0);assert.equal(r.noncustodial.eligible,false);assert.equal(r.forms.length,0);
});


test('spouse parent source cannot contradict the reviewed retained family relationship',()=>{
 const f=nyNoncustodialFixture({joint:true});f.source.noncustodial.claimant='spouse';f.input.individual.dependents[0].relationship='unrelated';assert(codes(compute(f)).includes('NY_IT209_PARENT_RELATIONSHIP_CONFLICT'));assert.equal(compute(f).noncustodialCreditCents,null);f.input.individual.dependents[0].relationship='stepchild';const r=compute(f);assert(r.noncustodialCreditCents>0);assert.equal(r.noncustodial.children[0].relationship,'child');assert.equal(r.noncustodial.children[0].retainedRelationship,'stepchild');
});


test('an out-of-year order cannot conceal a positive asserted current-year obligation',()=>{
 const f=nyNoncustodialFixture();f.source.noncustodial.orders.push({...f.source.noncustodial.orders[0],id:'future-order',effectiveFrom:'2026-01-01',effectiveThrough:'2026-12-31',currentSupportPaidCents:0});assert(codes(compute(f)).includes('NY_IT209_ORDER_PERIOD_CONFLICT'));assert.equal(compute(f).noncustodialCreditCents,null);f.source.noncustodial.orders[1].currentSupportDueCents=0;assert(compute(f).noncustodialCreditCents>0);
});


test('half-year orders never infer calendar-month eligibility from 181–183 days',()=>{
 for(const year of [2023,2024,2025])for(const [from,to] of [[`${year}-01-01`,`${year}-06-30`],[`${year}-07-02`,`${year}-12-31`],[`${year}-07-03`,`${year}-12-31`]]){const f=nyNoncustodialFixture({year});Object.assign(f.source.noncustodial.orders[0],{effectiveFrom:from,effectiveThrough:to});const r=compute(f);assert.equal(r.noncustodialCreditCents,null);assert(codes(r).includes('NY_IT209_ORDER_HALF_YEAR_BOUNDARY'));}
});
