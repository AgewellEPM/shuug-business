import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {capitalIncome,capitalLossCarryforward,newCapitalIncome} from '../capital-income.mjs';
import {qualifiedCapitalTax,capitalTaxThresholds} from '../capital-tax.mjs';
import {investmentIncome,netInvestmentTax} from '../investment-income.mjs';
import {calculateReturn} from '../index.mjs';
import {ordinaryTax} from '../ordinary-tax.mjs';
import {capitalFixture,capitalTrade} from './capital-fixtures.mjs';
import {investmentFixture} from './investment-fixtures.mjs';
import {reviewed,wage,business} from './fixtures.mjs';
const reference=JSON.parse(await readFile(new URL('./capital-reference.json',import.meta.url),'utf8'));
const context={year:2025,filingStatus:'single'},calculate=(value,options={})=>capitalIncome(value,{...context,...options});

for(const year of [2023,2024,2025])test(`${year} published Form 8949 column-h arithmetic and six source categories reconcile`,()=>{
  for(const row of reference.published8949){const value=capitalFixture();value.trades=[capitalTrade(year,'A',0,{proceedsCents:row.proceeds*100,basisCents:row.basis*100,adjustments:row.code?[{code:row.code,amountCents:row.adjustment*100,explanation:row.example}]:[]})];const result=calculate(value,{year});assert.deepEqual(result.diagnostics,[]);assert.equal(result.shortTermCents,row.gain*100,row.example);assert.equal(result.forms[1].lines['1h'],row.gain*100);}
  const value=capitalFixture();value.trades=['A','B','C','D','E','F'].map((category,index)=>capitalTrade(year,category,(index+1)*100));value.distributions=[{id:'distribution',payer:'Synthetic capital fund',amountCents:70000,source:'Synthetic box 2a'}];value.shortLossCarryoverCents=5000;value.longLossCarryoverCents=10000;
  const result=calculate(value,{year});assert.equal(result.forms.length,7);assert.equal(result.shortTermCents,55000);assert.equal(result.longTermCents,210000);assert.equal(result.incomeCents,265000);assert.equal(result.preferentialGainCents,210000);assert.equal(result.forms[0].lines['13'],70000);assert.equal(result.forms[0].lines['6'],5000);assert.equal(result.forms[0].lines['14'],10000);
});

test('annual qualified-dividend worksheet vectors cover zero, 15%, 20%, ordinary base and all statuses',()=>{
  for(const row of reference.syntheticPreferential){const result=qualifiedCapitalTax({year:row.year,filingStatus:'single',taxableIncomeCents:row.taxable*100,qualifiedDividendsCents:row.preferential*100});assert.equal(result.taxCents,row.tax*100,JSON.stringify(row));assert.equal(Object.keys(result.worksheet).length,25);}
  for(const year of [2023,2024,2025])for(const [filingStatus,[zero,upper]]of Object.entries(capitalTaxThresholds[year])){
    const calc=(taxable,preferential)=>qualifiedCapitalTax({year,filingStatus,taxableIncomeCents:taxable,preferentialGainCents:preferential});
    assert.equal(calc(zero,zero).taxCents,0);const edge=calc(zero+10000,zero+10000);assert.equal(edge.taxCents,1500);assert.equal(edge.worksheet['17'],10000);
    const high=calc(upper+10000,upper+10000);assert.equal(high.worksheet['20'],10000);assert.equal(high.worksheet['21'],2000);
    assert.equal(calc(5000000,0).taxCents,ordinaryTax(5000000,filingStatus,year).taxCents);
  }
  const limited=qualifiedCapitalTax({...context,taxableIncomeCents:2000000,qualifiedDividendsCents:4000000,preferentialGainCents:1000000});assert.equal(limited.taxCents,0);assert.equal(limited.worksheet['5'],0);assert.equal(limited.worksheet['10'],2000000);
  assert.equal(qualifiedCapitalTax({...context,taxableIncomeCents:null}).taxCents,null);
});

for(const year of [2023,2024,2025])test(`${year} annual loss limits and carryforwards preserve character and unused deduction`,()=>{
  for(const row of reference.syntheticLosses){const value=capitalFixture();value.trades=[capitalTrade(year,'A',row.short),capitalTrade(year,'D',row.long)];const result=calculate(value,{year,filingStatus:row.status??'single'}),carry=capitalLossCarryforward(result,{taxableIncomeBeforeFloorCents:row.taxable*100});assert.equal(result.incomeCents,row.status==='marriedSeparate'?-150000:-300000);assert.equal(carry.shortTermLossCents,row.nextShort*100);assert.equal(carry.longTermLossCents,row.nextLong*100);}
  const row=reference.publishedCarryover,value=capitalFixture();value.trades=[capitalTrade(year,'D',-row.netLoss)];const result=calculate(value,{year,filingStatus:row.status}),carry=capitalLossCarryforward(result,{taxableIncomeBeforeFloorCents:row.taxable*100});assert.equal(result.lossDeductionCents,row.deduction*100);assert.equal(carry.shortTermLossCents+carry.longTermLossCents,row.nextTotal*100);
});

