import {eicFixture} from './eic-fixtures.mjs';
import {dependentFixture} from './child-credits-fixtures.mjs';
import {newNYStateReturn,newNYWageRecord,newNYDependent} from '../state-ny-model.mjs';
import {newNYEic,newNYEicChild,newNYEicOrder,calculateNYEic} from '../state-ny-eic.mjs';
import {calculateIndividual} from '../individual.mjs';
import {nyStateTax,nyStandardDeduction,nyHouseholdCredit} from '../state-ny-rates.mjs';
// Explicit reviewed synthetic originals for tests only. No production default.
export function nyEicFixture({locality='nyc',...options}={}){
 const input=eicFixture({children:0,wages:10000,joint:false,...options}),state=newNYStateReturn(),source=newNYEic();
 Object.assign(input.party,{street:'1 Synthetic Road',city:'Albany',state:'NY',zip:'12207'});
 Object.assign(state,{locality,claimedDependent:'no',taxpayerDob:input.individual.eligibility.taxpayer.dateOfBirth,spouseDob:input.individual.filingStatus==='marriedJoint'?input.individual.eligibility.spouse.dateOfBirth:'',county:'Albany',schoolDistrict:'Albany',schoolCode:'010',foreignAccount:'no',nycLivingQuarters:locality==='nyc'?'yes':'no',nycDays:locality==='nyc'?(input.year%4===0?366:365):0,yonkersLivingQuarters:'no',yonkersWork:'no'});
 for(const key of Object.keys(state.review))state.review[key]=true;state.useTax.reviewed=true;Object.assign(state.mctmt,{source:'Synthetic ordinary business district allocation',reviewed:true});
 state.dependents=input.individual.dependents.filter(row=>row.claim==='yes').map(row=>Object.fromEntries(Object.keys(newNYDependent()).map(key=>[key,row[key]])));
 state.wageRecords=input.individual.w2s.map(row=>({...newNYWageRecord(row.id),payerId:'000123400',street:'2 Employer Road',city:'Albany',state:'NY',zip:'12207',nyWagesCents:row.wagesCents,nycWagesCents:locality==='nyc'?row.wagesCents:0,source:'Synthetic original IT-2 and federal W-2 reconciliation',reviewed:true}));
 Object.assign(source,{filingStatus:'sameAsFederal',returnType:'original',worksheetBCredits:'none',source:'Synthetic NY EIC originals, actual federal worksheet and state credit sources'});for(const key of Object.keys(source.review))source.review[key]=true;
 Object.assign(source.noncustodial,{claimant:'taxpayer',source:'Synthetic complete child and support-order review; no omitted noncustodial children or orders',review:{children:true,orders:true}});
 state.earnedIncomeCredit=source;input.individual.stateReturns=[state];return {input,state,source};
}
export function nyNoncustodialFixture(options={}){
 const fixture=nyEicFixture({children:0,locality:'none',...options}),{input,state,source}=fixture,row=dependentFixture(input.year,90);
 Object.assign(row,{claim:'no',residencyDays:0,usResidencyDays:0});input.individual.dependents.push(row);
 source.noncustodial.children.push({...newNYEicChild(row.id),claimantRelationship:'biological',mainHome:'elsewhere',source:'Synthetic biological-parent and separate household originals',reviewed:true});
 source.noncustodial.orders.push({...newNYEicOrder(),id:'synthetic-support-order',childIds:[row.id],throughNYSCU:'yes',effectiveFrom:`${input.year}-01-01`,effectiveThrough:`${input.year}-12-31`,currentSupportDueCents:120000,currentSupportPaidCents:120000,source:'Synthetic complete NY SCU order and current obligation/payment ledger',reviewed:true});return fixture;
}
export function computeNYEicFixture(fixture){
 const {input,state}=fixture,federal=calculateIndividual(input),agi=federal.summary.adjustedGrossIncomeCents,status=input.individual.filingStatus,deduction=nyStandardDeduction({year:input.year,filingStatus:status,claimedDependent:false}),taxable=Math.max(0,agi-deduction-state.dependents.length*100000),context={nyAgiCents:agi,localityKnown:true,stateTaxBeforeCreditsCents:Number.isSafeInteger(agi)?nyStateTax(agi,taxable,{year:input.year,filingStatus:status}).taxCents:null,householdCreditCents:Number.isSafeInteger(agi)?nyHouseholdCredit(agi,{year:input.year,filingStatus:status,claimedDependent:false,dependents:state.dependents.length}):null};
 return {federal,context,result:calculateNYEic(input,state,federal,context)};
}
