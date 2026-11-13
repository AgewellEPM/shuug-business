import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {retirementIncome,socialSecurityBenefits,newRetirementIncome,newTaxExemptPayer} from '../retirement-income.mjs';
import {calculateReturn} from '../index.mjs';
import {retirementFixture,distribution,benefit} from './retirement-fixtures.mjs';
import {reviewed,wage,business} from './fixtures.mjs';
import {investmentFixture} from './investment-fixtures.mjs';
const reference=JSON.parse(await readFile(new URL('./retirement-reference.json',import.meta.url),'utf8'));
const context={year:2025,filingStatus:'single',otherIncomeCents:0,adjustmentsCents:0},calc=(value,options={})=>retirementIncome(value,{...context,...options});

for(const year of [2023,2024,2025])test(`${year} published Pub915 example1 flows from pension/wage/benefit sources to taxable benefits`,()=>{
  const row=reference.publishedSupportedExample,input=reviewed();input.year=year;input.individual.w2s=[wage('taxpayer',row.wages)];input.individual.taxableInterestCents=row.interest*100;input.individual.retirementIncome=retirementFixture();input.individual.retirementIncome.distributions=[distribution('qualifiedPlan',row.pension)];input.individual.retirementIncome.benefits=[benefit(row.benefits)];const result=calculateReturn(input),lines=result.forms[0].lines;assert.equal(result.calculationAvailable,true);assert.equal(lines['5b'],row.pension*100);assert.equal(lines['5a'],undefined);assert.equal(lines['6a'],row.benefits*100);assert.equal(lines['6b'],row.taxableBenefits*100);assert.equal(result.summary.adjustedGrossIncomeCents,(row.wages+row.interest+row.pension+row.taxableBenefits)*100);assert.equal(result.filingReady,false);
});

test('benefit worksheet uses filing status, exempt interest, signed other income and allowed adjustments',()=>{
  for(const year of [2023,2024,2025])for(const row of reference.syntheticBenefits){const result=socialSecurityBenefits({year,filingStatus:row.status,netBenefitsCents:row.benefits*100,otherIncomeCents:row.otherIncome*100,taxExemptInterestCents:row.exempt*100,adjustmentsCents:row.adjustments*100,livedApartAllYear:row.apart??'unknown'});assert.equal(result.taxableCents,row.taxable*100,JSON.stringify({year,...row}));}
  assert.equal(socialSecurityBenefits({...context,netBenefitsCents:1000000,taxExemptInterestCents:0,unknown:true}).taxableCents,null);
});

test('ordinary IRA/pension, qualified Roth and valid direct/60-day rollover use calculated source amounts',()=>{
  const value=retirementFixture();value.distributions=[distribution(),distribution('qualifiedPlan',20000),distribution('rothIRA',5000,{distributionCodes:'Q',treatment:'qualifiedRoth',reportedTaxableCents:0})];let result=calc(value);assert.equal(result.incomeUnknown,false);assert.equal(result.lines['4a'],1500000);assert.equal(result.lines['4b'],1000000);assert.equal(result.lines['5b'],2000000);assert.equal(result.taxableIncomeCents,3000000);
  value.distributions=[distribution('traditionalIRA',10000,{treatment:'rollover',rolloverCents:800000,rolloverMethod:'60day',rolloverDestination:'traditionalIRA',receivedDate:'2025-12-15',rolloverDate:'2026-02-13',federalWithholdingCents:100000})];result=calc(value);assert.equal(result.incomeUnknown,false);assert.equal(result.lines['4a'],1000000);assert.equal(result.lines['4b'],200000);assert.equal(result.lines['25b'],100000);assert.equal(result.annotations.iraRollover,true);
  value.distributions=[distribution('qualifiedPlan',10000,{treatment:'rollover',distributionCodes:'G',reportedTaxableCents:0,rolloverCents:1000000,rolloverMethod:'direct',rolloverDestination:'traditionalIRA'})];result=calc(value);assert.equal(result.incomeUnknown,false);assert.equal(result.lines['5a'],1000000);assert.equal(result.lines['5b'],0);assert.equal(result.annotations.pensionRollover,true);
});

