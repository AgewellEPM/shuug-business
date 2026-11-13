import {strictObject,list,text,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney} from './money.mjs';
import {newDependent,dependentReviews,dependentRelationships} from './dependents-model.mjs';
import {calculateDependents,dependentAge,validDependentDate,dependentRelationshipGroup} from './dependents.mjs';
import {normalizedTaxId,taxpayerIdentifierStatus,validateTaxpayerIdentifier} from './taxpayer-identifiers.mjs';
import {validateEicAward} from './eic-model.mjs';

const childRelationships=['child','adoptedChild','stepchild','fosterChild','grandchild','sibling','nieceNephew'];
const ordinaryHome=['none','temporaryAbsence'];
const sourced=value=>Boolean(value?.source?.trim());
const reviewedPerson=value=>Boolean(value?.reviewed&&sourced(value));
const normalizeName=value=>String(value??'').trim().replace(/\s+/g,' ').toUpperCase();
const daysInYear=year=>(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
function birthAnniversary(dob,age){const date=new Date(dob+'T00:00:00Z');date.setUTCFullYear(date.getUTCFullYear()+age);return date;}

/** Pub596 Rule11: age25 is attained the day before the birthday, age65 on
 * the birthday; decedents are tested at death. This differs from the ordinary
 * standard deduction and qualifying-child age rules. */
export function eicFilerAge(person,year){
 const diagnostics=[],need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));};
 need(reviewedPerson(person),'EIC_FILER_AGE_SOURCE','Review the shared filer birth and death source before applying the childless EIC age test.');
 need(validDependentDate(person?.dateOfBirth,year),'EIC_FILER_BIRTH_REQUIRED','A valid shared filer birth date is required for the childless EIC age test.');
 need(['yes','no'].includes(person?.deceased),'EIC_FILER_DEATH_REQUIRED','Review whether the filer died during the tax year.');
 if(person?.deceased==='yes')need(validDependentDate(person.dateOfDeath,year)&&person.dateOfDeath.startsWith(String(year))&&person.dateOfDeath>=person.dateOfBirth,'EIC_FILER_DEATH_DATE','A valid death date in this tax year is required for a deceased filer.');
 else if(person?.dateOfDeath)need(false,'EIC_FILER_DEATH_CONFLICT','The retained death date conflicts with the living-status source.');
 if(diagnostics.length)return {known:false,eligible:null,asOf:null,attained25Date:null,attained65Date:null,diagnostics};
 const age25=birthAnniversary(person.dateOfBirth,25);age25.setUTCDate(age25.getUTCDate()-1);const attained25Date=age25.toISOString().slice(0,10),attained65Date=birthAnniversary(person.dateOfBirth,65).toISOString().slice(0,10),asOf=person.deceased==='yes'?person.dateOfDeath:`${year}-12-31`;
 return {known:true,eligible:attained25Date<=asOf&&attained65Date>asOf,asOf,attained25Date,attained65Date,diagnostics};
}

