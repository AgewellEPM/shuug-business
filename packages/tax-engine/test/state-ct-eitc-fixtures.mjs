import {eicFixture} from './eic-fixtures.mjs';
import {newCTStateReturn} from '../state-returns.mjs';
import {newCTEarnedIncomeCredit,newCTEitcWage,newCTEitcBusiness} from '../state-ct-eitc.mjs';

// Explicit synthetic original-record reviews, never production defaults.
export function ctEitcFixture(options={}){
 const input=eicFixture(options),ct=newCTStateReturn();ct.town='Hartford';ct.townZip='06103';for(const key of Object.keys(ct.review))ct.review[key]=true;ct.useTax.reviewed=true;
 ct.earnedIncomeCredit=ctEitcSourceFixture(input);input.individual.stateReturns=[ct];return {input,ct};
}
export function ctEitcSourceFixture(input){
 const value=newCTEarnedIncomeCredit();Object.assign(value,{returnStatus:'original',filingStatus:'sameAsFederal',source:'Synthetic original Connecticut return and source reconciliation'});for(const key of Object.keys(value.review))value.review[key]=true;
 value.wageSources=input.individual.w2s.map((wage,index)=>({...newCTEitcWage(wage.id),employerFederalId:'00'+String(1122300+index),stateIdStatus:'notOnSource',source:'Synthetic original W-2 with no state identifier and no CT withholding',reviewed:true}));
 value.businessSources=input.individual.businesses.map(business=>({...newCTEitcBusiness(business.id),stateIdStatus:'notOnSource',source:'Synthetic original business source confirms no CT registration number',reviewed:true}));return value;
}