test('unsupported methods, source conflicts and ineligible rollovers preserve sources and suppress calculated amounts',()=>{
  const value=retirementFixture();for(const treatment of ['unreviewed','basis','annuity','early','other']){value.distributions=[distribution('traditionalIRA',10000,{treatment})];const original=structuredClone(value),result=calc(value);assert.equal(result.incomeUnknown,true,treatment);assert.equal(result.lines['4b'],null);assert.deepEqual(value,original);}
  value.distributions=[distribution('traditionalIRA',10000,{reportedTaxableCents:500000})];assert(calc(value).diagnostics.some(item=>item.code==='RETIREMENT_BOX2A_CONFLICT'));value.distributions[0].reportedTaxableCents=1000000;value.distributions[0].afterTaxContributionsCents=10000;assert(calc(value).diagnostics.some(item=>item.code==='RETIREMENT_BASIS_REQUIRED'));
  value.distributions=[distribution('traditionalIRA',10000,{treatment:'rollover',rolloverCents:1000000,rolloverMethod:'60day',rolloverDestination:'traditionalIRA',receivedDate:'2025-12-15',rolloverDate:'2026-02-14'})];assert.equal(calc(value).incomeUnknown,true);value.distributions[0].rolloverDate='2026-02-13';value.distributions[0].rolloverDestination='rothIRA';assert.equal(calc(value).incomeUnknown,true);value.distributions[0].rolloverDestination='traditionalIRA';value.distributions[0].distributionCodes='1';assert.equal(calc(value).incomeUnknown,true);
  value.distributions=[distribution()];for(const key of ['source','treatment','noAdditionalTax']){value.distributions[0].review[key]=false;assert.equal(calc(value).incomeUnknown,true,key);value.distributions[0].review[key]=true;}value.distributions[0].review.source=false;assert.equal(calc(value).federalWithholdingCents,null);value.distributions[0].review.source=true;value.distributions[0].review.rollover=false;assert.equal(calc(value).incomeUnknown,false);
});

test('benefit repayments, 1099 withholding, source review and separate-return living arrangement remain explicit',()=>{
  const value=retirementFixture();value.benefits=[benefit(10000,{benefitsRepaidCents:200000,reportedNetCents:800000,federalWithholdingCents:100000})];let result=calc(value,{otherIncomeCents:4000000});assert.equal(result.lines['6a'],800000);assert.equal(result.lines['6b'],680000);assert.equal(result.federalWithholdingCents,100000);
  value.benefits[0].reportedNetCents=700000;assert.equal(calc(value).incomeUnknown,true);value.benefits[0].reportedNetCents=800000;value.review.noLumpSum=false;assert.equal(calc(value).incomeUnknown,true);value.review.noLumpSum=true;
  value.benefits[0].benefitsRepaidCents=1100000;delete value.benefits[0].reportedNetCents;result=calc(value);assert.equal(result.lines['6a'],null);assert.equal(result.lines['6b'],null);assert(result.diagnostics.some(item=>item.code==='SOCIAL_SECURITY_REPAYMENT_REVIEW'));
  value.benefits=[benefit()];assert.equal(calc(value,{filingStatus:'marriedSeparate'}).incomeUnknown,true);value.livedApartAllYear='yes';assert.equal(calc(value,{filingStatus:'marriedSeparate'}).annotations.livedApart,true);assert.equal(calc(value,{filingStatus:'marriedSeparate'}).lines['6b'],0);value.livedApartAllYear='no';assert.equal(calc(value,{filingStatus:'marriedSeparate'}).lines['6b'],425000);
});

test('tax-exempt interest is included in Social Security provisional income and excluded from federal taxable income/NIIT',()=>{
  const input=reviewed();input.individual.w2s=[wage('taxpayer',20000)];const value=retirementFixture();input.individual.retirementIncome=value;value.benefits=[benefit(10000)];value.taxExemptInterestPayers=[{...newTaxExemptPayer(),payer:'Synthetic municipal fund',amountCents:1000000,source:'Synthetic exempt-interest statement'}];const result=calculateReturn(input);assert.equal(result.forms[0].lines['2a'],1000000);assert.equal(result.forms[0].lines['6b'],535000);assert.equal(result.summary.adjustedGrossIncomeCents,2535000);assert.equal(result.retirement.worksheet['4'],1000000);
  value.review.taxExemptInterest=false;const unknown=calculateReturn(input);assert.equal(unknown.forms[0].lines['2a'],null);assert.equal(unknown.forms[0].lines['6b'],null);assert.equal(unknown.summary.totalTaxCents,null);
});