function validateChildren(input){
 const rows=list(input.individual.dependents??[],'EIC retained dependent records',100),ids=new Set(),taxIds=new Set([input.party.taxId,input.individual.spouseTaxId].filter(Boolean).map(normalizedTaxId)),days=daysInYear(input.year);
 for(const row of rows){
  strictObject(row,Object.keys(newDependent()),'EIC retained dependent');for(const key of ['id','firstName','middleInitial','lastName','taxId','dateOfBirth','source'])text(row[key],'EIC retained child '+key,key==='source'?500:100);
  if(!row.id||ids.has(row.id))throw new Error('EIC children need unique stable source IDs.');ids.add(row.id);const taxId=normalizedTaxId(row.taxId);if(taxId&&taxIds.has(taxId))throw new Error('EIC child identifier repeats another person or filer.');if(taxId)taxIds.add(taxId);
  if(!dependentRelationships.some(([key])=>key===row.relationship))throw new Error('EIC relationship must retain a supported source classification.');
  for(const key of ['residencyDays','usResidencyDays'])if(!Number.isInteger(row[key])||row[key]<0||row[key]>days)throw new Error('EIC retained child residence days must be within the actual tax year.');
  if(row.usResidencyDays>row.residencyDays||!Number.isInteger(row.studentMonths)||row.studentMonths<0||row.studentMonths>12)throw new Error('EIC retained residence or school counts are inconsistent.');
  strictObject(row.review,dependentReviews.map(([key])=>key),'Retained dependent reviews');for(const value of Object.values(row.review))if(typeof value!=='boolean')throw new Error('Retained dependent source reviews must be explicit.');validateTaxpayerIdentifier(row.identifier,{dependent:true});
  if(!['unknown','yes','no'].includes(row.permanentlyDisabled)||!['unknown','no','refundOnly','yes'].includes(row.jointReturn)||!['none','temporaryAbsence','bornOrDied','adoptionPlacement','divorcedParents','other'].includes(row.residencyException)||!['unknown','none','tieBreaker','custodialRelease','other'].includes(row.competingClaim)||!['unknown','yes','no'].includes(row.qualifyingChildOfAnother))throw new Error('EIC retained child facts contain an unsupported decision.');
 }
 return rows;
}
function childSsn(row){
 // A reviewed absence of timely issuance can be established even if no number
 // exists yet. Missing source/review is never this affirmative negative fact.
 if(reviewedPerson(row.identifier)&&row.identifier.issuedByDueDate==='no')return {known:true,employmentSsn:false,diagnostics:[]};
 return taxpayerIdentifierStatus(row.identifier,'dependent',{taxId:row.taxId,dependent:true});
}
function parentAgeSources(input,owners){return owners.map(owner=>{
 const person=input.individual.eligibility?.[owner],dob=person?.dateOfBirth,retained=(input.individual.stateReturns??[]).filter(row=>row.state==='NY').map(row=>row[owner==='taxpayer'?'taxpayerDob':'spouseDob']).filter(Boolean);
 return {known:reviewedPerson(person)&&validDependentDate(dob,input.year),dob,retained};
});}
function classifyChild(input,row,fact,owners,unknown){
 const source=sourced(row),review=row.review,age=dependentAge(row.dateOfBirth,input.year),half=daysInYear(input.year)/2;
 // A positively sourced failed relationship/residence/joint-return/age test
 // can exclude an ordinary retained candidate without inventing other facts.
 if(source&&review.relationship&&row.relationship!=='other'&&!childRelationships.includes(row.relationship))return null;
 if(source&&review.jointReturn&&row.jointReturn==='yes')return null;
 if(source&&review.identity&&age!==null&&review.studentDisability&&row.permanentlyDisabled==='no'&&(age>=24||age>=19&&row.studentMonths<5))return null;
 if(source&&review.residency&&ordinaryHome.includes(row.residencyException)&&row.usResidencyDays<=half){
  unknown.need(!(fact?.reviewed&&sourced(fact)&&fact.usHomeMonths>=7),'EIC_CHILD_RESIDENCE_CONFLICT','Reviewed Schedule EIC residence of seven or more months conflicts with retained child U.S.-home days of no more than half the year. Reconcile both sources before selecting the childless branch.');
  return null;
 }
 const before=unknown.count;
 unknown.need(source,'EIC_CHILD_SOURCE','Retain original identity, relationship and residence evidence for every possible EIC child.');
 for(const key of ['identity','relationship','residency','studentDisability','jointReturn','competingClaims'])unknown.need(review[key],'EIC_CHILD_REVIEW_'+key.toUpperCase(),'Review the retained child '+key+' source facts for EIC; dependent support and claim choices are separate.');
 unknown.need(row.firstName.trim()&&row.lastName.trim()&&age!==null,'EIC_CHILD_IDENTITY','Each EIC child needs a sourced name and actual birth date.');
 if(validDependentDate(row.dateOfBirth,input.year)&&row.dateOfBirth.startsWith(String(input.year))){const aliveDays=(Date.UTC(input.year+1,0,1)-Date.parse(row.dateOfBirth+'T00:00:00Z'))/86400000;unknown.need(row.residencyDays<=aliveDays,'EIC_CHILD_BIRTH_RESIDENCY_CONFLICT','Recorded child residence days exceed the days since the retained birth date.');}
 unknown.need(row.relationship!=='other','EIC_CHILD_RELATIONSHIP','Classify the actual EIC child relationship; the other-relationship exception remains unresolved.');
 unknown.need(['yes','no'].includes(row.permanentlyDisabled),'EIC_CHILD_DISABILITY','Resolve permanent total disability and actual full-time student months.');
 unknown.need(['no','refundOnly','yes'].includes(row.jointReturn),'EIC_CHILD_JOINT_RETURN','Resolve whether any child joint return is only for withheld/estimated-tax refund.');
 unknown.need(ordinaryHome.includes(row.residencyException),'EIC_CHILD_RESIDENCY_EXCEPTION','Birth/death, placement, custody and other exceptional EIC residence need separate source treatment.');
 const parents=parentAgeSources(input,owners),validOlder=parents.some(parent=>parent.known&&[parent.dob,...parent.retained].every(dob=>validDependentDate(dob,input.year)&&dob<row.dateOfBirth)),allKnown=parents.every(parent=>parent.known&&parent.retained.every(dob=>validDependentDate(dob,input.year)&&(dob<row.dateOfBirth)===(parent.dob<row.dateOfBirth))),younger=validOlder?true:allKnown?false:null;
 const disabled=row.permanentlyDisabled==='yes';if(!disabled)unknown.need(younger!==null,'EIC_CHILD_PARENT_AGE','Resolve the relevant shared filer/spouse birth sources, including retained state conflicts, before testing whether the child is younger.');
 const under19Younger=age!==null&&age<19?younger:false,studentYounger=age!==null&&age<24&&row.studentMonths>=5?younger:false,qualifies=childRelationships.includes(row.relationship)&&(under19Younger===true||studentYounger===true||disabled)&&row.usResidencyDays>half&&['no','refundOnly'].includes(row.jointReturn);
 if(unknown.count!==before)return null;if(!qualifies)return null;
 unknown.need(Boolean(fact?.reviewed&&sourced(fact)),'EIC_CHILD_AWARD_SOURCE','Add and review this qualifying child’s separate EIC source, claim treatment and actual calendar-month evidence.');
 unknown.need(['unmarried','married'].includes(fact?.maritalStatus),'EIC_CHILD_MARITAL_SOURCE','Review whether this possible EIC child was married at year end; joint-return treatment alone does not establish marital status.');
 if(fact?.maritalStatus==='unmarried')unknown.need(row.jointReturn!=='refundOnly','EIC_CHILD_MARITAL_CONFLICT','An unmarried-child answer conflicts with a retained joint refund-only return. Reconcile the original marital and return facts.');
 if(fact?.maritalStatus==='married'){
  const dependent=calculateDependents(input).records.find(record=>record.id===row.id);
  unknown.need(dependent?.known&&dependent.eligible===true,'EIC_MARRIED_CHILD_DEPENDENCY','A married EIC child must be claimable as a dependent. Complete the ordinary dependency source calculation; unclaimed married children and the divorced-parent exception require separate source treatment.');
 }
 unknown.need(fact?.claim==='taxpayer'&&fact?.competingClaim==='none'&&row.competingClaim==='none'&&row.qualifyingChildOfAnother==='no','EIC_CHILD_COMPETING_CLAIM','Only a sourced ordinary uncontested EIC child claim is supported. Other claimants, tiebreakers and custodial releases remain unresolved and are not converted to childlessness.');
 unknown.need(Number.isInteger(fact?.usHomeMonths)&&fact.usHomeMonths>=7&&fact.usHomeMonths<=12&&row.usResidencyDays<=fact.usHomeMonths*31&&(row.usResidencyDays!==daysInYear(input.year)||fact.usHomeMonths===12),'EIC_CHILD_MONTH_SOURCE','Enter the actual reviewed Schedule EIC month count. More than half a year but less than seven months prints seven; retained full-year days must reconcile with twelve months.');
 const identifier=childSsn(row);unknown.need(identifier.employmentSsn!==null,'EIC_CHILD_SSN_SOURCE','Resolve whether the child held a timely employment-valid SSN; missing issuance evidence does not establish the self-only credit.');
 if(unknown.count!==before)return null;
 return {...row,age,younger,under19Younger,studentYounger,under24StudentAndYounger:studentYounger,disabled,ssnEligible:identifier.employmentSsn,usHomeMonths:fact.usHomeMonths,months:fact.usHomeMonths,eicSource:fact.source};
}

