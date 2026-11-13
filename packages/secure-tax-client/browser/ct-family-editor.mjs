import {newCTDependentDisclosure,newCTEarnedIncomeCredit,newCTEitcWage,newCTEitcBusiness,ctEitcReviews} from '@shuug/tax-engine';

export function ctFamilyFields({document,parent,individual,value,year,field,group,button}){
 const note=(parent,text)=>{const p=document.createElement('p');p.textContent=text;parent.append(p);};
 const disclosure=group(parent,'Connecticut dependent disclosure');disclosure.id='ct-dependent-editor';
 note(disclosure,'Schedule CT-Dependent uses the claimed federal dependents, their birth dates and Connecticut relationship codes. Update identities and claims in the federal dependent section; those changes flow here.');
 if(value.dependentDisclosure){
  field(disclosure,value.dependentDisclosure,'source','Dependent disclosure source reference');
  field(disclosure,value.dependentDisclosure,'reviewed','Federal dependent list and Connecticut relationship disclosures reconciled',{check:true});
  for(const row of individual.dependents??[])if(row.claim!=='no')note(disclosure,`${row.firstName} ${row.lastName}: ${row.claim==='yes'?'claimed':'claim unresolved'}; ${row.relationship}.`);
  button(disclosure,'Remove Connecticut dependent disclosure review',()=>{delete value.dependentDisclosure;});
 }else button(disclosure,'Review Connecticut dependent disclosure',()=>{value.dependentDisclosure=newCTDependentDisclosure();});
 const section=group(parent,'Connecticut earned income tax credit');section.id='ct-eitc-editor';
 note(section,'The credit uses the computed federal EIC and its saved combat-pay election. Review the original state return and link every federal wage and business source. Amounts and qualifying children are derived from those records.');
 if(year===2025)note(section,'The annual qualifying-child supplement is calculated only when its eligibility is established. Unresolved child identifiers or a zero federal table amount can leave the Connecticut credit pending.');
 if(year>=2026)note(section,'This year’s Connecticut schedule and calculation pack are not installed. Source details can be retained for later review.');
 if(!value.earnedIncomeCredit){button(section,'Add Connecticut EITC source review',()=>{value.earnedIncomeCredit=newCTEarnedIncomeCredit();});return;}
 const eic=value.earnedIncomeCredit;
 field(section,eic,'returnStatus','Connecticut return status',{options:[['unknown','Not yet reviewed'],['original','Original return — not previously filed'],['alreadyFiled','Already filed — amended return required']]});
 field(section,eic,'filingStatus','Federal and Connecticut filing status',{options:[['unknown','Not yet reviewed'],['sameAsFederal','Same filing status'],['different','Different — allocation treatment required']]});
 field(section,eic,'source','Connecticut EITC source reference');
 for(const [key,label]of ctEitcReviews)field(section,eic.review,key,label,{check:true});
 const idOptions=[['unknown','Not yet reviewed'],['provided','Identifier appears on source'],['notOnSource','Source reviewed; no state identifier']];
 const wages=group(section,'Original wage sources');
 note(wages,'Federal wages and owners come from each linked W-2. Positive Connecticut withholding must reconcile to a state withholding statement with the same employer EIN, wages and withholding.');
 for(const [position,row]of eic.wageSources.entries()){
  const item=group(wages,`EITC wage source ${position+1}`),wage=individual.w2s.find(wage=>wage.id===row.w2Id);
  const options=individual.w2s.map(wage=>[wage.id,`${wage.employer||'Employer'} — ${wage.owner}`]);if(!wage&&row.w2Id)options.push([row.w2Id,'Missing original W-2 — reconcile retained link']);
  field(item,row,'w2Id','Original federal W-2',{options});field(item,row,'employerFederalId','Employer federal EIN (hidden)',{privateId:true});field(item,row,'stateIdStatus','State identifier source status',{options:idOptions});field(item,row,'employerStateId','Employer state identifier (hidden)',{privateId:true});field(item,row,'ctWithholdingCents','Connecticut withholding on this W-2 (USD)',{money:true});field(item,row,'source','W-2 source reference');field(item,row,'reviewed','Employer identifiers and withholding reconciled',{check:true});button(item,'Remove this EITC wage link',()=>eic.wageSources.splice(position,1));
 }
 const nextWage=individual.w2s.find(wage=>!eic.wageSources.some(row=>row.w2Id===wage.id));if(nextWage)button(wages,'Link another EITC wage source',()=>eic.wageSources.push(newCTEitcWage(nextWage.id)));
 const businesses=group(section,'Original business sources');
 note(businesses,'Business income, owner and federal identifier come from the linked Schedule C source. Enter the Connecticut registration identifier as it appears on the original record.');
 for(const [position,row]of eic.businessSources.entries()){
  const item=group(businesses,`EITC business source ${position+1}`),options=individual.businesses.map(business=>[business.id,`${business.name||'Business'} — ${business.owner}`]);if(!individual.businesses.some(business=>business.id===row.businessId)&&row.businessId)options.push([row.businessId,'Missing original business — reconcile retained link']);
  field(item,row,'businessId','Original federal Schedule C business',{options});field(item,row,'stateIdStatus','State registration source status',{options:idOptions});field(item,row,'ctTaxRegistrationNumber','Connecticut tax registration number (hidden)',{privateId:true});field(item,row,'source','Business registration source reference');field(item,row,'reviewed','Business registration and original Schedule C reconciled',{check:true});button(item,'Remove this EITC business link',()=>eic.businessSources.splice(position,1));
 }
 const nextBusiness=individual.businesses.find(business=>!eic.businessSources.some(row=>row.businessId===business.id));if(nextBusiness)button(businesses,'Link another EITC business source',()=>eic.businessSources.push(newCTEitcBusiness(nextBusiness.id)));
 button(section,'Remove Connecticut EITC source review',()=>{delete value.earnedIncomeCredit;});
}
