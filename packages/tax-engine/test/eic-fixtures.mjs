import {childFixture} from './child-credits-fixtures.mjs';
import {newEicAward,newEicChild} from '../eic-model.mjs';
// Deliberately reviewed synthetic facts; never a production default or inferred
// taxpayer review. Uses actual retained identities and explicit source links.
export function eicAwardFixture(input){
 const award=newEicAward(),year=input.year,days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
 for(const owner of ['taxpayer','spouse'])Object.assign(award.persons[owner],{citizenshipResidence:'fullYearCitizenOrResident',usHomeDays:days,homeException:'none',qualifyingChildOfAnother:'no',source:'Synthetic EIC residence and other-claim source for '+owner,review:{residence:true,otherClaims:true}});
 Object.assign(award.marital,{status:input.individual.filingStatus==='marriedJoint'?'married':'unmarried',source:'Synthetic year-end marital source',reviewed:true});
 award.children=(input.individual.dependents??[]).map(row=>({...newEicChild(row.id),claim:'taxpayer',maritalStatus:'unmarried',usHomeMonths:12,competingClaim:'none',source:'Synthetic EIC child calendar residence, marital status and uncontested-claim source',reviewed:true}));
 Object.assign(award.scope,{earnedSources:'ordinaryWagesAndScheduleC',investmentSources:'ordinaryInterestDividendsCapital',form2555:'no',priorDisallowance:'none',source:'Synthetic original income, child-completeness, foreign, disallowance and combat source review'});for(const key of Object.keys(award.scope.review))award.scope.review[key]=true;
 return award;
}
export function eicFixture(options={}){
 const input=childFixture({year:2025,children:2,wages:33030,joint:true,...options});input.individual.earnedIncomeCredit.award=eicAwardFixture(input);return input;
}