test('retirement increases NIIT MAGI and the QBI taxable-income limit but is neither NII nor self-employment earnings',()=>{
  const input=reviewed();input.individual.w2s=[{...wage('taxpayer',195000),medicareTaxWithheldCents:282750}];input.individual.investmentIncome=investmentFixture(10000,0);input.individual.retirementIncome=retirementFixture();input.individual.retirementIncome.distributions=[distribution('qualifiedPlan',30000,{federalWithholdingCents:300000})];const high=calculateReturn(input);assert.equal(high.summary.adjustedGrossIncomeCents,23500000);assert.equal(high.summary.netInvestmentIncomeTaxCents,38000);assert.equal(high.forms.find(item=>item.form==='f8960').lines['12'],1000000);assert.equal(high.summary.additionalMedicareTaxCents,0);assert.equal(high.summary.selfEmploymentTaxCents,0);assert.equal(high.summary.paymentsCents,300000);
  input.individual.w2s=[];input.individual.investmentIncome=investmentFixture(0,0);input.individual.businesses=[business('taxpayer',20000)];const qbi=calculateReturn(input),lines=qbi.forms.find(item=>item.form==='f8995').lines;assert(lines['2']<2000000);assert(lines['11']>3000000);assert.equal(lines['15'],lines['5']);assert(qbi.summary.selfEmploymentTaxCents<300000);
});

test('unknown retirement suppresses dependent AGI/tax/QBI/balances while separately reviewed withholding stays available',()=>{
  const input=reviewed();input.individual.retirementIncome=retirementFixture();input.individual.retirementIncome.distributions=[distribution('traditionalIRA',30000)];input.individual.businesses=[business('taxpayer',30000)];input.individual.retirementIncome.distributions[0].review.treatment=false;let result=calculateReturn(input);for(const key of ['adjustedGrossIncomeCents','taxableIncomeCents','ordinaryTaxCents','totalTaxCents','refundCents','amountOwedCents'])assert.equal(result.summary[key],null,key);assert(!result.forms.some(item=>item.form==='f8995'));assert.equal(result.forms[0].lines['23'],null);assert.equal(result.forms.find(item=>item.form==='f1040s2').lines['21'],null);assert.equal(result.summary.paymentsCents,0);
  input.individual.retirementIncome.distributions[0].review.treatment=true;input.individual.retirementIncome.distributions[0].review.source=false;result=calculateReturn(input);assert.equal(result.summary.paymentsCents,null);assert.equal(result.forms[0].lines['25b'],null);
});

test('unresolved inventory suppresses dependent benefit/SE/Medicare values even when provisional profit is nonpositive',()=>{
  for(const receipts of [30000,1000]){const input=reviewed();input.individual.businesses=[{...business('taxpayer',receipts),costOfGoodsCents:200000}];input.individual.w2s=[{...wage('taxpayer',220000,5000),medicareTaxWithheldCents:337000}];input.individual.retirementIncome=retirementFixture();input.individual.retirementIncome.benefits=[benefit()];const result=calculateReturn(input);assert.equal(result.summary.adjustedGrossIncomeCents,null);assert.equal(result.forms[0].lines['6b'],null);assert.equal(result.retirement.worksheet,null);assert.equal(result.summary.selfEmploymentTaxCents,null);assert.equal(result.summary.additionalMedicareTaxCents,null);assert.equal(result.summary.additionalMedicareWithholdingCents,18000);assert.equal(result.summary.paymentsCents,518000);for(const form of result.forms.filter(row=>row.form==='f1040sse')){assert.equal(form.lines['12'],null);assert.equal(form.taxCents,null);assert.equal(form.halfTaxCents,null);}}
});

test('strict source identity/ownership and annual gates preserve old returns without inventing2026 treatment',()=>{
  assert.equal(calc(undefined).required,false);assert.equal(calc(undefined,{year:2026}).incomeUnknown,false);assert.equal(calc(newRetirementIncome(),{year:2026}).incomeUnknown,true);assert.throws(()=>calc({}, {year:2026}),/structured record/);
  const value=retirementFixture();value.distributions=[distribution()];value.distributions[0].owner='spouse';assert.throws(()=>calc(value),/joint return/);value.distributions[0].owner='taxpayer';value.benefits=[benefit(10000,{id:value.distributions[0].id})];assert.throws(()=>calc(value),/unique/);value.benefits=[];value.distributions[0].grossCents=0.1;assert.throws(()=>calc(value),/integer-cent/);
});
