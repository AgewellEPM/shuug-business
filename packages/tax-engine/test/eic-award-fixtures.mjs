import {reviewed,wage,business} from './fixtures.mjs';
import {scheduleC} from '../schedule-c.mjs';
import {sumMoney,wholeRatio as P} from '../money.mjs';
// Synthetic source/eligibility scaffolding for isolated worksheet arithmetic.
// This does not claim to independently prove a real taxpayer's eligibility.
export function awardFixture({year=2025,filingStatus='single',wages=10000,spouseWages=0,agi,children=0,allChildren=children,profits=[],combat={taxpayer:0,spouse:0}}={}){
 const input=reviewed();input.year=year;input.individual.filingStatus=filingStatus;input.individual.w2s=[wage('taxpayer',wages),...(filingStatus==='marriedJoint'?[wage('spouse',spouseWages)]:[])];
 input.individual.businesses=profits.map(([owner,dollars],index)=>{const value=business(owner,Math.max(0,dollars));value.id+='-'+index;if(dollars<0)value.expenses=[{category:'other',amountCents:-dollars*100,description:'Synthetic business loss'}];return value;});
 input.individual.earnedIncomeCredit.award={combatElections:{taxpayer:'unknown',spouse:'unknown'}};
 const businesses=input.individual.businesses.map((value,index)=>scheduleC(value,index,year)),seByOwner=[];
 for(const owner of filingStatus==='marriedJoint'?['taxpayer','spouse']:['taxpayer']){const net=sumMoney(businesses.filter(row=>row.owner===owner).map(row=>row.profitCents));if(net<=0)continue;const earnings=P(net,9235),half=earnings>=40000?P(sumMoney([P(earnings,1240),P(earnings,290)]),5000):0;seByOwner.push({owner,netEarningsCents:earnings,halfTaxCents:half,incomeUnknown:false,lines:{'3':net,'4b':0,'5a':0,'13':half}});}
 const childrenRows=Array.from({length:allChildren},(_,i)=>({id:'synthetic-child-'+i})),context={eligibility:{known:true,eligible:true,creditChildren:childrenRows.slice(0,children),allQualifyingChildren:childrenRows,diagnostics:[],filerFacts:{combatKnown:true,combatByOwner:{taxpayer:combat.taxpayer*100,spouse:combat.spouse*100},earnedSourcesKnown:true,investmentSourcesKnown:true}},wageIncomeCents:(wages+spouseWages)*100,scheduleCProfitCents:sumMoney(businesses.map(row=>row.profitCents)),halfSeTaxCents:sumMoney(seByOwner.map(row=>row.halfTaxCents)),businesses,seByOwner,investmentIncomeCents:0,investmentKnown:true,otherTreatments:false};
 context.adjustedGrossIncomeCents=agi===undefined?sumMoney([context.wageIncomeCents,context.scheduleCProfitCents,-context.halfSeTaxCents]):agi*100;return {input,context};
}