test('covered/noncovered basis, selling costs, wash loss and classification adjustments validate their specific rules',()=>{
  const value=capitalFixture();value.trades=[capitalTrade(2025,'A',-1000,{adjustments:[{code:'W',amountCents:100000,explanation:'Wash loss and replacement basis reconciled'},{code:'E',amountCents:-2500,explanation:'Selling commission omitted from proceeds'}]})];assert.equal(calculate(value).shortTermCents,-2500);
  value.trades[0].adjustments[0].amountCents=102501;assert.throws(()=>calculate(value),/cannot exceed/);
  value.trades[0].adjustments=[{code:'E',amountCents:1,explanation:'Unsupported options premium'}];assert.throws(()=>calculate(value),/selling expenses negative/);
  value.trades[0].adjustments=[{code:'T',amountCents:1,explanation:'Wrong category'}];assert.throws(()=>calculate(value),/zero amount/);
  value.trades[0].adjustments=[{code:'B',amountCents:10000,explanation:'Covered corrected basis'}];assert.equal(calculate(value).shortTermCents,-90000);
  value.trades[0].category='B';assert.throws(()=>calculate(value),/noncovered/);value.trades[0].adjustments[0].amountCents=0;assert.equal(calculate(value).shortTermCents,-100000);
  value.trades[0].category='C';assert.throws(()=>calculate(value),/no-1099/);
  value.trades[0].category='A';value.trades[0].adjustments=[{code:'O',amountCents:0,explanation:'Unsupported adjustment'}];assert.throws(()=>calculate(value),/Unsupported/);
});

test('date, scope, explanation and source-identity gates preserve provisional records without trusted gains',()=>{
  const value=capitalFixture();value.trades=[capitalTrade(2025,'D',100,{dateAcquired:'2024-06-15'})];let result=calculate(value);assert.equal(result.incomeUnknown,true);assert.equal(result.forms[0].lines['16'],null);
  value.trades[0].dateSold='2025-06-16';assert.equal(calculate(value).incomeUnknown,false);
  value.trades[0].dateAcquired='Various';assert.equal(calculate(value).incomeUnknown,false);
  value.trades[0].dateSold='2024-06-16';assert.equal(calculate(value).incomeUnknown,true);
  value.trades[0].dateSold='2025-02-30';assert.equal(calculate(value).incomeUnknown,true);
  value.trades[0]=capitalTrade();for(const key of Object.keys(value.review).filter(key=>key!=='niit')){value.review[key]=false;result=calculate(value);assert.equal(result.incomeUnknown,true,key);assert.equal(capitalLossCarryforward(result,{taxableIncomeBeforeFloorCents:100000}).shortTermLossCents,null);value.review[key]=true;}
  value.trades[0].adjustments=[{code:'T',amountCents:0,explanation:''}];assert.equal(calculate(value).incomeUnknown,true);value.trades[0].adjustments=[];
  value.trades.push({...value.trades[0]});assert.throws(()=>calculate(value),/unique/);value.trades.pop();value.trades[0].proceedsCents=0.1;assert.throws(()=>calculate(value),/integer-cent/);
});

test('printed transaction columns reconcile when original source cents round in opposite directions',()=>{
  const value=capitalFixture();value.trades=[capitalTrade(2025,'A',0,{proceedsCents:100049,basisCents:90050,adjustments:[{code:'E',amountCents:-149,explanation:'Synthetic commission'}]})];const original=structuredClone(value),result=calculate(value),row=result.forms[1].capital.trades[0];assert.deepEqual(row.columns,{d:100000,e:90100,g:-100,h:9800});assert.equal(result.incomeCents,9800);assert.deepEqual(value,original);
});

