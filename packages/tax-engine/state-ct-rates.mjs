// Connecticut DRS CT-1040 Tax Calculation Schedule, Tables A-E, 2023-2025.
// All inputs/outputs are integer cents; thresholds are the published whole dollars.
import {checkedMoney,wholeDollars,wholeRatio} from './money.mjs';
export const ctYears=Object.freeze([2023,2024,2025]);
export const ctSources=Object.freeze(Object.fromEntries(ctYears.map(year=>[year,Object.freeze({
 instructions:`https://portal.ct.gov/-/media/drs/forms/${year}/income/${year}-ct-1040-instructions_12${String(year).slice(2)}.pdf`,
 form:`https://portal.ct.gov/-/media/drs/forms/${year}/income/ct-1040_12${String(year).slice(2)}.pdf`,
})])));
const statusParameters=Object.freeze({
 single:{exemption:15000,exemptionStart:30000,bracketScale:1,phaseStart:56500,phaseStep:5000,phase2023:20,phase2024:25,propertyStart:49500,propertyStep:10000},
 marriedSeparate:{exemption:12000,exemptionStart:24000,bracketScale:1,phaseStart:50250,phaseStep:2500,phase2023:20,phase2024:25,propertyStart:35250,propertyStep:5000},
 marriedJoint:{exemption:24000,exemptionStart:48000,bracketScale:2,phaseStart:100500,phaseStep:5000,phase2023:40,phase2024:50,propertyStart:70500,propertyStep:10000},
 headOfHousehold:{exemption:19000,exemptionStart:38000,bracketScale:1.6,phaseStart:78500,phaseStep:4000,phase2023:32,phase2024:40,propertyStart:54500,propertyStep:10000},
});
const personalThresholds={
 single:[18800,19300,19800,20300,20800,21300,21800,22300,25000,25500,26000,26500,31300,31800,32300,32800,33300,60000,60500,61000,61500,62000,62500,63000,63500,64000,64500],
 marriedJoint:[30000,30500,31000,31500,32000,32500,33000,33500,40000,40500,41000,41500,50000,50500,51000,51500,52000,96000,96500,97000,97500,98000,98500,99000,99500,100000,100500],
 marriedSeparate:[15000,15500,16000,16500,17000,17500,18000,18500,20000,20500,21000,21500,25000,25500,26000,26500,27000,48000,48500,49000,49500,50000,50500,51000,51500,52000,52500],
 headOfHousehold:[24000,24500,25000,25500,26000,26500,27000,27500,34000,34500,35000,35500,44000,44500,45000,45500,46000,74000,74500,75000,75500,76000,76500,77000,77500,78000,78500],
};
const personalPercents=[75,70,65,60,55,50,45,40,35,30,25,20,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1];
const selectedStatus=status=>status==='survivingSpouse'?'marriedJoint':status;
const steps=(agi,start,width,max)=>Math.min(max,Math.max(0,Math.ceil((agi-start)/width)));
function scope(year,status){if(!ctYears.includes(year))throw new Error('No reviewed Connecticut annual calculation pack is installed for this year.');const key=selectedStatus(status),parameters=statusParameters[key];if(!parameters)throw new Error('Choose a supported Connecticut resident filing status matching the federal return.');return {key,parameters};}
export function ctInitialTax(taxableIncomeCents,{year,filingStatus}){
 const {parameters:p}=scope(year,filingStatus),income=wholeDollars(checkedMoney(taxableIncomeCents)),limits=[10000,50000,100000,200000,250000,500000].map(value=>Math.round(value*p.bracketScale)*100),rates=year===2023?[300,500,550,600,650,690,699]:[200,450,550,600,650,690,699];
 let lower=0,base=0;for(let index=0;index<rates.length;index++){const upper=limits[index]??Infinity;if(income<=upper)return base+wholeRatio(income-lower,rates[index]);base+=wholeRatio(upper-lower,rates[index]);lower=upper;}throw new Error('Connecticut tax bracket selection failed.');
}
export function ctTaxCalculation(agiCents,{year,filingStatus}){
 const {key,parameters:p}=scope(year,filingStatus),agi=wholeDollars(checkedMoney(agiCents,'Connecticut adjusted gross income',{negative:true})),dollars=agi/100;
 const exemptionCents=Math.max(0,p.exemption-1000*steps(dollars,p.exemptionStart,1000,p.exemption/1000))*100,taxableIncomeCents=Math.max(0,agi-exemptionCents),initialTaxCents=ctInitialTax(taxableIncomeCents,{year,filingStatus});
 const phaseOutCents=steps(dollars,p.phaseStart,p.phaseStep,10)*(year===2023?p.phase2023:p.phase2024)*100,scale=p.bracketScale,first=year===2023?0:steps(dollars,105000*scale,5000*scale,10)*(key==='headOfHousehold'?40:key==='marriedJoint'?50:25),second=steps(dollars,200000*scale,5000*scale,30)*(key==='headOfHousehold'?140:key==='marriedJoint'?180:90),third=steps(dollars,500000*scale,5000*scale,9)*(key==='headOfHousehold'?80:key==='marriedJoint'?100:50),recaptureCents=(first+second+third)*100;
 const index=personalThresholds[key].findIndex(upper=>dollars<=upper),personalCreditBps=index<0?0:personalPercents[index]*100,beforeCreditCents=initialTaxCents+phaseOutCents+recaptureCents,personalCreditCents=wholeRatio(beforeCreditCents,personalCreditBps),incomeTaxCents=beforeCreditCents-personalCreditCents;
 return {agiCents:agi,exemptionCents,taxableIncomeCents,initialTaxCents,phaseOutCents,recaptureCents,beforeCreditCents,personalCreditBps,personalCreditCents,incomeTaxCents};
}
export function ctPropertyTaxCredit(agiCents,paidCents,taxBeforeCreditCents,{year,filingStatus}){
 const {parameters:p}=scope(year,filingStatus),agi=wholeDollars(checkedMoney(agiCents,'Connecticut AGI',{negative:true}))/100,paid=wholeDollars(checkedMoney(paidCents)),limit=30000,limitedPaidCents=Math.min(limit,paid),phaseOutBps=Math.min(10000,steps(agi,p.propertyStart,p.propertyStep,7)*1500),phaseOutCents=wholeRatio(limitedPaidCents,phaseOutBps),calculatedCreditCents=limitedPaidCents-phaseOutCents,allowedCreditCents=Math.min(checkedMoney(taxBeforeCreditCents),calculatedCreditCents);
 return {paidCents:paid,maximumCreditCents:limit,limitedPaidCents,phaseOutBps,phaseOutCents,calculatedCreditCents,allowedCreditCents};
}
