import {nyEicFixture} from './state-ny-eic-fixtures.mjs';
import {newNYEmpireChildCredit,newNYEmpireChild,calculateNYEmpireChildCredit} from '../state-ny-child-credit.mjs';
import {calculateIndividual} from '../individual.mjs';
export function nyEmpireChildFixture({year=2025,children=1,wages=30000,joint=false,locality='none',...options}={}){
 const {input,state}=nyEicFixture({year,children,wages,joint,locality,...options}),source=newNYEmpireChildCredit();Object.assign(source,{filingStatus:'sameAsFederal',buildAmericaBondInterest:'none',magiExclusions:'none',otherCreditTreatments:'none',source:'Synthetic original Empire State household, identifier and federal worksheet review'});for(const key of Object.keys(source.review))source.review[key]=true;source.children=input.individual.dependents.map(row=>({...newNYEmpireChild(row.id),claim:'yes',competingClaim:'none',source:'Synthetic independent state child claim and uncontested original household sources',reviewed:true}));state.empireChildCredit=source;return {input,state,source};
}
export function computeNYEmpireFixture(fixture){const federal=calculateIndividual(fixture.input);return {federal,result:calculateNYEmpireChildCredit(fixture.input,fixture.state,federal,{federalAgiCents:federal.summary.adjustedGrossIncomeCents})};}
