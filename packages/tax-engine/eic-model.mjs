import {strictObject,list,text} from './model.mjs';
import {checkedMoney} from './money.mjs';

export const eicDecisions=Object.freeze(['unknown','yes','no']);
export const eicClaimantReturns=Object.freeze(['unknown','notRequiredNoReturn','notRequiredRefundOnly','requiredOrOtherPurpose']);
export const eicHomeExceptions=Object.freeze(['unknown','none','temporaryAbsence','militaryExtendedDuty','other']);
export const eicScopeReviews=Object.freeze([
 ['earned','All earned income is represented ordinary wages/Schedule C; excluded wage amounts, optional methods and other earned sources are reconciled'],
 ['investment','All investment sources are represented interest, dividends and capital gains; no omitted special investment-income worksheet category'],
 ['foreign','Form 2555 and annual U.S. citizenship/residency sources reviewed'],
 ['disallowance','Original prior-disallowance records reviewed; no unresolved Form 8862 or 2-/10-year EIC ban'],
 ['children','All possible EIC children are recorded, including unclaimed and self-supporting children'],
 ['combat','Every nontaxable combat-pay source and owner is recorded and reconciled to W-2 code Q'],
].map(Object.freeze));
export const newEicPerson=()=>({citizenshipResidence:'unknown',usHomeDays:0,homeException:'unknown',qualifyingChildOfAnother:'unknown',qualifyingChildClaimantReturn:'unknown',dependencyClaimantReturn:'unknown',source:'',review:{residence:false,otherClaims:false}});
export const newEicChild=(dependentId='')=>({dependentId,claim:'unknown',maritalStatus:'unknown',usHomeMonths:0,competingClaim:'unknown',source:'',reviewed:false});
export const newEicCombatSource=(w2Id='',owner='taxpayer')=>({w2Id,owner,amountCents:0,source:'',reviewed:false});
export const newEicAward=()=>({
 persons:{taxpayer:newEicPerson(),spouse:newEicPerson()},
 marital:{status:'unknown',lastSixMonthsApart:'unknown',separatedUnderStateLaw:'unknown',livedApartAtYearEnd:'unknown',source:'',reviewed:false},
 children:[],combatSources:[],combatElections:{taxpayer:'unknown',spouse:'unknown'},
 scope:{earnedSources:'unknown',investmentSources:'unknown',form2555:'unknown',priorDisallowance:'unknown',source:'',review:Object.fromEntries(eicScopeReviews.map(([key])=>[key,false]))},
});
const choice=(value,allowed,label)=>{if(!allowed.includes(value))throw new Error(`${label} requires a supported source decision.`);};
const bool=(value,label)=>{if(typeof value!=='boolean')throw new Error(`${label} must be an explicit source review.`);};
const source=(value,label)=>text(value,label,1000);
export function validateEicAward(value){
 strictObject(value,Object.keys(newEicAward()),'EIC award source');strictObject(value.persons,['taxpayer','spouse'],'EIC persons');
 for(const owner of ['taxpayer','spouse']){const row=value.persons[owner];strictObject(row,Object.keys(newEicPerson()),'EIC person');choice(row.citizenshipResidence,['unknown','fullYearCitizenOrResident','other'],'EIC person citizenship/residency');if(!Number.isInteger(row.usHomeDays)||row.usHomeDays<0||row.usHomeDays>366)throw new Error('EIC residence requires actual whole days in the tax year.');choice(row.homeException,eicHomeExceptions,'EIC home exception');choice(row.qualifyingChildOfAnother,eicDecisions,'EIC qualifying-child status');for(const key of ['qualifyingChildClaimantReturn','dependencyClaimantReturn'])choice(row[key],eicClaimantReturns,'Other claimant return treatment');source(row.source,'EIC person source');strictObject(row.review,['residence','otherClaims'],'EIC person reviews');for(const item of Object.values(row.review))bool(item,'EIC person review');}
 strictObject(value.marital,Object.keys(newEicAward().marital),'EIC marital source');choice(value.marital.status,['unknown','unmarried','married','spouseDiedThisYear'],'EIC marital status');for(const key of ['lastSixMonthsApart','separatedUnderStateLaw','livedApartAtYearEnd'])choice(value.marital[key],eicDecisions,'EIC separation fact');source(value.marital.source,'EIC marital source');bool(value.marital.reviewed,'EIC marital review');
 const ids=new Set();for(const row of list(value.children,'EIC child sources',100)){strictObject(row,Object.keys(newEicChild()),'EIC child source');text(row.dependentId,'Linked dependent ID',100);if(!row.dependentId||ids.has(row.dependentId))throw new Error('Each EIC child source must link one distinct dependent record.');ids.add(row.dependentId);choice(row.claim,['unknown','taxpayer','otherPerson'],'EIC child claim');choice(row.maritalStatus??'unknown',['unknown','unmarried','married'],'EIC child marital status');choice(row.competingClaim,['unknown','none','otherClaimant','tieBreaker'],'EIC competing-claim treatment');if(!Number.isInteger(row.usHomeMonths)||row.usHomeMonths<0||row.usHomeMonths>12)throw new Error('EIC child months require a reviewed whole count from 0 to 12.');source(row.source,'EIC child source');bool(row.reviewed,'EIC child review');}
 const wages=new Set();for(const row of list(value.combatSources,'EIC combat sources',100)){strictObject(row,Object.keys(newEicCombatSource()),'EIC combat source');text(row.w2Id,'EIC linked W-2 ID',100);if(!row.w2Id||wages.has(row.w2Id))throw new Error('Each EIC combat source must link a distinct W-2.');wages.add(row.w2Id);choice(row.owner,['taxpayer','spouse'],'Combat-pay owner');checkedMoney(row.amountCents,'EIC combat pay');source(row.source,'EIC combat source');bool(row.reviewed,'EIC combat review');}
 strictObject(value.combatElections,['taxpayer','spouse'],'EIC combat elections');for(const item of Object.values(value.combatElections))choice(item,['unknown','include','exclude'],'EIC combat election');
 strictObject(value.scope,Object.keys(newEicAward().scope),'EIC award scope');choice(value.scope.earnedSources,['unknown','ordinaryWagesAndScheduleC','other'],'EIC earned-source scope');choice(value.scope.investmentSources,['unknown','ordinaryInterestDividendsCapital','other'],'EIC investment-source scope');choice(value.scope.form2555,eicDecisions,'Form 2555 source');choice(value.scope.priorDisallowance,['unknown','none','form8862Required','ban','other'],'EIC prior-disallowance treatment');source(value.scope.source,'EIC award scope source');strictObject(value.scope.review,eicScopeReviews.map(([key])=>key),'EIC scope reviews');for(const item of Object.values(value.scope.review))bool(item,'EIC scope review');return value;
}
