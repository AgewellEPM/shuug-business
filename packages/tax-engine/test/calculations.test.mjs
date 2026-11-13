import test from 'node:test';
import assert from 'node:assert/strict';
import { newReturn,calculateReturn,parseMoney,displayMoney } from '../index.mjs';
import { ordinaryTax2025 } from '../ordinary-tax.mjs';
import { taxTable2025 } from '../data/2025-tax-table.mjs';
import { wholeRatio } from '../money.mjs';
import { allocateIncome } from '../business.mjs';
import { reviewed,business,wage } from './fixtures.mjs';

test('official IRS table has contiguous complete coverage and its published joint example',()=>{
  assert.equal(taxTable2025.length,2062);assert.equal(taxTable2025[0][0],0);assert.equal(taxTable2025.at(-1)[1],100000);
  for(let i=0;i<taxTable2025.length;i++){const row=taxTable2025[i];if(i)assert.equal(row[0],taxTable2025[i-1][1]);assert(row[0]<row[1]);for(const [status,column]of [['single',2],['marriedJoint',3],['marriedSeparate',4],['headOfHousehold',5]]){assert.equal(ordinaryTax2025(row[0]*100,status).taxCents,row[column]*100);assert.equal(ordinaryTax2025((row[1]-1)*100,status).taxCents,row[column]*100);}}
  // 2025 instructions, Tax Table example: $25,300 taxable, married jointly.
  assert.equal(ordinaryTax2025(2530000,'marriedJoint').taxCents,256200);
});
test('worksheet starts at exactly $100,000 and preserves quarter-dollar offsets',()=>{
  assert.equal(ordinaryTax2025(9999900,'single').method,'official-2025-tax-table');
  assert.equal(ordinaryTax2025(10000000,'single').taxCents,1691400);
  assert.equal(ordinaryTax2025(10000000,'marriedJoint').taxCents,1182800);
  assert.equal(ordinaryTax2025(30000000,'single').taxCents,7454700);
  assert.equal(ordinaryTax2025(80000000,'marriedJoint').taxCents,22006300);
  assert.equal(ordinaryTax2025(2530000,'survivingSpouse').taxCents,256200);
});
test('exact cent parsing and one-step dollar rounding reject silent coercion',()=>{
  assert.equal(parseMoney('9007199254740.99'),900719925474099);assert.equal(displayMoney(900719925474099),'9007199254740.99');
  for(const value of ['1e6','1,000.00','0.001','-1','01','Infinity'])assert.throws(()=>parseMoney(value));
  assert.equal(wholeRatio(9999,5000),5000);assert.equal(wholeRatio(10001,4999),5000);
  // 99.99 * .005 = .49995, which must not first become .50 then $1.
  assert.equal(wholeRatio(9999,50),0);
});
test('individual ordinary wages use the IRS table, not a bracket approximation',()=>{
  const input=reviewed();input.individual.w2s=[wage('taxpayer',50000,5000)];const result=calculateReturn(input);
  assert.equal(result.summary.taxableIncomeCents,3425000);assert.equal(result.summary.ordinaryTaxCents,387500);assert.equal(result.summary.refundCents,112500);assert.equal(result.status,'draft');assert.equal(result.filingReady,false);
});
test('Schedule C, SE, half-tax adjustment and QBI reconcile to 1040',()=>{
  const input=reviewed();input.individual.businesses=[business()];const result=calculateReturn(input);
  assert.equal(result.summary.selfEmploymentTaxCents,1130400);assert.equal(result.summary.adjustedGrossIncomeCents,7434800);assert.equal(result.summary.taxableIncomeCents,4687800);assert.equal(result.summary.ordinaryTaxCents,538700);assert.equal(result.summary.totalTaxCents,1669100);
  const qbi=result.forms.find(item=>item.form==='f8995');assert.equal(qbi.businesses[0].qbiCents,qbi.lines['2']);assert.equal(qbi.lines['15'],1172000);
});
test('each spouse retains a separate Social Security wage cap',()=>{
  const input=reviewed();Object.assign(input.individual,{filingStatus:'marriedJoint',spouseName:'Synthetic Spouse',spouseTaxId:'000654321',w2s:[wage('taxpayer',176100)],businesses:[business('taxpayer',10000),business('spouse',10000)]});
  const result=calculateReturn(input),se=result.forms.filter(item=>item.form==='f1040sse');assert.equal(se[0].lines['10'],0);assert.equal(se[1].lines['10'],114500);assert.equal(result.summary.selfEmploymentTaxCents,168100);assert.equal(result.forms.find(item=>item.form==='f1040').lines['10'],84100);
});
test('unknown Medicare withholding, multiple-business QBI and limited losses do not produce a complete balance',()=>{
  const input=reviewed();input.individual.w2s=[wage('taxpayer',200001)];let result=calculateReturn(input);assert.equal(result.summary.paymentsCents,null);assert.equal(result.summary.amountOwedCents,null);assert(result.diagnostics.some(item=>item.code==='MEDICARE_WITHHOLDING_REQUIRED'));
  input.individual.w2s=[];input.individual.businesses=[business(),{...business(),id:'another'}];result=calculateReturn(input);assert.equal(result.summary.totalTaxCents,null);assert(result.diagnostics.some(item=>item.code==='QBI_MULTIPLE_BUSINESS_ALLOCATION'));
  input.individual.businesses=[{...business(),receiptsCents:0,expenses:[{category:'other',amountCents:10000,description:'Synthetic loss'}],fullyAtRisk:false}];assert.equal(calculateReturn(input).summary.totalTaxCents,null);
});
test('SE minimum and simplified QBI thresholds use the selected year and status',()=>{
  const input=reviewed();input.individual.businesses=[business('taxpayer',432)];assert.equal(calculateReturn(input).summary.selfEmploymentTaxCents,0);
  input.individual.w2s=[wage('taxpayer',240000)];input.individual.businesses=[business('taxpayer',10000)];assert(calculateReturn(input).diagnostics.some(item=>item.code==='QBI_COMPLEX_LIMITS'));
  input.individual.filingStatus='marriedJoint';input.individual.spouseName='Synthetic Spouse';input.individual.spouseTaxId='000654321';assert(!calculateReturn(input).diagnostics.some(item=>item.code==='QBI_COMPLEX_LIMITS'));
});
test('partnership and S corporation use their 2025 deduction/income lines and exact owner allocations',()=>{
  for(const kind of ['1065','1120S']){const input=reviewed(kind);input.entity.receiptsCents=10000100;input.entity.expenses=[{category:'office',amountCents:1000000,description:'Synthetic office'}];input.entity.owners=[{id:'a',name:'Synthetic A',taxId:'000111111',shareBps:5000},{id:'b',name:'Synthetic B',taxId:'000222222',shareBps:5000}];const result=calculateReturn(input),main=result.forms[0];assert.equal(main.lines[kind==='1065'?'22':'21'],1000000);assert.equal(main.lines[kind==='1065'?'23':'22'],9000100);assert.equal(result.allocations[0].ordinaryIncomeCents,4500100);assert.equal(result.allocations[1].ordinaryIncomeCents,4500000);assert.equal(result.forms.length,3);assert.equal(result.filingReady,false);assert(result.diagnostics.some(item=>item.code==='PASS_THROUGH_DISCLOSURES'));}
});
test('owner allocation conserves positive/negative totals and is independent of roster order',()=>{
  const owners=[{id:'b',shareBps:3333},{id:'a',shareBps:3333},{id:'c',shareBps:3334}];for(const dollars of [-100001,-1,0,1,100001]){const a=allocateIncome(dollars*100,owners),b=allocateIncome(dollars*100,[...owners].reverse());assert.equal(a.reduce((sum,item)=>sum+item.ordinaryIncomeCents,0),dollars*100);assert.deepEqual(Object.fromEntries(a.map(item=>[item.ownerId,item.ordinaryIncomeCents])),Object.fromEntries(b.map(item=>[item.ownerId,item.ordinaryIncomeCents])));}
});
test('corporate tax and Schedule J reconcile without duplicating the six-page form',()=>{
  const input=reviewed('1120');input.entity.receiptsCents=10000000;input.entity.expenses=[{category:'wages',amountCents:4000000,description:'Synthetic wages'}];input.entity.estimatedPaymentsCents=900000;const result=calculateReturn(input);assert.equal(result.summary.totalTaxCents,1260000);assert.equal(result.summary.amountOwedCents,360000);assert.equal(result.forms.length,1);assert.equal(result.forms[0].schedules.J['12'],1260000);assert.equal(result.forms[0].schedules.J['23'],900000);
});
test('unsupported years, extra inputs and explicit additional treatments cannot become filing-ready',()=>{
  const input=reviewed();input.year=2026;assert.equal(calculateReturn(input).calculationAvailable,false);assert.equal(calculateReturn(input).forms.length,0);input.year=2025;input.individual.unrecognized=100;assert.equal(calculateReturn(input).status,'invalid-input');delete input.individual.unrecognized;input.features=['capital-income'];assert.equal(calculateReturn(input).summary.totalTaxCents,null);input.features=[];input.review.coverage=false;assert.equal(calculateReturn(input).status,'needs-attention');
});
