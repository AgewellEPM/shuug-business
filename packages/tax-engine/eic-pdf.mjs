import {displayMoney} from './money.mjs';
import {normalizedTaxId} from './taxpayer-identifiers.mjs';

// References verified against the original annual Form 1040 and Schedule EIC
// printed labels and widget geometry. Schedule EIC contains identity, not money.
export const eicMaps=Object.freeze({
 2023:{f1040:{'1i':'1/39','27':'2/16'},f1040sei:{}},
 2024:{f1040:{'1i':'1/40','27':'2/16'},f1040sei:{}},
 2025:{f1040:{'1i':'1/56','27a':'2/23'},f1040sei:{}},
});
const relationshipNames={child:'child',adoptedChild:'adopted child',stepchild:'stepchild',fosterChild:'eligible foster child',grandchild:'grandchild',sibling:'sibling',nieceNephew:'niece/nephew'};
const check=(set,page,name)=>set.checkbox(`topmostSubform[0].Page${page}[0].${name}`);
// The complete annual flow may stop before an eligibility-only denial (for
// example, AGI before SSN). Its explicit false must override that later flag.
const noCreditIndicator=result=>result?.amountCents===0&&(result.noCreditIndicator===undefined?result.eligibility?.filerFacts?.noCreditIndicator===true:result.noCreditIndicator===true);
function childCheck(year,line,index,yes){
 const number=(line==='4a'?1:4)+index+(year<2025?1:0),stem=`Line${line}_Child${index+1}`;
 return index<2?`${stem}_ReadOrder[0].${yes?'Yes_ReadOrder[0].':''}c1_${number}[0]`:`${yes?`${stem}_Yes_ReadOrder[0].`:''}c1_${number}[0]`;
}
export function eicIdentity(input,item,set){
 if(!eicMaps[input.year]||!['f1040','f1040sei'].includes(item.form))return false;
 const result=item.earnedIncomeCredit,eligibility=result?.eligibility,facts=eligibility?.filerFacts;
 if(item.form==='f1040'){
  if(input.year===2025){
   if(facts?.mainHomeUS===true)check(set,1,'c1_5[0]');
   if(facts?.separatedSpouse===true)check(set,1,'c1_32[0]');
   if(noCreditIndicator(result))check(set,2,'c2_13[0]');
  }
  return false;
 }
 if(!eligibility?.known||eligibility.eligible!==true||!(result.amountCents>0))throw new Error('Schedule EIC requires a known eligible positive award.');
 const children=eligibility.attachmentChildren;
 if(!Array.isArray(children)||children.length<1||children.length>3)throw new Error('Review the Schedule EIC attachment child selection.');
 set('1/1',input.individual.filingStatus==='marriedJoint'?[input.party.name,input.individual.spouseName].filter(Boolean).join(' & '):input.party.name);set('1/2',normalizedTaxId(input.party.taxId));
 if(input.year<2025&&facts?.separatedSpouse===true)check(set,1,'c1_1[0]');
 for(const [index,row]of children.entries()){
  if(!Number.isInteger(row.usHomeMonths)||row.usHomeMonths<7||row.usHomeMonths>12)throw new Error('Schedule EIC requires reviewed calendar months; residence days cannot be converted to months.');
  const birthYear=row.dateOfBirth?.slice(0,4);if(!/^\d{4}$/.test(birthYear))throw new Error('Review the Schedule EIC birth year.');
  set(`1/${3+index}`,[row.firstName,row.middleInitial,row.lastName].filter(Boolean).join(' '),`child${index+1}:name`);
  // The self-only EIC instructions retain an ITIN/ATIN/nonvalid SSN if present;
  // they require a blank when no identifier exists, not an invented number.
  set(`1/${6+index}`,normalizedTaxId(row.taxId??''),`child${index+1}:identifier`);
  [...birthYear].forEach((digit,place)=>set(`1/${9+index*4+place}`,digit,`child${index+1}:birthYear`));
  if(!(row.age<19&&row.younger===true)){
   if(typeof row.studentYounger==='boolean')check(set,1,childCheck(input.year,'4a',index,row.studentYounger));
   if(row.studentYounger!==true){if(row.disabled!==true)throw new Error('Review the Schedule EIC age/student/disability branch.');check(set,1,childCheck(input.year,'4b',index,true));}
  }
  set(`1/${21+index}`,relationshipNames[row.relationship]??row.relationship,`child${index+1}:relationship`);
  set(`1/${24+index}`,String(row.usHomeMonths),`child${index+1}:months`);
 }
 return true;
}

// The 2023/2024 instructions use a written "No" beside line 27 for specified
// denial/worksheet-stop branches. Other zero proofs do not imply this marker.
export function eicAnnotations(input,item,{pdf,font,audit}){
 const result=item.earnedIncomeCredit;
 if(item.form!=='f1040'||![2023,2024].includes(input.year)||!noCreditIndicator(result))return;
 const annotation={annotation:'eic-no-credit',text:'No',page:2,x:350,y:566};
 pdf.getPage(1).drawText(annotation.text,{x:annotation.x,y:annotation.y,size:8,font});audit.push(annotation);
}

