import {newEarnedIncomeCredit} from '@shuug/tax-engine';

export function earnedIncomeCreditFields({document,parent,individual,field,group,button}){
 const section=group(parent,'Earned Income Credit source review');section.id='earned-income-credit-editor';
 const note=document.createElement('p');note.textContent='EIC is checked for every return, including returns without claimed dependents. These encrypted source facts can establish that no credit is allowed. A potential credit still requires the full annual EIC calculation before refund or balance due is known.';section.append(note);
 if(!individual.earnedIncomeCredit){button(section,'Add EIC source review',()=>{individual.earnedIncomeCredit=newEarnedIncomeCredit();});return;}
 const value=individual.earnedIncomeCredit;
 field(section,value,'qualifyingChildren','EIC qualifying children after reviewing relationship, age, U.S. residence, joint-return and competing-claim rules',{options:[['unknown','Not reviewed'],['none','Reviewed: no EIC qualifying children'],['present','One or more / additional EIC calculation required']]});
 field(section,value,'nontaxableCombatPayCents','Total nontaxable combat pay, both filers, from W-2 box 12 code Q (USD)',{money:true});
 field(section,value,'source','Original child-eligibility, earned-income and combat-pay sources',{multiline:true});
 field(section,value,'reviewed','EIC child facts reconciled independently of dependency claims, including children not claimed as dependents',{check:true});
 field(section,value,'earnedSourcesReviewed','All EIC earned income is represented by the recorded taxable wages and Schedule C net profit, less the deductible half of SE tax, plus the combat pay above. No unrepresented farm, partnership, optional SE method, community-property allocation, Medicaid-waiver election or other earned sources; recorded wages contain no EIC-excluded amounts',{check:true});
 button(section,'Remove EIC source review',()=>{delete individual.earnedIncomeCredit;});
}