test('qualified amounts are a reviewed subset, legacy payers remain compatible and NIIT does not double-count',()=>{
  const value=investmentFixture(1000,5000),ctx={...context,taxableInterestCents:0,ordinaryDividendsCents:0};value.dividendPayers[0].qualifiedDividendsCents=300000;let result=investmentIncome(value,ctx);assert.equal(result.qualifiedDividendsCents,300000);assert.equal(result.ordinaryDividendsCents,500000);
  value.review.qualifiedDividends=false;assert.equal(investmentIncome(value,ctx).incomeUnknown,true);assert.equal(netInvestmentTax(value,{...context,adjustedGrossIncomeCents:22000000,taxableInterestCents:100000,ordinaryDividendsCents:500000}).taxCents,22800);
  value.dividendPayers[0].qualifiedDividendsCents=500001;assert.throws(()=>investmentIncome(value,ctx),/cannot exceed/);delete value.dividendPayers[0].qualifiedDividendsCents;delete value.review.qualifiedDividends;assert.equal(investmentIncome(value,ctx).incomeUnknown,false);
  const capitalOnly=netInvestmentTax(investmentFixture(0,0),{...context,adjustedGrossIncomeCents:22000000,taxableInterestCents:0,ordinaryDividendsCents:0,capitalIncomeCents:1000000});assert.equal(capitalOnly.form.lines['5a'],1000000);assert.equal(capitalOnly.taxCents,38000);
  const loss=netInvestmentTax(investmentFixture(1000,0),{...context,adjustedGrossIncomeCents:22000000,taxableInterestCents:100000,ordinaryDividendsCents:0,capitalIncomeCents:-300000});assert.equal(loss.form.lines['5d'],-300000);assert.equal(loss.form.lines['8'],-200000);assert.equal(loss.form.lines['12'],0);assert.equal(loss.taxCents,0);
  const unknown=netInvestmentTax(investmentFixture(0,0),{...context,adjustedGrossIncomeCents:22000000,taxableInterestCents:0,ordinaryDividendsCents:0,capitalIncomeCents:1000000,incomeUnknown:true,capitalUnknown:true});for(const line of ['5a','13','15','17'])assert.equal(unknown.form.lines[line],null,line);
});

test('full return combines gains with qualified dividends, QBI limitations and reviewed NIIT',()=>{
  const input=reviewed();input.individual.businesses=[business('taxpayer',30000)];input.individual.investmentIncome=investmentFixture(0,10000);input.individual.investmentIncome.dividendPayers[0].qualifiedDividendsCents=1000000;input.individual.capitalIncome=capitalFixture();input.individual.capitalIncome.trades=[capitalTrade(2025,'D',10000)];
  const result=calculateReturn(input),qbi=result.forms.find(item=>item.form==='f8995').lines;assert.equal(result.calculationAvailable,true);assert.equal(result.forms[0].lines['3a'],1000000);assert.equal(result.forms[0].lines['7a'],1000000);assert.equal(qbi['12'],2000000);assert.equal(qbi['13'],qbi['11']-2000000);assert.equal(qbi['15'],qbi['14']);assert.equal(result.taxMethod.worksheet['2'],1000000);assert.equal(result.taxMethod.worksheet['3'],1000000);assert.equal(result.filingReady,false);
  input.individual.w2s=[{...wage('taxpayer',220000),medicareTaxWithheldCents:319000}];input.individual.businesses=[];const high=calculateReturn(input);assert.equal(high.summary.netInvestmentIncomeTaxCents,76000);assert.equal(high.forms.find(item=>item.form==='f8960').lines['2'],1000000);
  input.individual.capitalIncome.review.niit=false;assert.equal(calculateReturn(input).summary.totalTaxCents,null);
});

test('unresolved capital gates AGI, QBI, tax, loss carryforwards and balances; 2026 never borrows a prior pack',()=>{
  const input=reviewed();input.individual.businesses=[business('taxpayer',30000)];input.individual.capitalIncome=capitalFixture();input.individual.capitalIncome.trades=[capitalTrade(2025,'A',-10000)];input.individual.capitalIncome.review.basis=false;const result=calculateReturn(input);for(const key of ['adjustedGrossIncomeCents','taxableIncomeCents','ordinaryTaxCents','totalTaxCents','refundCents','amountOwedCents','shortTermCapitalLossCarryforwardCents'])assert.equal(result.summary[key],null,key);assert(!result.forms.some(item=>item.form==='f8995'));assert.equal(result.forms[0].lines['9'],null);
  assert.equal(capitalIncome(undefined,{...context,year:2026}).incomeUnknown,false);assert.equal(capitalIncome(newCapitalIncome(),{...context,year:2026}).incomeUnknown,true);assert.equal(qualifiedCapitalTax({...context,year:2026,taxableIncomeCents:10000000,qualifiedDividendsCents:100000}).taxCents,null);
  assert.throws(()=>capitalIncome({}, {...context,year:2026}),/integer-cent|object/);
  input.year=2026;const annual=calculateReturn(input);assert(annual.diagnostics.some(item=>item.code==='CAPITAL_YEAR_UNSUPPORTED'));assert.equal(annual.summary.totalTaxCents,null);assert(!annual.forms.some(item=>item.form==='f1040sd'||item.form==='f8949'));
});
