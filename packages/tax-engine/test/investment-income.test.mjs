import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {investmentIncome,netInvestmentTax,newInvestmentIncome} from '../investment-income.mjs';
import {investmentFixture} from './investment-fixtures.mjs';
const reference=JSON.parse(await readFile(new URL('./investment-reference.json',import.meta.url),'utf8'));
const context={year:2025,filingStatus:'single',taxableInterestCents:0,ordinaryDividendsCents:0};
const calculate=value=>investmentIncome(value,context);
const niit=(value,overrides={})=>netInvestmentTax(value,{...context,adjustedGrossIncomeCents:22000000,taxableInterestCents:123400,ordinaryDividendsCents:345600,...overrides});

for(const year of [2023,2024,2025])test(`${year} NIIT statutory threshold, lesser base and 3.8% reference vectors`,()=>{
  for(const row of reference.cases){const result=netInvestmentTax(investmentFixture(row.interestDollars,row.dividendsDollars),{year,filingStatus:row.status,adjustedGrossIncomeCents:row.agiDollars*100,taxableInterestCents:row.interestDollars*100,ordinaryDividendsCents:row.dividendsDollars*100});assert.deepEqual(result.diagnostics,[]);assert.equal(result.taxCents,row.taxDollars*100);if(result.form)assert.equal(result.form.lines['14'],row.thresholdDollars*100);}
});
test('Schedule B records are authoritative; legacy aggregates retain their missing-schedule and NIIT gates',()=>{
  const value=investmentFixture(),result=calculate(value);assert.equal(result.taxableInterestCents,123400);assert.equal(result.ordinaryDividendsCents,345600);assert.equal(result.incomeUnknown,false);assert.deepEqual(result.diagnostics,[]);assert.equal(result.forms[0].lines['6'],345600);
  for(const dollars of [1500,1501]){const legacy=investmentIncome(undefined,{...context,taxableInterestCents:dollars*100});assert.equal(legacy.required,dollars>1500);assert.equal(legacy.forms.length,0);}
  assert.equal(investmentIncome(undefined,{...context,taxableInterestCents:150001}).required,true);
  assert.equal(niit(undefined).taxCents,null);assert.equal(niit(undefined,{adjustedGrossIncomeCents:19500000}).taxCents,0);
  assert.equal(investmentIncome(value,{...context,taxableInterestCents:10000}).incomeUnknown,true);
  assert.equal(investmentIncome(value,{...context,taxableInterestCents:123400,ordinaryDividendsCents:345600}).incomeUnknown,false);
  assert.equal(investmentIncome(value,{...context,taxableInterestCents:123401,ordinaryDividendsCents:345600}).incomeUnknown,true);
});
test('each unknown NIIT scope keeps total unavailable, including uncertain MAGI below threshold',()=>{
  for(const key of Object.keys(newInvestmentIncome().review).filter(key=>key!=='qualifiedDividends')){
    const value=investmentFixture();value.review[key]=false;const result=niit(value);assert.equal(result.taxCents,null,key);assert.equal(result.form.lines['17'],null,key);
  }
  const value=investmentFixture();value.review.noMagiAdjustments=false;const result=niit(value,{adjustedGrossIncomeCents:19000000});assert.equal(result.taxCents,null);assert.equal(result.form.lines['13'],null);assert.equal(result.form.lines['15'],null);
  assert.equal(niit(investmentFixture(),{otherTreatments:true}).taxCents,null);assert.equal(niit(investmentFixture(),{incomeUnknown:true}).taxCents,null);
});
test('foreign-account, FBAR and foreign-trust decisions are explicit and separate filings stay blocked',()=>{
  const value=investmentFixture(2000,0);value.foreignAccount='unknown';value.foreignTrust='unknown';let result=calculate(value);assert(result.diagnostics.some(item=>item.code==='SCHEDULE_B_ACCOUNT_REVIEW'));assert(result.diagnostics.some(item=>item.code==='SCHEDULE_B_TRUST_REVIEW'));
  value.foreignAccount='yes';value.foreignTrust='no';result=calculate(value);assert(result.diagnostics.some(item=>item.code==='SCHEDULE_B_FBAR_REVIEW'));
  value.fbarRequired='yes';result=calculate(value);assert(result.diagnostics.some(item=>item.code==='SCHEDULE_B_COUNTRIES_REQUIRED'));value.foreignCountries='Canada';result=calculate(value);assert.equal(result.incomeUnknown,false);assert(result.diagnostics.some(item=>item.code==='FBAR_SEPARATE_FILING_REQUIRED'));assert(result.diagnostics.some(item=>item.code==='FOREIGN_ASSET_REPORTING_REVIEW'));
  value.foreignTrust='yes';assert.equal(calculate(value).incomeUnknown,true);assert.equal(niit(value).taxCents,null);
  value.foreignAccount='no';assert.throws(()=>calculate(value),/conflicts/);
});
test('supported Schedule B disclosure-only and zero-NII high-MAGI cases retain their forms',()=>{
  const value=investmentFixture(0,0);value.foreignAccount='yes';value.fbarRequired='no';assert.equal(calculate(value).forms[0].investment.partIII,true);
  const result=niit(value,{taxableInterestCents:0,ordinaryDividendsCents:0});assert.equal(result.taxCents,0);assert.equal(result.form.lines['17'],0);
  assert.equal(niit(value,{taxableInterestCents:0,ordinaryDividendsCents:0,adjustedGrossIncomeCents:19000000}).required,false);
});
test('payer identity, bounds and exact money are validated without mutating original sources',()=>{
  const value=investmentFixture(0,0);value.interestPayers=[{id:'a',payer:'Synthetic Bank A',amountCents:10049,source:'A'},{id:'b',payer:'Synthetic Bank B',amountCents:10049,source:'B'}];const original=structuredClone(value);assert.equal(calculate(value).taxableInterestCents,20100);assert.deepEqual(value,original);
  value.interestPayers[1].id='a';assert.throws(()=>calculate(value),/unique/);value.interestPayers[1].id='b';value.interestPayers[0].amountCents=-1;assert.throws(()=>calculate(value),/nonnegative/);value.interestPayers[0].amountCents=10049;value.review.noAdjustments='yes';assert.throws(()=>calculate(value),/explicit/);
});
