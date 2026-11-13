import {checkedMoney,wholeDollars as R,wholeRatio as P,ratio,sumMoney} from './money.mjs';
import {nyTaxTables} from './state-ny-tables.mjs';
export const nyYears=Object.freeze([2023,2024,2025]);
const statusKey=status=>['marriedJoint','survivingSpouse'].includes(status)?'joint':['single','marriedSeparate'].includes(status)?'single':status==='headOfHousehold'?'head':null;
function scope(year,status){const key=statusKey(status);if(!nyYears.includes(year)||!key)throw new Error('Choose an installed New York annual resident pack and filing status.');return key;}
const nysBrackets={
 single:[[0,0,400],[8500,340,450],[11700,484,525],[13900,600,550],[80650,4271,600],[215400,12356,685],[1077550,71413,965],[5000000,449929,1030],[25000000,2509929,1090]],
 joint:[[0,0,400],[17150,686,450],[23600,976,525],[27900,1202,550],[161550,8553,600],[323200,18252,685],[2155350,143754,965],[5000000,418263,1030],[25000000,2478263,1090]],
 head:[[0,0,400],[12800,512,450],[17650,730,525],[20900,901,550],[107650,5672,600],[269300,15371,685],[1616450,107651,965],[5000000,434163,1030],[25000000,2494163,1090]],
};
const nycBrackets={single:[[0,0,3078],[12000,369,3762],[25000,858,3819],[50000,1813,3876]],joint:[[0,0,3078],[21600,665,3762],[45000,1545,3819],[90000,3264,3876]],head:[[0,0,3078],[14400,443,3762],[30000,1030,3819],[60000,2176,3876]]};
function schedule(income,brackets,denominator){const row=brackets.findLast(([lower])=>income>lower*100)??brackets[0];return sumMoney([row[1]*100,P(income-row[0]*100,row[2],denominator)]);}
function table(income,key,kind){const row=nyTaxTables[kind].find(([lower,upper])=>income>=lower*100&&income<upper*100);if(!row)throw new Error('New York taxable income has no exact annual tax-table row.');return {taxCents:row[{single:2,joint:3,head:4}[key]]*100,lowerCents:row[0]*100,upperCents:row[1]*100};}
export function nyStateTax(agiCents,taxableIncomeCents,{year,filingStatus}){
 const key=scope(year,filingStatus),agi=R(checkedMoney(agiCents,'New York AGI',{negative:true})),taxable=R(checkedMoney(taxableIncomeCents)),base=schedule(taxable,nysBrackets[key],10000);
 if(agi<=10765000){if(taxable<6500000)return {method:'tax-table',...table(taxable,key,'nys'),recaptureCents:0};return {method:'rate-schedule',taxCents:base,recaptureCents:0};}
 if(agi>2500000000)return {method:'tax-computation',worksheet:{joint:6,single:11,head:16}[key],taxCents:P(taxable,1090),recaptureCents:null};
 const firstUpper={joint:161550,single:215400,head:269300}[key],firstWorksheet={joint:1,single:7,head:12}[key];
 if(taxable<=firstUpper*100){const flat=P(taxable,key==='joint'?550:600),fractionBps=agi>=15765000?10000:ratio(agi-10765000,10000,5000000),recaptureCents=P(flat-base,fractionBps);return {method:'tax-computation',worksheet:firstWorksheet,baseTaxCents:base,fractionBps,recaptureCents,taxCents:agi>=15765000?flat:base+recaptureCents};}
 const rows={joint:[[161550,323200,333,807,2],[323200,2155350,1140,2747,3],[2155350,5000000,3887,60350,4],[5000000,Infinity,64237,32500,5]],single:[[215400,1077550,568,1831,8],[1077550,5000000,2399,30172,9],[5000000,Infinity,32571,32500,10]],head:[[269300,1616450,787,2289,13],[1616450,5000000,3076,45261,14],[5000000,Infinity,48337,32500,15]]}[key];
 const [lower,,recaptureBase,increment,worksheet]=rows.find(([lower,upper])=>taxable>lower*100&&taxable<=upper*100),fractionBps=ratio(Math.min(5000000,Math.max(0,agi-lower*100)),10000,5000000),recaptureCents=recaptureBase*100+P(increment*100,fractionBps);return {method:'tax-computation',worksheet,baseTaxCents:base,fractionBps,recaptureCents,taxCents:base+recaptureCents};
}
export function nyCityTax(taxableIncomeCents,{year,filingStatus}){const key=scope(year,filingStatus),income=R(checkedMoney(taxableIncomeCents));return income<6500000?{method:'tax-table',...table(income,key,'nyc')}:{method:'rate-schedule',taxCents:schedule(income,nycBrackets[key],100000)};}
export function nyStandardDeduction({year,filingStatus,claimedDependent}){scope(year,filingStatus);return ({single:claimedDependent?3100:8000,marriedJoint:16050,marriedSeparate:8000,headOfHousehold:11200,survivingSpouse:16050})[filingStatus]*100;}
const nysJoint=[[5000,90,15],[6000,75,15],[7000,65,15],[20000,60,15],[22000,60,10],[25000,50,10],[28000,40,5],[32000,20,5]];
const nysSeparate=[[5000,[45,53,60,68,75,83,90],8],[6000,[38,45,53,60,68,75,83],8],[7000,[33,40,48,55,63,70,78],8],[20000,[30,38,45,53,60,68,75],8],[22000,[30,35,40,45,50,55,60],5],[25000,[25,30,35,40,45,50,55],5],[28000,[20,23,25,28,30,33,35],3],[32000,[10,13,15,18,20,23,25],3]];
const nycSeparate=[[15000,[15,30,45,60,75,90,105],15],[17500,[13,25,38,50,63,75,88],13],[20000,[8,15,23,30,38,45,53],8],[22500,[5,10,15,20,25,30,35],5]];
export function nyHouseholdCredit(federalAgiCents,{year,filingStatus,claimedDependent,dependents=0,spouseFederalAgiCents=null,spouseDependents=0,city=false}){
 scope(year,filingStatus);if(claimedDependent)return 0;const fagi=R(checkedMoney(federalAgiCents,'Federal AGI',{negative:true}));if(!Number.isInteger(dependents)||dependents<0||!Number.isInteger(spouseDependents)||spouseDependents<0)throw new Error('New York household size must be an integer.');
 if(filingStatus==='single'){const row=(city?[[10000,15],[12500,10]]:[[5000,75],[6000,60],[7000,50],[20000,45],[25000,40],[28000,20]]).find(([upper])=>fagi<=upper*100);return(row?.[1]??0)*100;}
 if(filingStatus==='marriedSeparate'){if(spouseFederalAgiCents===null)return null;const jointAgi=sumMoney([fagi,R(checkedMoney(spouseFederalAgiCents,'Spouse federal AGI',{negative:true}))]),size=2+dependents+spouseDependents,row=(city?nycSeparate:nysSeparate).find(([upper])=>jointAgi<=upper*100);return row?(row[1][Math.min(size,7)-1]+Math.max(0,size-7)*row[2])*100:0;}
 const size=dependents+(filingStatus==='marriedJoint'?2:1),row=(city?[[15000,30,30],[17500,25,25],[20000,15,15],[22500,10,10]]:nysJoint).find(([upper])=>fagi<=upper*100);return row?(row[1]+(size-1)*row[2])*100:0;
}
export function nySchoolCredits(federalAgiCents,cityTaxableIncomeCents,{year,filingStatus,claimedDependent,iraIncomeCents=0}){
 const key=scope(year,filingStatus),income=sumMoney([R(checkedMoney(federalAgiCents,'Federal AGI',{negative:true})),-R(checkedMoney(iraIncomeCents))]),taxable=R(checkedMoney(cityTaxableIncomeCents));if(claimedDependent)return {fixedCents:0,rateReductionCents:0};const fixedCents=income<=25000000?(key==='joint'?12500:6300):0,threshold={single:12000,joint:21600,head:14400}[key]*100,base={single:21,joint:37,head:25}[key]*100,rateReductionCents=taxable>50000000?0:taxable<=threshold?P(taxable,171,100000):base+P(taxable-threshold,228,100000);return {fixedCents,rateReductionCents};
}
export function nyMctmt(allocation,{year,filingStatus}){
 scope(year,filingStatus);const owners=filingStatus==='marriedJoint'?['taxpayer','spouse']:['taxpayer'];let zone1Cents=0,zone2Cents=0;for(const owner of owners){const one=R(checkedMoney(allocation[owner+'Zone1Cents'])),two=R(checkedMoney(allocation[owner+'Zone2Cents']));if(one>5000000)zone1Cents=sumMoney([zone1Cents,one]);if(two>5000000)zone2Cents=sumMoney([zone2Cents,two]);}const zone1TaxCents=P(zone1Cents,year===2023?47:60),zone2TaxCents=P(zone2Cents,34);return {zone1Cents,zone2Cents,zone1TaxCents,zone2TaxCents,totalCents:sumMoney([zone1TaxCents,zone2TaxCents])};
}
