import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio as P,ratio} from './money.mjs';
import {eicTableLookup} from './eic-tables.mjs';

export const nyEicYears=Object.freeze([2023,2024,2025]);
// Exact IT-209 annual form comparison thresholds. Several deliberately differ
// from the federal worksheet thresholds even though their table cells agree.
export const nyNoncustodialAnnual=Object.freeze({
 2023:Object.freeze({agiLimitCents:4656000,investmentLimitCents:1100000,childComparisonCents:2160000,noneComparisonCents:Object.freeze([980000,1640000])}),
 2024:Object.freeze({agiLimitCents:4908400,investmentLimitCents:1160000,childComparisonCents:2275000,noneComparisonCents:Object.freeze([1035000,1725000])}),
 2025:Object.freeze({agiLimitCents:5043400,investmentLimitCents:1195000,childComparisonCents:2335000,noneComparisonCents:Object.freeze([1065000,1775000])}),
});
const annual=year=>{if(!nyEicYears.includes(year))throw new Error('No reviewed New York EIC annual pack exists for this year.');return nyNoncustodialAnnual[year];};
const money=(value,name,{negative=false}={})=>R(checkedMoney(value,name,{negative}));
export function nyCityEicRate(nyAgiCents,{year}){
 annual(year);const agi=money(nyAgiCents,'NYC EIC New York AGI',{negative:true}),bands=[
  [500000,null,3000],[750000,499900,3000],[1500000,null,2500],[1750000,1499900,2500],[2000000,null,2000],[2250000,1999900,2000],[4000000,null,1500],[4250000,3999900,1500],[Infinity,null,1000],
 ],[,base,initial]=bands.find(([end])=>agi<end),difference=base===null?null:agi-base,reduction=base===null?null:ratio(difference,1,500),rateBasisPoints=initial-(reduction??0);
 return {rateBasisPoints,rateLines:{'1':agi,'2':base,'3':difference,'4':reduction,'5':base===null?null:initial,'6':rateBasisPoints},rounding:'NYC rate line4 rounded to four decimal places before applying the credit'};
}
export function nyOrdinaryEic({year,federalEicCents,stateTaxBeforeCreditsCents,householdCreditCents,residentCreditCents=0,availableAccumulationCreditCents=0,nyAgiCents,nyc=false}){
 annual(year);const federal=money(federalEicCents,'Federal EIC'),tax=money(stateTaxBeforeCreditsCents,'NY tax before credits'),household=money(householdCreditCents,'NY household credit'),resident=money(residentCreditCents,'NY resident credit'),accumulation=money(availableAccumulationCreditCents,'Available NY accumulation-distribution credit'),worksheetB={lines:{'1':tax,'2':resident,'3':accumulation}};
 worksheetB.lines['4']=sumMoney([resident,accumulation]);worksheetB.lines['5']=Math.max(0,tax-worksheetB.lines['4']);
 const lines={'10':federal,'12':P(federal,3000),'13':worksheetB.lines['5'],'14':household};lines['15']=Math.min(lines['13'],lines['14']);lines['16']=Math.max(0,lines['12']-lines['15']);
 const rate=nyc?nyCityEicRate(nyAgiCents,{year}):null,cityCreditCents=rate?P(federal,rate.rateBasisPoints):0,cityWorksheet=rate?{...rate,worksheetCLines:{'1':federal,'2':rate.rateBasisPoints,'3':cityCreditCents}}:null;if(nyc)lines['27']=cityCreditCents;
 return {stateCreditCents:lines['16'],cityCreditCents,lines,worksheetB,cityWorksheet};
}
export function nyNoncustodialWorksheet({year,filingStatus,earnedIncomeCents,federalAgiCents}){
 const rules=annual(year),earned=money(earnedIncomeCents,'NY noncustodial earned income',{negative:true}),agi=money(federalAgiCents,'NY noncustodial federal AGI',{negative:true}),joint=filingStatus==='marriedJoint';
 if(!['single','marriedJoint','marriedSeparate','headOfHousehold','survivingSpouse'].includes(filingStatus))throw new Error('Choose a supported New York filing status.');
 const lines={'16':earned,'17':agi},flags={},result={amountCents:0,lines,flags,lookups:{},stop:null};
 if(agi>=rules.agiLimitCents){result.stop='AGI-at-or-above-IT209-limit';return result;}if(earned<=0){result.stop='earned-income-not-positive';return result;}
 const lookup=(income,child)=>eicTableLookup(income,{year,filingStatus:child?'single':joint?'marriedJoint':'single',qualifyingChildren:child?1:0});
 const child=lookup(earned,true);result.lookups.earnedChild=child;lines['18']=child.creditCents;flags['19']=earned===agi;flags['20']=earned===agi?null:agi<rules.childComparisonCents;
 if(earned!==agi&&agi>=rules.childComparisonCents){const value=lookup(agi,true);result.lookups.agiChild=value;lines['21']=value.creditCents;}
 lines['22']=lines['21']===undefined?lines['18']:Math.min(lines['18'],lines['21']);lines['24']=P(lines['22'],2000);
 const none=lookup(earned,false);result.lookups.earnedNone=none;lines['25']=none.creditCents;flags['26']=earned===agi;flags['27']=earned===agi?null:agi<rules.noneComparisonCents[joint?1:0];
 if(earned!==agi&&agi>=rules.noneComparisonCents[joint?1:0]){const value=lookup(agi,false);result.lookups.agiNone=value;lines['28']=value.creditCents;}
 lines['29']=lines['28']===undefined?lines['25']:Math.min(lines['25'],lines['28']);lines['31']=P(lines['29'],25000);result.amountCents=lines['32']=Math.max(lines['24'],lines['31']);return result;
}
