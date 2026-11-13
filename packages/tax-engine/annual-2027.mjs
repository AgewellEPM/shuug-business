import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio as P,ratio} from './money.mjs';

// Officially released 2027 rules are separate from annual forms and lookup
// tables. Exact source bytes, release evidence and unavailable endpoints are
// recorded in data/2027-sources.json. No 2026 constants or blanks are substituted.
const frozen=value=>Object.freeze(value);
export const federal2027Rules=frozen({
 standardDeductions:frozen({single:1660000,marriedJoint:3320000,marriedSeparate:1660000,headOfHousehold:2492500,survivingSpouse:3320000}),
 socialSecurityBaseCents:19230000,
 qbiSingleThresholdCents:20830000,qbiJointThresholdCents:41660000,qbiSeparateThresholdCents:20832500,
 qbiThresholds:frozen({single:20830000,marriedJoint:41660000,marriedSeparate:20832500,headOfHousehold:20830000,survivingSpouse:20830000}),
 qbiMinimumDeductionCents:41500,qbiMinimumActiveIncomeCents:103000,
});
export const federal2027CapitalThresholds=frozen({
 single:frozen([5105000,56320000]),marriedJoint:frozen([10210000,63360000]),marriedSeparate:frozen([5105000,31680000]),headOfHousehold:frozen([6835000,59840000]),survivingSpouse:frozen([10210000,63360000]),
});
// [lower dollars, inclusive upper dollars or null, marginal percent, base tax cents]
// Published base-plus-excess rows: Rev. Proc. 2026-35 section 3.01.
export const taxRateSchedules2027=frozen(Object.fromEntries(Object.entries({
 single:[[0,12800,10,0],[12800,52025,12,128000],[52025,109125,22,598700],[109125,208325,24,1854900],[208325,264550,32,4235700],[264550,661375,35,6034900],[661375,null,37,19923775]],
 marriedJoint:[[0,25600,10,0],[25600,104050,12,256000],[104050,218250,22,1197400],[218250,416650,24,3709800],[416650,529100,32,8471400],[529100,793650,35,12069800],[793650,null,37,21329050]],
 marriedSeparate:[[0,12800,10,0],[12800,52025,12,128000],[52025,109125,22,598700],[109125,208325,24,1854900],[208325,264550,32,4235700],[264550,396825,35,6034900],[396825,null,37,10664525]],
 headOfHousehold:[[0,18250,10,0],[18250,69650,12,182500],[69650,109100,22,799300],[109100,208300,24,1667200],[208300,264550,32,4048000],[264550,661350,35,5848000],[661350,null,37,19736000]],
}).map(([status,rows])=>[status,frozen(rows.map(frozen))])));
const blocking=(code,message)=>({code,message,severity:'blocking',field:null});

export function ordinaryTax2027(taxableCents,status){
 checkedMoney(taxableCents,'Taxable income');const key=status==='survivingSpouse'?'marriedJoint':status;
 if(!Object.hasOwn(taxRateSchedules2027,key))throw new Error('Choose a supported filing status.');
 const rounded=R(taxableCents),dollars=rounded/100;
 if(dollars<100000)return {taxCents:null,method:'2027-final-tax-table-unavailable',formReady:false,diagnostics:[blocking('TAX_TABLE_2027_NOT_FINAL','The final 2027 IRS Tax Table is not installed. Taxable income below $100,000 remains uncalculated; another year or a bracket approximation was not substituted.')]};
 const [lower,ceiling,rate,base]=taxRateSchedules2027[key].find(row=>row[1]===null||dollars<=row[1]);
 return {taxCents:R(sumMoney([base,ratio(rounded-lower*100,rate,100)])),method:'official-2027-statutory-rate-schedule',rate,ceiling,source:'Rev. Proc. 2026-35 section 3.01',formReady:false,diagnostics:[]};
}

/** Ordinary below-threshold QBI with the indexed active-business minimum.
 * Caller supplies the active portion after deductible SE-tax/business adjustments.
 * Unresolved prior-loss allocation and above-threshold limits remain unknown. */
export function qualifiedBusinessDeduction2027({filingStatus,taxableIncomeBeforeDeductionCents,qualifiedIncomeCents,activeQualifiedIncomeCents,priorLossCents=0,netCapitalGainCents=0}){
 for(const [name,value]of Object.entries({taxableIncomeBeforeDeductionCents,priorLossCents,netCapitalGainCents}))checkedMoney(value,name);
 checkedMoney(qualifiedIncomeCents,'Qualified business income',{negative:true});if(activeQualifiedIncomeCents!==null)checkedMoney(activeQualifiedIncomeCents,'Active qualified business income',{negative:true});
 const threshold=federal2027Rules.qbiThresholds[filingStatus];if(threshold===undefined)throw new Error('Choose a supported filing status.');
 const diagnostics=[];
 if(R(taxableIncomeBeforeDeductionCents)>threshold)diagnostics.push(blocking('QBI_2027_COMPLEX_LIMITS','2027 taxable income exceeds the applicable simplified QBI threshold. Wage/property and specified-service limitations require separate annual workpapers.'));
 if(priorLossCents>0)diagnostics.push(blocking('QBI_2027_LOSS_ALLOCATION_REQUIRED','Allocate prior QBI losses under the 2027 active-business minimum deduction rules before calculating this deduction. The minimum was not applied to an unreviewed carryover.'));
 const ordinary=Math.min(P(Math.max(0,R(qualifiedIncomeCents)),2000),P(Math.max(0,R(taxableIncomeBeforeDeductionCents)-R(netCapitalGainCents)),2000));
 const minimumAmount=federal2027Rules.qbiMinimumDeductionCents,minimumIncome=federal2027Rules.qbiMinimumActiveIncomeCents;
 if(activeQualifiedIncomeCents===null&&ordinary<minimumAmount)diagnostics.push(blocking('QBI_2027_ACTIVE_REVIEW_REQUIRED','Review qualified income from materially participating businesses before deciding whether the indexed $415 minimum deduction applies.'));
 const minimum=activeQualifiedIncomeCents!==null&&activeQualifiedIncomeCents>=minimumIncome?minimumAmount:0;
 return {deductionCents:diagnostics.length?null:Math.max(ordinary,minimum),ordinaryDeductionCents:ordinary,minimumDeductionCents:activeQualifiedIncomeCents===null?null:minimum,thresholdCents:threshold,diagnostics};
}

export const federal2027Availability=frozen({
 year:2027,reviewedAt:'2026-11-13',annualRulesAvailable:true,finalTaxTableAvailable:false,finalMainReturnAvailable:false,
 finalForms:frozen([]),finalInstructions:frozen([]),
 missingFinalForms:frozen(['f1040','f1040s1','f1040s2','f1040s3','f1040sc','f1040sse','f1040s8','f1040sei','f8995','f1040sb','f8960','f8959','f1040sh','f1065','f1120s','f1120']),
 filingApproved:false,
});
