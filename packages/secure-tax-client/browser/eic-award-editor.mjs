import {newEicAward,newEicChild,newEicCombatSource,eicScopeReviews} from '@shuug/tax-engine';

const decisions=[['unknown','Not reviewed'],['yes','Yes'],['no','No']];
const claimantReturns=[['unknown','Not reviewed'],['notRequiredNoReturn','Not required to file and did not file'],['notRequiredRefundOnly','Not required to file; filed only to recover withholding or estimated tax'],['requiredOrOtherPurpose','Required to file, or filed for another purpose']];
function count(parent,row,key,label,maximum,{field,readers}){
 const value={text:String(row[key]??0)};field(parent,value,'text',label);readers.push(()=>{if(!/^\d+$/.test(value.text)||Number(value.text)>maximum)throw new Error(`${label}: enter a whole number from 0 to ${maximum}.`);row[key]=Number(value.text);});
}
export function eicAwardFields({document,parent,individual,year,field,group,button,readers}){
 const source=individual.earnedIncomeCredit,section=group(parent,'EIC eligibility and annual award');section.id='eic-award-editor';
 const note=document.createElement('p');note.textContent='Awards use the published 2023–2025 tables. 2026 and 2027 retain source facts while their final award materials remain unavailable. Eligibility for EIC is separate from claiming a dependent or child tax credit. Birth dates, identifier eligibility and child facts come from the existing source sections.';section.append(note);
 if(!source.award){button(section,'Add EIC award sources',()=>{source.award=newEicAward();});return;}
 const award=source.award,owners=['taxpayer',...(individual.filingStatus==='marriedJoint'?['spouse']:[])];
 for(const owner of owners){const person=award.persons[owner],row=group(section,owner==='taxpayer'?'Taxpayer EIC eligibility':'Spouse EIC eligibility');row.dataset.eicOwner=owner;
  field(row,person,'citizenshipResidence','Annual citizenship / resident-alien status',{options:[['unknown','Not reviewed'],['fullYearCitizenOrResident','U.S. citizen or resident alien throughout the tax year'],['other','Part-year, election or another treatment requiring review']]});
  count(row,person,'usHomeDays',`Days main home was in the United States during ${year}`,year%4===0?366:365,{field,readers});
  field(row,person,'homeException','Residence treatment',{options:[['unknown','Not reviewed'],['none','Ordinary residence'],['temporaryAbsence','Qualifying temporary absences counted'],['militaryExtendedDuty','Military extended active duty — separate review'],['other','Another residence exception']]});
  field(row,person,'qualifyingChildOfAnother','Could this filer be another person’s qualifying child for EIC?',{options:decisions});
  field(row,person,'qualifyingChildClaimantReturn','If a qualifying child of another person: that person’s return requirement and purpose',{options:claimantReturns});
  field(row,person,'dependencyClaimantReturn','If someone can claim this filer as a dependent: that person’s return requirement and purpose',{options:claimantReturns});
  field(row,person,'source','Original residence and other-person claim sources',{multiline:true});
  field(row,person.review,'residence','Annual main-home days, qualifying absences and citizenship/residence evidence reconciled',{check:true});
  field(row,person.review,'otherClaims','Other-person claim and return-purpose facts reconciled with the shared dependency facts',{check:true});
 }
 const marital=group(section,'Marital and separation facts');
 field(marital,award.marital,'status','Marital status for this tax year',{options:[['unknown','Not reviewed'],['unmarried','Unmarried at year end'],['married','Married at year end'],['spouseDiedThisYear','Spouse died during this year']]});
 field(marital,award.marital,'lastSixMonthsApart','Lived apart from spouse throughout the last six months',{options:decisions});
 field(marital,award.marital,'separatedUnderStateLaw','Legally separated under a qualifying written agreement or decree',{options:decisions});
 field(marital,award.marital,'livedApartAtYearEnd','Lived apart from spouse at year end',{options:decisions});
 field(marital,award.marital,'source','Original marital-status, separation and household sources',{multiline:true});field(marital,award.marital,'reviewed','Marital facts reconciled with filing status and original evidence',{check:true});
 const children=group(section,'Children considered for EIC');const childNote=document.createElement('p');childNote.textContent='Link every possible qualifying child from the federal person records, including children not claimed as dependents. Enter the reviewed Schedule EIC month count; do not divide days by 30. Use 7 when residence was more than half the year but less than 7 months. Exceptional residence and competing claims need separate review.';children.append(childNote);
 for(const [index,child]of award.children.entries()){if(child.maritalStatus===undefined)child.maritalStatus='unknown';const person=(individual.dependents??[]).find(row=>row.id===child.dependentId),row=group(children,person?`${person.firstName} ${person.lastName}`:'Unmatched child source');row.dataset.eicChild=child.dependentId;
  field(row,child,'claim','Who uses this child for EIC?',{options:[['unknown','Not reviewed'],['taxpayer','This return'],['otherPerson','Another person — separate review']]});
  field(row,child,'maritalStatus','Child’s marital status',{options:[['unknown','Not reviewed'],['unmarried','Unmarried'],['married','Married — dependency and any exception must be reviewed']]});
  count(row,child,'usHomeMonths','Reviewed months in the shared U.S. home for Schedule EIC',12,{field,readers});
  field(row,child,'competingClaim','Competing EIC claim treatment',{options:[['unknown','Not reviewed'],['none','No competing claim'],['otherClaimant','Another claimant — separate review'],['tieBreaker','Tie-breaker required']]});
  field(row,child,'source','EIC residence months, claim and supporting source reference',{multiline:true});field(row,child,'reviewed','EIC claim and calendar-month evidence reconciled with the linked person',{check:true});button(row,'Remove this EIC child link',()=>award.children.splice(index,1));
 }
 button(children,'Add missing federal person links for EIC review',()=>{for(const row of individual.dependents??[])if(!award.children.some(child=>child.dependentId===row.id))award.children.push(newEicChild(row.id));});
 const combat=group(section,'Nontaxable combat pay and elections');
 for(const [index,row]of award.combatSources.entries()){const wage=individual.w2s.find(value=>value.id===row.w2Id),item=group(combat,wage?`${wage.employer||'W-2'} — ${wage.owner}`:'Unmatched combat-pay W-2');field(item,row,'owner','Combat-pay recipient',{options:[['taxpayer','Taxpayer'],['spouse','Spouse']]});field(item,row,'amountCents','Original W-2 box 12 code Q amount (USD)',{money:true});field(item,row,'source','Original W-2 code Q source reference');field(item,row,'reviewed','Recipient and full code Q amount reconciled to the linked W-2',{check:true});button(item,'Remove this combat-pay source',()=>award.combatSources.splice(index,1));}
 button(combat,'Add missing W-2 combat-pay source rows',()=>{for(const row of individual.w2s)if(!award.combatSources.some(value=>value.w2Id===row.id))award.combatSources.push(newEicCombatSource(row.id,row.owner));});
 for(const owner of owners)field(combat,award.combatElections,owner,`${owner==='taxpayer'?'Taxpayer':'Spouse'} combat-pay election for EIC`,{options:[['unknown','Not chosen — calculate to compare amounts'],['include','Include all this filer’s combat pay'],['exclude','Exclude all this filer’s combat pay']]});
 const scope=group(section,'EIC source coverage and prior disallowance');
 field(scope,award.scope,'earnedSources','Earned-income source treatment',{options:[['unknown','Not reviewed'],['ordinaryWagesAndScheduleC','Only supported ordinary wages and Schedule C income'],['other','Additional or special earned-income treatment']]});
 field(scope,award.scope,'investmentSources','Investment-income source treatment',{options:[['unknown','Not reviewed'],['ordinaryInterestDividendsCapital','Only represented interest, dividends and ordinary capital gains'],['other','Additional investment worksheet treatment']]});
 field(scope,award.scope,'form2555','Form 2555 foreign earned-income exclusion applies',{options:decisions});
 field(scope,award.scope,'priorDisallowance','Earlier EIC disallowance',{options:[['unknown','Not reviewed'],['none','No prior disallowance or restriction'],['form8862Required','Form 8862 required'],['ban','Two-year or ten-year ban'],['other','Another restriction requiring review']]});
 field(scope,award.scope,'source','Original income, investment, residence and prior-disallowance sources',{multiline:true});for(const [key,label]of eicScopeReviews)field(scope,award.scope.review,key,label,{check:true});
 button(section,'Remove EIC award sources',()=>{delete source.award;});
}
