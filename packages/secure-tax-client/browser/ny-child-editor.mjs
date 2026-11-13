import {newNYEmpireChildCredit,newNYEmpireChild,nyEmpireChildReviews} from '@shuug/tax-engine';

export function nyChildFields({document,parent,individual,value,year,field,group,button}){
 const section=group(parent,'Empire State child credit');section.id='ny-child-editor';
 const note=(parent,text)=>{const p=document.createElement('p');p.textContent=text;parent.append(p);};
 note(section,'Review every potential qualifying child against the retained person records. Names, birth dates, support, home, identifiers and source reviews come from federal person intake, including people who are not claimed as federal dependents.');
 if(year===2025)note(section,'The 2025 New York credit has its own child eligibility rules. The federal dependent claim and federal child-credit amount do not decide this credit.');
 if(year<=2024)note(section,'The annual New York worksheets recompute the older federal credit rules. They do not simply multiply the current federal child credit. Review the original federal income and credit sources below.');
 if(year>=2026)note(section,'This year’s New York annual credit pack is not installed. Retain the original sources for later annual review; no earlier year’s form is substituted.');
 if(!value.empireChildCredit){button(section,'Add Empire State child-credit review',()=>{value.empireChildCredit=newNYEmpireChildCredit();});return;}
 const source=value.empireChildCredit;
 field(section,source,'filingStatus','Federal and New York filing status',{options:[['unknown','Not yet reviewed'],['sameAsFederal','Same filing status'],['different','Different — separate allocation required']]});
 field(section,source,'source','Empire State child-credit source reference');
 for(const [key,label]of nyEmpireChildReviews){if(year===2025&&['federalCreditSources','foreignBondSources'].includes(key))continue;field(section,source.review,key,label,{check:true});}
 if(year!==2025){
  const scope=group(section,'Federal worksheet source review'),options=[['unknown','Not yet reviewed'],['none','Original records establish none'],['other','Present — additional source treatment required']];
  field(scope,source,'buildAmericaBondInterest','Build America Bond interest included in federal taxable interest',{options});
  field(scope,source,'magiExclusions','Puerto Rico, foreign earned income or possession exclusions',{options});
  field(scope,source,'otherCreditTreatments','Other federal credit treatments outside the recorded calculations',{options});
  note(scope,'Recorded federal income, child credits and supported energy credits supply the calculation. Reconcile additional adoption, mortgage-interest, DC homebuyer and other credit treatments before treating them as absent.');
 }
 const children=group(section,'New York child claims');children.id='ny-child-claims';
 note(children,'Link each potential child, including a retained unclaimed person. A missing or unreviewed link cannot establish that the credit is zero. Additional children are carried onto the original annual continuation forms.');
 for(const [position,row]of source.children.entries()){
  const item=group(children,`Child claim ${position+1}`);item.dataset.nyChildClaim=String(position);
  const options=[['','Choose a retained person'],...(individual.dependents??[]).map(person=>[person.id,`${person.firstName} ${person.lastName}`])];
  if(row.dependentId&&!options.some(([id])=>id===row.dependentId))options.push([row.dependentId,'Missing original person — reconcile retained link']);
  field(item,row,'dependentId','Retained person',{options});
  field(item,row,'claim','Claim this child for the New York credit',{options:[['unknown','Not yet decided'],['yes','Yes'],['no','No — reviewed exclusion or other claim required']]});
  field(item,row,'competingClaim','Other eligible claimants and New York claim priority',{options:[['unknown','Not yet reviewed'],['none','No competing claimant'],['otherPerson','Another person claims the child'],['tieBreaker','Competing claim — additional source treatment required']]});
  field(item,row,'source','Original New York child claim and priority source');
  field(item,row,'reviewed','Shared identity, state eligibility and claim-priority sources reviewed',{check:true});
  button(item,'Remove this New York child claim',()=>source.children.splice(position,1));
 }
 const next=(individual.dependents??[]).find(person=>!source.children.some(row=>row.dependentId===person.id));
 if(next)button(children,'Link another child for Empire State review',()=>source.children.push(newNYEmpireChild(next.id)));
 else if(!(individual.dependents??[]).length)note(children,'Add the person’s original identity and household facts in federal dependent intake first. Their federal claim can remain No while New York eligibility is reviewed.');
 button(section,'Remove Empire State child-credit review',()=>{delete value.empireChildCredit;});
}
