import {newCTRetirement,newCTRetirementDistribution,ctRetirementKinds} from '@shuug/tax-engine';

export function ctRetirementFields({document,parent,individual,value,field,group,button}){
 const section=group(parent,'Connecticut retirement worksheets');
 const note=text=>{const p=document.createElement('p');p.textContent=text;section.append(p);};
 note('Calculate Social Security and eligible IRA/pension subtractions from the federal retirement records. IRA percentages and pension income phase-outs follow the selected tax year. Classify employer pensions and choose each teacher recipient’s election. Manual retirement adjustments must match the calculated amounts exactly.');
 if(!value.retirement){button(section,'Connect federal retirement records',()=>{value.retirement=newCTRetirement();});return;}
 const retirement=value.retirement,rows=individual.retirementIncome?.distributions??[];
 for(const row of rows.filter(row=>!['traditionalIRA','rothIRA'].includes(row.plan))){
  const item=group(section,`${row.owner==='spouse'?'Spouse':'Taxpayer'} pension: ${row.payer||'Payer not entered'}`),classification=retirement.distributions.find(link=>link.distributionId===row.id);
  if(!classification){button(item,'Classify this federal pension',()=>retirement.distributions.push(newCTRetirementDistribution(row.id)));continue;}
  field(item,classification,'kind','Connecticut pension eligibility',{options:ctRetirementKinds});
  field(item,classification,'teacherElection','Connecticut teachers election',{options:[['unknown','Not applicable / not reviewed'],['pension','Annual pension subtraction and income limit'],['teacher50','50% teachers subtraction']]});
  field(item,classification,'source','Plan, eligibility and recipient source reference');field(item,classification,'reviewed','Eligibility verified; military pay excludes former-spouse divorce payments; teacher income is not deducted twice',{check:true});
  button(item,'Remove this pension classification',()=>retirement.distributions.splice(retirement.distributions.indexOf(classification),1));
 }
 for(const stale of retirement.distributions.filter(link=>!rows.some(row=>row.id===link.distributionId)||rows.some(row=>row.id===link.distributionId&&['traditionalIRA','rothIRA'].includes(row.plan)))){note(`Saved classification ${stale.distributionId} no longer matches an employer pension. Reconcile it before calculating.`);button(section,'Remove unmatched pension classification',()=>retirement.distributions.splice(retirement.distributions.indexOf(stale),1));}
 field(section,retirement,'source','Connecticut retirement worksheet/source reference');field(section,retirement,'reviewed','All federal retirement records, state eligibility and elections reviewed',{check:true});
 note('Railroad benefit allocations and unresolved federal pension methods require a separate reviewed worksheet. A qualifying surviving spouse’s pension subtraction remains unresolved because this pack has not established that treatment from the annual state worksheet.');
 button(section,'Use separately reviewed manual retirement adjustments',()=>{delete value.retirement;});
}