function combatFacts(input,award,owners,unknown){
 const before=unknown.count,scope=award.scope,wages=input.individual.w2s??[],totals={taxpayer:0,spouse:0},retained=input.individual.earnedIncomeCredit;
 unknown.need(sourced(scope)&&scope.review.combat,'EIC_COMBAT_REVIEW','Review every original nontaxable combat-pay source, including a sourced absence of combat pay.');
 for(const row of award.combatSources){
  const wage=wages.find(value=>value.id===row.w2Id);unknown.need(row.reviewed&&sourced(row)&&wage&&wage.owner===row.owner&&owners.includes(row.owner),'EIC_COMBAT_W2_SOURCE','Each combat-pay amount must match its retained W-2, actual filing owner and reviewed code Q source.');
  totals[row.owner]=sumMoney([totals[row.owner],row.amountCents]);
 }
 const total=sumMoney(Object.values(totals));
 if(retained){checkedMoney(retained.nontaxableCombatPayCents,'Retained EIC combat pay');unknown.need(total===retained.nontaxableCombatPayCents,'EIC_COMBAT_AGGREGATE_CONFLICT','Owner-specific combat sources differ from the retained EIC aggregate. Reconcile both sources.');}
 if(input.individual.childCredits!==undefined)unknown.need(total===input.individual.childCredits.nontaxableCombatPayCents,'EIC_COMBAT_CHILD_CREDIT_CONFLICT','Owner-specific EIC combat sources differ from retained child-credit combat pay.');
 for(const state of input.individual.stateReturns??[]){if(state.state!=='NY')continue;
  for(const wage of state.wageRecords??[]){const rows=(wage.box12??[]).filter(row=>String(row.code).toUpperCase()==='Q');if(!rows.length)continue;const q=sumMoney(rows.map(row=>checkedMoney(row.amountCents,'NY W-2 code Q'))),match=award.combatSources.find(row=>row.w2Id===wage.w2Id);
   unknown.need(match&&match.amountCents===q&&match.owner===(wages.find(row=>row.id===wage.w2Id)?.owner),'EIC_COMBAT_NY_W2_CONFLICT','Combat sources must reconcile each retained New York W-2 code Q amount and owner, not only the aggregate.');
  }
 }
 return {known:before===unknown.count,totals};
}