export function eicWorkpaper(input,result,line){
 const eic=result.earnedIncomeCredit,source=input.individual?.earnedIncomeCredit?.award;if(!source&&!eic?.eligibility&&!eic?.worksheet&&!eic?.electionCandidates?.length)return;
 line('Earned Income Credit eligibility and annual worksheet',13);
 line('Schedule EIC is limited to reviewed qualifying-child facts. Calendar months are entered from source records; residence days are not divided by 30. A calculated credit does not establish paid-preparer due diligence, filing acceptance or required Form 8862 completion.');
 if(source){
  for(const owner of input.individual.filingStatus==='marriedJoint'?['taxpayer','spouse']:['taxpayer']){const person=source.persons[owner];line(`${owner}: citizenship/residence ${person.citizenshipResidence}; U.S. home days ${person.usHomeDays}; exception ${person.homeException}; another person's qualifying child ${person.qualifyingChildOfAnother}; claimant return ${person.qualifyingChildClaimantReturn}; dependency claimant return ${person.dependencyClaimantReturn}; source ${person.source}; residence review ${person.review.residence}; other-claim review ${person.review.otherClaims}.`);}
  line(`Year-end marriage ${source.marital.status}; last six months apart ${source.marital.lastSixMonthsApart}; state-law separation ${source.marital.separatedUnderStateLaw}; apart at year end ${source.marital.livedApartAtYearEnd}; source ${source.marital.source}; reviewed ${source.marital.reviewed}.`);
  for(const row of source.children)line(`Retained EIC child source ${row.dependentId}: claimant ${row.claim}; competing claim ${row.competingClaim}; entered U.S. home months ${row.usHomeMonths}; reviewed ${row.reviewed}; source ${row.source}.`);
  for(const row of source.combatSources)line(`Combat source ${row.owner}, W-2 ${row.w2Id}: ${displayMoney(row.amountCents)} USD; reviewed ${row.reviewed}; source ${row.source}.`);
  line(`Source scope: earned ${source.scope.earnedSources}; investment ${source.scope.investmentSources}; Form 2555 ${source.scope.form2555}; prior disallowance ${source.scope.priorDisallowance}; source ${source.scope.source}.`);for(const [key,value]of Object.entries(source.scope.review))line(`EIC scope ${key}: ${value?'reviewed':'unreviewed'}.`);
 }
 const eligibility=eic?.eligibility;
 if(eligibility){
  line(`Eligibility: ${eligibility.known?String(eligibility.eligible):'unresolved'}; qualifying children ${(eligibility.allQualifyingChildren??[]).length}; valid-SSN amount children ${(eligibility.creditChildren??[]).length}.`);
  for(const row of eligibility.allQualifyingChildren??[]){line(`${row.firstName} ${row.middleInitial??''} ${row.lastName}; source ID ${row.id}; DOB ${row.dateOfBirth}; relationship ${row.relationship}; valid EIC SSN ${row.ssnEligible}; reviewed U.S. home months ${row.usHomeMonths??'unresolved'}; source ${row.source??'not entered'}; EIC source ${row.eicSource??'not entered'}.`);if(row.studentYounger===null)line(`Child ${row.id}: Schedule EIC line 4a student/younger comparison remains unresolved and is left blank; the affirmative disability source independently supports line 4b.`);}
  line('Schedule EIC child order: '+(eligibility.attachmentChildren??[]).map(row=>row.id).join(', ')+'.');
 }
 for(const candidate of eic?.electionCandidates??[])line(`Combat election ${JSON.stringify(candidate.elections??{})}: included combat ${displayMoney(candidate.combatPayCents)} USD; EIC ${displayMoney(candidate.amountCents)} USD.`);
 if(eic?.selectedElection)line(`Saved combat election ${JSON.stringify(eic.selectedElection.elections??{})}; selected combat ${displayMoney(eic.selectedElection.combatPayCents)} USD.`);
 if(eic?.worksheet){
  line(`Annual EIC worksheet ${eic.worksheet.kind??''}`,12);for(const [key,value]of Object.entries(eic.worksheet.lines??{}))line(`EIC worksheet ${key}: ${displayMoney(value)} USD.`);
  for(const key of ['earnedLookup','agiLookup']){const lookup=eic.worksheet[key];if(lookup)line(`${key}: income ${displayMoney(lookup.incomeCents)} USD; published table interval [${displayMoney(lookup.interval?.[0])}, ${displayMoney(lookup.interval?.[1])}) USD; column ${lookup.column}; credit ${displayMoney(lookup.creditCents)} USD; terminal footnote ${lookup.terminalFootnote??'none'}.`);}
  line(`AGI comparison: ${eic.worksheet.agiComparison}; comparison threshold ${displayMoney(eic.worksheet.comparisonThresholdCents)} USD; stop ${eic.worksheet.stop??'none'}.`);
 }
}
