import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio as P,ratio} from './money.mjs';

// Final law/rates are separate from final return forms. Source pins and observed
// final/draft availability are in data/2026-sources.json (reviewed 2026-11-13).
const frozen=value=>Object.freeze(value);
export const federal2026Rules=frozen({
  standardDeductions:frozen({single:1610000,marriedJoint:3220000,marriedSeparate:1610000,headOfHousehold:2415000,survivingSpouse:3220000}),
  socialSecurityBaseCents:18450000,
  qbiSingleThresholdCents:20175000,qbiJointThresholdCents:40350000,qbiSeparateThresholdCents:20177500,
  qbiThresholds:frozen({single:20175000,marriedJoint:40350000,marriedSeparate:20177500,headOfHousehold:20175000,survivingSpouse:20175000}),
  qbiMinimumDeductionCents:40000,qbiMinimumActiveIncomeCents:100000,
});
export const federal2026CapitalThresholds=frozen({
  single:frozen([4945000,54550000]),marriedJoint:frozen([9890000,61370000]),marriedSeparate:frozen([4945000,30685000]),headOfHousehold:frozen([6620000,57960000]),survivingSpouse:frozen([9890000,61370000]),
});
// [lower dollars, inclusive upper dollars or null, marginal percent, base tax cents]
// Transcribed from Rev. Proc. 2025-32 section4.01, not reconstructed tax-table bins.
export const taxRateSchedules2026=frozen(Object.fromEntries(Object.entries({
  single:[[0,12400,10,0],[12400,50400,12,124000],[50400,105700,22,580000],[105700,201775,24,1796600],[201775,256225,32,4102400],[256225,640600,35,5844800],[640600,null,37,19297925]],
  marriedJoint:[[0,24800,10,0],[24800,100800,12,248000],[100800,211400,22,1160000],[211400,403550,24,3593200],[403550,512450,32,8204800],[512450,768700,35,11689600],[768700,null,37,20658350]],
  marriedSeparate:[[0,12400,10,0],[12400,50400,12,124000],[50400,105700,22,580000],[105700,201775,24,1796600],[201775,256225,32,4102400],[256225,384350,35,5844800],[384350,null,37,10329175]],
  headOfHousehold:[[0,17700,10,0],[17700,67450,12,177000],[67450,105700,22,774000],[105700,201750,24,1615500],[201750,256200,32,3920700],[256200,640600,35,5663100],[640600,null,37,19117100]],
}).map(([status,rows])=>[status,frozen(rows.map(frozen))])));
const blocking=(code,message)=>({code,message,severity:'blocking',field:null});
const statusKey=status=>status==='survivingSpouse'?'marriedJoint':status;

export function ordinaryTax2026(taxableCents,status){
  checkedMoney(taxableCents,'Taxable income');const key=statusKey(status);
  if(!Object.hasOwn(taxRateSchedules2026,key))throw new Error('Choose a supported filing status.');
  const rounded=R(taxableCents),dollars=rounded/100;
  if(dollars<100000)return {taxCents:null,method:'2026-final-tax-table-unavailable',formReady:false,diagnostics:[blocking('TAX_TABLE_2026_NOT_FINAL','The final 2026 IRS Tax Table is not installed. Taxable income below $100,000 remains uncalculated; another year or a bracket approximation was not substituted.')]};
  const [lower,ceiling,rate,base]=taxRateSchedules2026[key].find(row=>row[1]===null||dollars<=row[1]);
  return {taxCents:R(sumMoney([base,ratio(rounded-lower*100,rate,100)])),method:'official-2026-statutory-rate-schedule',rate,ceiling,source:'Rev. Proc. 2025-32 section 4.01',formReady:false,diagnostics:[]};
}

/** Limited ordinary QBI, including section199A(i)'s new active-business floor.
 * Active QBI must be allocated after the owner's SE adjustment by the caller.
 * Prior losses and above-threshold limitations need their own annual workpapers. */
export function qualifiedBusinessDeduction2026({filingStatus,taxableIncomeBeforeDeductionCents,qualifiedIncomeCents,activeQualifiedIncomeCents,priorLossCents=0,netCapitalGainCents=0}){
  for(const [name,value]of Object.entries({taxableIncomeBeforeDeductionCents,priorLossCents,netCapitalGainCents}))checkedMoney(value,name);
  checkedMoney(qualifiedIncomeCents,'Qualified business income',{negative:true});if(activeQualifiedIncomeCents!==null)checkedMoney(activeQualifiedIncomeCents,'Active qualified business income',{negative:true});
  const threshold=federal2026Rules.qbiThresholds[filingStatus];if(threshold===undefined)throw new Error('Choose a supported filing status.');
  const diagnostics=[];
  if(R(taxableIncomeBeforeDeductionCents)>threshold)diagnostics.push(blocking('QBI_2026_COMPLEX_LIMITS','2026 taxable income exceeds the applicable simplified QBI threshold. Wage/property and specified-service limitations require the annual Form 8995-A workpapers.'));
  if(priorLossCents>0)diagnostics.push(blocking('QBI_2026_LOSS_ALLOCATION_REQUIRED','Allocate prior QBI losses under the 2026 active-business minimum deduction rules before calculating this deduction. The new minimum was not applied to an unreviewed carryover.'));
  const ordinary=Math.min(P(Math.max(0,R(qualifiedIncomeCents)),2000),P(Math.max(0,R(taxableIncomeBeforeDeductionCents)-R(netCapitalGainCents)),2000));
  if(activeQualifiedIncomeCents===null&&ordinary<40000)diagnostics.push(blocking('QBI_2026_ACTIVE_REVIEW_REQUIRED','Review qualified income from materially participating businesses before deciding whether the new $400 minimum deduction applies.'));
  const minimum=activeQualifiedIncomeCents!==null&&activeQualifiedIncomeCents>=100000?40000:0;
  return {deductionCents:diagnostics.length?null:Math.max(ordinary,minimum),ordinaryDeductionCents:ordinary,minimumDeductionCents:activeQualifiedIncomeCents===null?null:minimum,thresholdCents:threshold,diagnostics};
}

export const federal2026Availability=frozen({
  year:2026,reviewedAt:'2026-11-13',annualRulesAvailable:true,finalTaxTableAvailable:false,finalMainReturnAvailable:false,
  finalForms:frozen(['f1040sc','f1040sse']),finalInstructions:frozen(['i1040sse']),
  missingFinalForms:frozen(['f1040','f1040s1','f1040s2','f1040s3','f8995','f1040sb','f8960','f8959','f1040sh','f1065','f1120s','f1120']),
  filingApproved:false,
});