// Annual Form 1040 instructions use an ordered flowchart. A later failure
// cannot add a No/27c marker after an earlier stopping question omitted it.
// AGI (Step 1 question 1) and investment income (Step 2) belong to the award
// orchestration; these source-derived stops retain their original positions.
function firstEligibilityStop(denialReasons,hasChild){
 const stops=[['EIC_FILER_SSN_INELIGIBLE',1,2,true],['EIC_FORM2555_INELIGIBLE',1,3,false],...(hasChild?
  [['EIC_SEPARATED_SPOUSE_INELIGIBLE',3,5,false],['EIC_FILER_QUALIFYING_CHILD_INELIGIBLE',3,6,true]]:
  [['EIC_MARRIED_NO_CHILD_INELIGIBLE',4,1,false],['EIC_FILER_AGE_INELIGIBLE',4,2,false],['EIC_FILER_HOME_INELIGIBLE',4,3,true],['EIC_FILER_QUALIFYING_CHILD_INELIGIBLE',4,5,true],['EIC_FILER_DEPENDENT_INELIGIBLE',4,6,false]])];
 const first=stops.find(([reason])=>denialReasons.includes(reason));return first?{reason:first[0],step:first[1],question:first[2],marker:first[3]}:null;
}

/** Eligibility only, before the annual income/credit tables. No award or
 * child count is inferred from an unreviewed aggregate eligibility assertion. */
