import {checkedMoney,sumMoney,ratio,wholeDollars as R} from './money.mjs';
import {ordinaryTax} from './ordinary-tax.mjs';
// Annual Form 1040 Qualified Dividends and Capital Gain Tax Worksheet, lines
// 6 and 13. Surviving spouse uses the joint limits; MFS is explicit, not halved.
export const capitalTaxThresholds=Object.freeze({
  2023:{single:[4462500,49230000],marriedSeparate:[4462500,27690000],marriedJoint:[8925000,55385000],survivingSpouse:[8925000,55385000],headOfHousehold:[5975000,52305000]},
  2024:{single:[4702500,51890000],marriedSeparate:[4702500,29185000],marriedJoint:[9405000,58375000],survivingSpouse:[9405000,58375000],headOfHousehold:[6300000,55135000]},
  2025:{single:[4835000,53340000],marriedSeparate:[4835000,30000000],marriedJoint:[9670000,60005000],survivingSpouse:[9670000,60005000],headOfHousehold:[6475000,56670000]},
});
export function qualifiedCapitalTax({year,filingStatus,taxableIncomeCents,qualifiedDividendsCents=0,preferentialGainCents=0,unknown=false}){
  if(unknown||taxableIncomeCents===null)return {taxCents:null,method:'qualified-capital-income-unresolved',worksheet:null};
  for(const [name,value]of Object.entries({taxableIncomeCents,qualifiedDividendsCents,preferentialGainCents}))checkedMoney(value,name);
  if(!qualifiedDividendsCents&&!preferentialGainCents)return ordinaryTax(taxableIncomeCents,filingStatus,year);
  if(!capitalTaxThresholds[year])return {taxCents:null,method:'qualified-capital-year-unsupported',worksheet:null};
  const limits=capitalTaxThresholds[year][filingStatus];if(!limits)throw new Error('Choose a supported capital-tax filing status.');
  const w={'1':R(taxableIncomeCents),'2':R(qualifiedDividendsCents),'3':R(preferentialGainCents)};
  w['4']=sumMoney([w['2'],w['3']]);w['5']=Math.max(0,w['1']-w['4']);w['6']=limits[0];w['7']=Math.min(w['1'],w['6']);w['8']=Math.min(w['5'],w['7']);w['9']=w['7']-w['8'];w['10']=Math.min(w['1'],w['4']);w['11']=w['9'];w['12']=w['10']-w['11'];w['13']=limits[1];w['14']=Math.min(w['1'],w['13']);w['15']=sumMoney([w['5'],w['9']]);w['16']=Math.max(0,w['14']-w['15']);w['17']=Math.min(w['12'],w['16']);w['18']=ratio(w['17'],1500);w['19']=sumMoney([w['9'],w['17']]);w['20']=w['10']-w['19'];w['21']=ratio(w['20'],2000);w['22']=ordinaryTax(w['5'],filingStatus,year).taxCents;w['23']=sumMoney([w['18'],w['21'],w['22']]);w['24']=ordinaryTax(w['1'],filingStatus,year).taxCents;w['25']=R(Math.min(w['23'],w['24']));
  return {taxCents:w['25'],method:`official-${year}-qualified-dividends-capital-gain-worksheet`,worksheet:w};
}