export function eicEligibility(input,value){
 const diagnostics=[],denialReasons=[],unknown={count:0,need(condition,code,message){if(!condition){this.count++;diagnostics.push(diagnostic(code,message));}}},deny=(code,message)=>{denialReasons.push(code);diagnostics.push(diagnostic(code,message,{blocking:false}));};
 const year=input.year,joint=input.individual.filingStatus==='marriedJoint',owners=joint?['taxpayer','spouse']:['taxpayer'],emptyFacts={joint,mainHomeUS:null,homeByOwner:{taxpayer:null,spouse:null},separatedSpouse:null,noCreditIndicator:null,firstDenialReason:null,stoppingStep:null,stoppingQuestion:null,denialReasons,ageByOwner:{},combatKnown:false,combatByOwner:{taxpayer:0,spouse:0},earnedSourcesKnown:false,investmentSourcesKnown:false};
 if(value===undefined)return {known:false,eligible:null,allQualifyingChildren:[],creditChildren:[],attachmentChildren:[],filerFacts:emptyFacts,diagnostics:[diagnostic('EIC_AWARD_SOURCE_REQUIRED','Add the separate EIC eligibility, original-source and combat-election review before calculating an award.')]};
 const award=validateEicAward(value),scope=award.scope,filerFacts=emptyFacts,rows=validateChildren(input),dayCount=daysInYear(year);
 unknown.need([2023,2024,2025].includes(year),'EIC_AWARD_ANNUAL_RULES','This eligibility workflow is reviewed for 2023–2025. Later annual supporting requirements and award tables remain unavailable.');
 const scopeSource=sourced(scope);filerFacts.earnedSourcesKnown=Boolean(scopeSource&&scope.review.earned&&scope.earnedSources==='ordinaryWagesAndScheduleC');filerFacts.investmentSourcesKnown=Boolean(scopeSource&&scope.review.investment&&scope.investmentSources==='ordinaryInterestDividendsCapital');
 unknown.need(filerFacts.earnedSourcesKnown,'EIC_AWARD_EARNED_SCOPE','Review all original earned-income sources. This award supports represented ordinary wages/Schedule C; special wage exclusions, optional SE methods and other earned sources require separate treatment.');
 unknown.need(filerFacts.investmentSourcesKnown,'EIC_AWARD_INVESTMENT_SCOPE','Review original investment sources. Form 4797, Schedule E/passive income, royalties/rental personal property and Form 8814 require their additional investment worksheet.');
 unknown.need(scopeSource&&scope.review.foreign&&scope.form2555!=='unknown','EIC_AWARD_FOREIGN_SOURCE','Review the affirmative per-filer U.S. residence facts and Form 2555 source treatment.');if(scopeSource&&scope.review.foreign&&scope.form2555==='yes')deny('EIC_FORM2555_INELIGIBLE','Filing Form 2555 prevents EIC.');
 unknown.need(scopeSource&&scope.review.disallowance&&scope.priorDisallowance==='none','EIC_AWARD_DISALLOWANCE','Review original prior-EIC-disallowance records. Form 8862, bans and unresolved exceptions need their own treatment.');unknown.need(scopeSource&&scope.review.children,'EIC_AWARD_CHILD_COMPLETENESS','Review that every possible EIC child is retained, including unclaimed and self-supporting children.');
 const filerIds=owners.map(owner=>normalizedTaxId(owner==='taxpayer'?input.party.taxId:input.individual.spouseTaxId));unknown.need(new Set(filerIds).size===filerIds.length,'EIC_FILER_IDENTIFIER_CONFLICT','Distinct joint filers must not share a recorded identifier.');
 for(const owner of owners){
  const person=award.persons[owner],shared=input.individual.eligibility?.[owner];
  unknown.need(sourced(person)&&scope.review.foreign&&person.citizenshipResidence==='fullYearCitizenOrResident','EIC_FILER_RESIDENCE_SOURCE','Record each applicable filer as a full-year U.S. citizen/resident against original evidence. Nonresident elections and other treatments require separate work.');
  const retainedResidency=input.individual.eligibility;if(retainedResidency?.review?.status&&sourced(retainedResidency)&&retainedResidency.residency!=='unknown')unknown.need(retainedResidency.residency==='fullYearCitizenOrResident','EIC_SHARED_RESIDENCY_CONFLICT','The EIC citizenship/residency source conflicts with the retained federal residency treatment.');
  unknown.need(person.usHomeDays<=dayCount,'EIC_FILER_HOME_DAYS','Filer U.S.-home days exceed the actual tax year.');
  if(reviewedPerson(shared)&&shared.deceased==='yes'&&validDependentDate(shared.dateOfDeath,year)&&shared.dateOfDeath.startsWith(String(year))){const aliveDays=(Date.parse(shared.dateOfDeath+'T00:00:00Z')-Date.UTC(year,0,1))/86400000+1;unknown.need(person.usHomeDays<=aliveDays,'EIC_FILER_HOME_DEATH_CONFLICT','Actual U.S.-home days exceed the retained filer’s living period.');}
  const homeKnown=sourced(person)&&person.review.residence&&ordinaryHome.includes(person.homeException)&&person.usHomeDays<=dayCount;filerFacts.homeByOwner[owner]=homeKnown?person.usHomeDays>dayCount/2:null;
  unknown.need(homeKnown,'EIC_FILER_HOME_SOURCE','Review each filer’s actual U.S.-home days and ordinary temporary absences. Military extended-duty or other special residence needs its separate source workflow.');
  const identifier=taxpayerIdentifierStatus(input.individual.taxpayerIdentifiers,owner,{taxId:owner==='taxpayer'?input.party.taxId:input.individual.spouseTaxId});unknown.need(identifier.employmentSsn!==null,'EIC_FILER_SSN_SOURCE','Verify each filing spouse’s timely employment-valid SSN against its original source.');if(identifier.employmentSsn===false)deny('EIC_FILER_SSN_INELIGIBLE','Each joint filer needs a timely employment-valid SSN for EIC.');
  if(joint&&reviewedPerson(shared)&&shared.canBeClaimed==='yes')unknown.need(false,'EIC_JOINT_DEPENDENCY_CONFLICT','A joint return claiming EIC is not filed only for a withheld/estimated-tax refund. Reconcile retained claimability facts and the standard deduction before using this award.');
  for(const state of input.individual.stateReturns??[])if(state.state==='NY'&&owner==='taxpayer'&&['yes','no'].includes(state.claimedDependent)&&reviewedPerson(shared)&&['yes','no'].includes(shared.canBeClaimed))unknown.need(state.claimedDependent===shared.canBeClaimed,'EIC_STATE_CLAIMABILITY_CONFLICT','Retained state and federal filer claimability facts differ.');
 }
 const homes=owners.map(owner=>filerFacts.homeByOwner[owner]);filerFacts.mainHomeUS=homes.includes(false)?false:homes.every(value=>value===true)?true:null;
 for(const fact of award.children)unknown.need(rows.some(row=>row.id===fact.dependentId),'EIC_CHILD_LINK_MISSING','A retained EIC source references a removed or missing dependent identity.');
 for(const state of input.individual.stateReturns??[]){if(state.state!=='NY')continue;for(const row of state.dependents??[]){const match=rows.find(item=>normalizedTaxId(item.taxId)&&normalizedTaxId(item.taxId)===normalizedTaxId(row.taxId));unknown.need(match&&['firstName','lastName','dateOfBirth'].every(key=>normalizeName(match[key])===normalizeName(row[key]))&&(!row.middleInitial||normalizeName(row.middleInitial)===normalizeName(match.middleInitial))&&dependentRelationshipGroup(row.relationship)===dependentRelationshipGroup(match?.relationship),'EIC_STATE_CHILD_CONFLICT','A retained state child identity is missing or conflicts with federal relationship/birth evidence. Preserve and reconcile both sources.');}}
 const allQualifyingChildren=rows.map(row=>classifyChild(input,row,award.children.find(fact=>fact.dependentId===row.id),owners,unknown)).filter(Boolean),creditChildren=allQualifyingChildren.filter(row=>row.ssnEligible),attachmentChildren=creditChildren.length?creditChildren.slice(0,3):allQualifyingChildren.slice(0,1);
 // A child who meets Rule8 but lacks an eligible SSN still selects the
 // qualifying-child eligibility branch; only the amount column is self-only.
 const hasChild=allQualifyingChildren.length>0,marital=award.marital,maritalKnown=marital.reviewed&&sourced(marital)&&marital.status!=='unknown';
 if(homes.every(value=>value!==null)){const availableDays=owners.reduce((sum,owner)=>sum+award.persons[owner].usHomeDays,0);unknown.need(allQualifyingChildren.every(row=>row.usResidencyDays<=availableDays),'EIC_CHILD_FILER_HOME_CONFLICT','A qualifying child’s days in the filers’ U.S. home exceed the retained filers’ combined possible U.S.-home days.');}unknown.need(maritalKnown,'EIC_MARITAL_SOURCE','Review actual year-end marriage/separation status against the chosen filing status.');
 const status=input.individual.filingStatus,married=marital.status==='married';
 if(maritalKnown){
  unknown.need(!(marital.lastSixMonthsApart==='yes'&&marital.livedApartAtYearEnd==='no'),'EIC_SEPARATION_SOURCE_CONFLICT','Living apart for the final six months conflicts with a retained same-household answer at year end.');
  if(status==='survivingSpouse')unknown.need(marital.status!=='spouseDiedThisYear','EIC_MARITAL_DEATH_CONFLICT','Qualifying surviving spouse status refers to a prior death year, not the recorded current-year death.');
  if(joint)unknown.need(['married','spouseDiedThisYear'].includes(marital.status),'EIC_MARITAL_STATUS_CONFLICT','A joint filing status conflicts with the recorded marital status.');
  if(status==='marriedSeparate')unknown.need(married,'EIC_MARITAL_STATUS_CONFLICT','Separate married filing status requires a consistent married source.');
  if(['single','survivingSpouse'].includes(status))unknown.need(!married,'EIC_MARITAL_STATUS_CONFLICT','Single or surviving-spouse status conflicts with a current marriage.');
  if(marital.status==='spouseDiedThisYear')unknown.need(reviewedPerson(input.individual.eligibility?.spouse)&&input.individual.eligibility.spouse.deceased==='yes'&&validDependentDate(input.individual.eligibility.spouse.dateOfDeath,year)&&input.individual.eligibility.spouse.dateOfDeath.startsWith(String(year)),'EIC_MARITAL_DEATH_CONFLICT','The year-of-death marriage treatment requires the retained spouse’s death source in this tax year.');
 }
 filerFacts.separatedSpouse=false;
 if(maritalKnown&&married&&!joint){
  const separated=marital.lastSixMonthsApart==='yes'||marital.separatedUnderStateLaw==='yes'&&marital.livedApartAtYearEnd==='yes';
  const notSeparated=marital.lastSixMonthsApart==='no'&&(marital.separatedUnderStateLaw==='no'||marital.livedApartAtYearEnd==='no');
  unknown.need(['marriedSeparate','headOfHousehold'].includes(status),'EIC_MARITAL_STATUS_CONFLICT','A married nonjoint EIC return requires a supported separated-spouse filing status.');
  if(!hasChild)deny('EIC_MARRIED_NO_CHILD_INELIGIBLE','A married nonjoint filer needs a qualifying child and the separated-spouse conditions for EIC.');
  else if(separated)filerFacts.separatedSpouse=true;
  else if(notSeparated)deny('EIC_SEPARATED_SPOUSE_INELIGIBLE','The source facts do not meet either separated-spouse EIC condition.');
  else {filerFacts.separatedSpouse=null;unknown.need(false,'EIC_SEPARATION_SOURCE','Resolve six-month separation or the state-law agreement/decree and year-end household facts.');}
 }
 if(!joint){
  const person=award.persons.taxpayer,shared=input.individual.eligibility?.taxpayer;unknown.need(sourced(person)&&person.review.otherClaims&&person.qualifyingChildOfAnother!=='unknown','EIC_OTHER_QUALIFYING_CHILD_SOURCE','Review whether this filer is another person’s qualifying child, including the other person’s actual return requirement and purpose.');
  if(sourced(person)&&person.review.otherClaims&&person.qualifyingChildOfAnother==='yes'){
   unknown.need(person.qualifyingChildClaimantReturn!=='unknown','EIC_OTHER_CLAIMANT_RETURN_SOURCE','Determine whether the other qualifying-child claimant must file or files for something beyond withheld/estimated-tax refund.');
   if(person.qualifyingChildClaimantReturn==='requiredOrOtherPurpose')deny('EIC_FILER_QUALIFYING_CHILD_INELIGIBLE','The filer is another taxpayer’s qualifying child for EIC.');
  }
  if(!hasChild){
   unknown.need(reviewedPerson(shared)&&['yes','no'].includes(shared.canBeClaimed),'EIC_FILER_DEPENDENCY_SOURCE','Review the shared filer claimability source before using childless EIC.');
   if(reviewedPerson(shared)&&shared.canBeClaimed==='yes'){
    unknown.need(sourced(person)&&person.review.otherClaims&&person.dependencyClaimantReturn!=='unknown','EIC_DEPENDENCY_CLAIMANT_SOURCE','Record the actual return requirement and purpose of the person who can claim this filer.');
    if(person.dependencyClaimantReturn==='requiredOrOtherPurpose')deny('EIC_FILER_DEPENDENT_INELIGIBLE','Another taxpayer can claim this childless filer as a dependent.');
   }
  }
 }
 if(!hasChild){
  for(const owner of owners){
   const shared=input.individual.eligibility?.[owner],age=eicFilerAge(shared,year),retained=(input.individual.stateReturns??[]).filter(row=>row.state==='NY').map(row=>row[owner==='taxpayer'?'taxpayerDob':'spouseDob']).filter(Boolean);
   if(age.known&&retained.some(dob=>{const other=eicFilerAge({...shared,dateOfBirth:dob},year);return !other.known||other.eligible!==age.eligible;})){age.known=false;age.eligible=null;age.diagnostics.push(diagnostic('EIC_FILER_AGE_CONFLICT','Retained federal and state birth dates change the childless EIC age result. Reconcile the actual identity sources.'));}
   filerFacts.ageByOwner[owner]=age;
  }
  const ages=Object.values(filerFacts.ageByOwner);if(!ages.some(row=>row.known&&row.eligible)){
   if(ages.every(row=>row.known))deny('EIC_FILER_AGE_INELIGIBLE','No applicable filer was at least25 and under65 at the required year-end/death date.');
   else unknown.need(false,'EIC_FILER_AGE_UNRESOLVED','Resolve the relevant shared filer/spouse birth and death sources; another joint filer may meet the age test.');
  }
  if(filerFacts.mainHomeUS===false)deny('EIC_FILER_HOME_INELIGIBLE','Each joint filer’s main home must be in the United States for more than half the year for childless EIC.');
 }
 const combat=combatFacts(input,award,owners,unknown);filerFacts.combatKnown=combat.known;filerFacts.combatByOwner=combat.totals;
 const known=unknown.count===0,eligible=known?denialReasons.length===0:null,stop=known?firstEligibilityStop(denialReasons,hasChild):null;
 filerFacts.noCreditIndicator=known?(stop?.marker??(eligible?false:null)):null;filerFacts.firstDenialReason=stop?.reason??null;filerFacts.stoppingStep=stop?.step??null;filerFacts.stoppingQuestion=stop?.question??null;
 return {known,eligible,allQualifyingChildren,creditChildren,attachmentChildren,filerFacts,diagnostics};
}
