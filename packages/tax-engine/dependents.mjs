import {strictObject,list,text,diagnostic} from './model.mjs';
import {checkedMoney} from './money.mjs';
import {normalizedTaxId,taxpayerIdentifierStatus,validateTaxpayerIdentifier} from './taxpayer-identifiers.mjs';
import {newDependent,dependentRelationships,dependentReviews} from './dependents-model.mjs';
export * from './dependents-model.mjs';
const decisions=['unknown','yes','no'],citizens=['usCitizen','usNational','usResident'],relativeLimits={2023:470000,2024:505000,2025:520000,2026:530000,2027:550000};
const childRelations=['child','adoptedChild','stepchild','fosterChild','grandchild','sibling','nieceNephew'];
export const validDependentDate=(value,year)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value&&value<=`${year}-12-31`;
// Rev. Rul. 2003-72: dependency/child-credit age is attained on the actual
// birthday. Do not reuse the day-before rule for the filer age65 deduction.
export const dependentAge=(dob,year)=>validDependentDate(dob,year)?year-Number(dob.slice(0,4)):null;
export const dependentRelationshipGroup=value=>{
 const normalized=String(value??'').toLowerCase().replace(/[^a-z]/g,''),aliases={son:'child',daughter:'child',child:'child',adoptedchild:'child',adoptedson:'child',adopteddaughter:'child',stepchild:'child',stepson:'child',stepdaughter:'child',fosterchild:'child',fosterson:'child',fosterdaughter:'child',grandchild:'grandchild',grandson:'grandchild',granddaughter:'grandchild',sibling:'sibling',brother:'sibling',sister:'sibling',halfbrother:'sibling',halfsister:'sibling',stepbrother:'sibling',stepsister:'sibling',niecenephew:'nieceNephew',niece:'nieceNephew',nephew:'nieceNephew',parent:'parent',father:'parent',mother:'parent',stepparent:'parent',stepfather:'parent',stepmother:'parent',grandparent:'grandparent',grandmother:'grandparent',grandfather:'grandparent',auntuncle:'auntUncle',aunt:'auntUncle',uncle:'auntUncle',inlaw:'inLaw',soninlaw:'inLaw',daughterinlaw:'inLaw',fatherinlaw:'inLaw',motherinlaw:'inLaw',brotherinlaw:'inLaw',sisterinlaw:'inLaw',unrelated:'unrelated',other:'unrelated'};
 if(aliases[normalized])return aliases[normalized];const key=dependentRelationships.find(([,label])=>label.toLowerCase().replace(/[^a-z]/g,'')===normalized)?.[0];return key?aliases[key.toLowerCase()]??key:null;
};
const normalizedName=value=>String(value??'').trim().replace(/\s+/g,' ').toUpperCase();
function validate(row,year,seen,filers){
 strictObject(row,Object.keys(newDependent()),'Federal dependent');for(const key of ['id','firstName','middleInitial','lastName','taxId','dateOfBirth','source'])text(row[key],`Dependent ${key}`,key==='source'?500:100);if(!row.id||seen.ids.has(row.id))throw new Error('Every dependent needs a unique stable source identifier.');seen.ids.add(row.id);
 const id=normalizedTaxId(row.taxId);if(id&&(seen.taxIds.has(id)||filers.has(id)))throw new Error('A dependent identifier repeats another dependent or a taxpayer/spouse identifier.');if(id)seen.taxIds.add(id);
 if(!dependentRelationships.some(([key])=>row.relationship===key)||!decisions.includes(row.claim)||!['unknown',...citizens,'canadaMexico','other'].includes(row.citizenship))throw new Error('Choose a supported dependent relationship, claim and citizenship fact.');
 if(!['none','temporaryAbsence','bornOrDied','adoptionPlacement','divorcedParents','other'].includes(row.residencyException))throw new Error('Choose the source residency situation.');
 if(!Number.isInteger(row.residencyDays)||row.residencyDays<0||row.residencyDays>(year%4===0?366:365)||!Number.isInteger(row.usResidencyDays)||row.usResidencyDays<0||row.usResidencyDays>row.residencyDays||!Number.isInteger(row.studentMonths)||row.studentMonths<0||row.studentMonths>12)throw new Error('Dependent residence days and school months must be actual whole counts in the tax year.');
 for(const key of ['permanentlyDisabled','qualifyingChildOfAnother'])if(!decisions.includes(row[key]))throw new Error('Dependent support and eligibility answers require yes, no or unknown.');
 if(!['unknown','no','refundOnly','yes'].includes(row.jointReturn)||!['unknown','none','tieBreaker','custodialRelease','other'].includes(row.competingClaim))throw new Error('Choose the recorded joint-return and competing-claim facts.');
 for(const key of ['ownSupportCents','taxpayerSupportCents','totalSupportCents','grossIncomeCents'])checkedMoney(row[key],`Dependent ${key}`);if(row.ownSupportCents+row.taxpayerSupportCents>row.totalSupportCents)throw new Error('Own support and taxpayer/spouse support cannot exceed total dependent support.');
 validateTaxpayerIdentifier(row.identifier,{dependent:true});strictObject(row.review,dependentReviews.map(([key])=>key),'Dependent source review');for(const [key]of dependentReviews)if(typeof row.review[key]!=='boolean')throw new Error('Dependent reviews must be explicit yes/no decisions.');
}
export function reconcileNewYorkDependents(input,records,diagnostics){
 let known=true;const federal=records.filter(record=>record.claim==='yes'),map=new Map(federal.map(row=>[normalizedTaxId(row.taxId),row]));
 for(const state of input.individual.stateReturns??[]){if(state.state!=='NY'||!Array.isArray(state.dependents))continue;const nyIds=new Set();
  for(const row of state.dependents){const id=normalizedTaxId(row.taxId),match=map.get(id);nyIds.add(id);if(!match||['firstName','lastName','dateOfBirth'].some(key=>normalizedName(row[key])!==normalizedName(match[key]))||row.middleInitial&&normalizedName(row.middleInitial)!==normalizedName(match.middleInitial)||!dependentRelationshipGroup(row.relationship)||dependentRelationshipGroup(row.relationship)!==dependentRelationshipGroup(match.relationship)){known=false;diagnostics.push(diagnostic('DEPENDENT_NY_RECONCILIATION','A New York dependent is missing from federal intake or has conflicting identity, birth or relationship details. Preserve and reconcile both sources before calculating dependent credits.'));}}
  if(federal.some(row=>!nyIds.has(normalizedTaxId(row.taxId)))){known=false;diagnostics.push(diagnostic('DEPENDENT_NY_RECONCILIATION','A claimed federal dependent is missing from New York source records. Add the matching state identity without discarding the existing state records.'));}
 }
 return known;
}
export function calculateDependents(input){
 const {year,individual}=input,rows=individual.dependents??[],diagnostics=[],records=[],joint=individual.filingStatus==='marriedJoint';if(relativeLimits[year]===undefined)throw new Error('No reviewed dependent rules exist for this year.');list(rows,'Federal dependents',100);
 const hasNY=(individual.stateReturns??[]).some(state=>state.state==='NY'&&state.dependents?.length),required=rows.some(row=>row.claim!=='no')||hasNY,seen={ids:new Set(),taxIds:new Set()},filers=new Set([input.party.taxId,individual.spouseTaxId].filter(Boolean).map(normalizedTaxId));
 for(const row of rows)validate(row,year,seen,filers);
 if(!required)return {required:false,known:true,ctcCount:0,odcCount:0,records:rows.map(row=>({...row,eligible:false,credit:null,known:true})),nyReconciled:true,diagnostics};
 const taxpayer=taxpayerIdentifierStatus(individual.taxpayerIdentifiers,'taxpayer',{taxId:input.party.taxId}),spouse=joint?taxpayerIdentifierStatus(individual.taxpayerIdentifiers,'spouse',{taxId:individual.spouseTaxId}):null;
 const filersTimely=taxpayer.timely===false||spouse?.timely===false?false:taxpayer.timely===null||spouse?.timely===null?null:true,ctcFiler=year<2025?filersTimely:filersTimely===false?false:taxpayer.employmentSsn===true||spouse?.employmentSsn===true?filersTimely:taxpayer.employmentSsn===null||spouse?.employmentSsn===null?null:false;
 let known=true;for(const row of rows){if(row.claim==='no'){records.push({...row,known:true,eligible:false,credit:null});continue;}const before=diagnostics.length,need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));};
  need(row.claim==='yes','DEPENDENT_CLAIM_DECISION','Choose whether the recorded person is being claimed as a dependent.');need(Boolean(row.source.trim()),'DEPENDENT_SOURCE_REQUIRED','Retain a source reference supporting each claimed dependent.');for(const [key,label]of dependentReviews)need(row.review[key],'DEPENDENT_REVIEW_'+key.toUpperCase(),label+'.');
  need(row.totalSupportCents>0,'DEPENDENT_SUPPORT_SOURCE','Enter the actual total support from the source worksheet before applying the support tests.');
  const age=dependentAge(row.dateOfBirth,year);need(Boolean(row.firstName.trim())&&Boolean(row.lastName.trim())&&/^\d{9}$/.test(normalizedTaxId(row.taxId))&&age!==null,'DEPENDENT_IDENTITY_REQUIRED','Complete each dependent name, actual taxpayer identifier and valid birth date.');
  need(row.citizenship!=='unknown'&&row.permanentlyDisabled!=='unknown'&&row.jointReturn!=='unknown'&&row.qualifyingChildOfAnother!=='unknown','DEPENDENT_FACTS_REQUIRED','Resolve dependent citizenship, disability, joint-return and other-taxpayer facts.');
  need(row.competingClaim==='none'&&row.qualifyingChildOfAnother!=='yes','DEPENDENT_COMPETING_CLAIM','Tie-breakers, noncustodial releases and competing claims require additional source treatment; a credit is not inferred from a selection.');need(['none','temporaryAbsence'].includes(row.residencyException),'DEPENDENT_RESIDENCY_EXCEPTION','Birth/death, adoption-placement, divorce and other exceptional residency allocations require their additional source treatment.');need(row.relationship!=='other','DEPENDENT_RELATIONSHIP_REQUIRED','The recorded relationship needs a supported federal classification.');
  const person=individual.eligibility?.taxpayer,partner=individual.eligibility?.spouse,claimability=person?.reviewed&&person.source?.trim()?person.canBeClaimed:'unknown',spouseClaimability=joint?(partner?.reviewed&&partner.source?.trim()?partner.canBeClaimed:'unknown'):'no';
  need(claimability!=='unknown'&&spouseClaimability!=='unknown','DEPENDENT_TAXPAYER_ELIGIBILITY','Review each filer’s shared federal claimability facts before claiming another person.');
  const parentBirths=[person,...(joint?[partner]:[])].filter(person=>person?.reviewed&&person.source?.trim()).map(person=>person.dateOfBirth).filter(dob=>validDependentDate(dob,year)),younger=parentBirths.some(dob=>dob<row.dateOfBirth);
  const ageTestApplies=childRelations.includes(row.relationship)&&row.permanentlyDisabled!=='yes'&&age!==null&&(age<19||age<24&&row.studentMonths>=5)&&row.residencyDays>(year%4===0?366:365)/2&&row.ownSupportCents<=row.totalSupportCents/2&&['no','refundOnly'].includes(row.jointReturn);
  if(ageTestApplies){
   need(younger||parentBirths.length===(joint?2:1),'DEPENDENT_PARENT_AGE','Record the filer/spouse birth date to establish that a qualifying child is younger than at least one joint filer.');
   const ageSources=['taxpayer',...(joint?['spouse']:[])].map(owner=>{const person=individual.eligibility?.[owner],dob=person?.dateOfBirth,retained=(individual.stateReturns??[]).filter(state=>state.state==='NY').map(state=>state[owner==='taxpayer'?'taxpayerDob':'spouseDob']).filter(value=>typeof value==='string'&&value.trim());return {dob,retained,reviewed:person?.reviewed&&person.source?.trim()&&validDependentDate(dob,year)};});
   const provenOlder=ageSources.some(source=>source.reviewed&&[source.dob,...source.retained].every(dob=>validDependentDate(dob,year)&&dob<row.dateOfBirth)),conflictingAge=ageSources.some(source=>source.retained.some(dob=>!validDependentDate(dob,year)||!validDependentDate(source.dob,year)||(dob<row.dateOfBirth)!==(source.dob<row.dateOfBirth)));
   need(!conflictingAge||provenOlder,'DEPENDENT_PARENT_AGE_CONFLICT','Retained federal and New York filer birth dates disagree in a way that changes whether the child is younger than a filer. Reconcile those sources before classifying the dependent. An independently established older joint filer still satisfies this test.');
  }
  if(row.relationship==='adoptedChild'&&row.citizenship==='other')need(false,'DEPENDENT_ADOPTED_CITIZENSHIP','The adopted-child citizenship exception requires an additional parent-citizenship/household source workflow.');
  const residence=row.residencyDays>(year%4===0?366:365)/2,childAge=row.permanentlyDisabled==='yes'||younger&&(age<19||age<24&&row.studentMonths>=5),jointOK=['no','refundOnly'].includes(row.jointReturn),citizenOK=[...citizens,'canadaMexico'].includes(row.citizenship),ownSupportOK=row.ownSupportCents<=row.totalSupportCents/2;
  const qualifyingChild=childRelations.includes(row.relationship)&&childAge&&residence&&ownSupportOK&&jointOK,qualifyingRelative=!qualifyingChild&&row.qualifyingChildOfAnother==='no'&&(row.relationship!=='unrelated'||row.residencyDays===(year%4===0?366:365))&&row.grossIncomeCents<relativeLimits[year]&&row.taxpayerSupportCents>row.totalSupportCents/2&&jointOK;
  const eligible=claimability==='no'&&spouseClaimability==='no'&&citizenOK&&(qualifyingChild||qualifyingRelative);if(!eligible&&diagnostics.length===before)diagnostics.push(diagnostic('DEPENDENT_NOT_ELIGIBLE','The claimed person does not meet the recorded ordinary dependency tests. Correct the claim or record an applicable special treatment.'));
  const identifier=taxpayerIdentifierStatus(row.identifier,'dependent',{taxId:row.taxId,dependent:true});let credit=null;
  if(eligible&&citizens.includes(row.citizenship)){
   if(identifier.timely===null||filersTimely===null){diagnostics.push(...identifier.diagnostics,...taxpayer.diagnostics,...(spouse?.diagnostics??[]));need(false,'DEPENDENT_TIN_TIMING','Resolve timely taxpayer and dependent identifiers before child or other-dependent credits.');}
   else if(identifier.timely&&filersTimely){
    if(qualifyingChild&&age<17){if(identifier.employmentSsn===null||ctcFiler===null){diagnostics.push(...identifier.diagnostics,...taxpayer.diagnostics,...(spouse?.diagnostics??[]));need(false,'DEPENDENT_CTC_SSN','Verify the applicable annual employment-valid SSN requirements.');}else credit=identifier.employmentSsn&&ctcFiler?'ctc':'odc';}
    else credit='odc';
   }
  }
  const rowKnown=diagnostics.length===before;known&&=rowKnown;records.push({...row,known:rowKnown,eligible:rowKnown?eligible:null,qualifyingChild:rowKnown?qualifyingChild:null,qualifyingRelative:rowKnown?qualifyingRelative:null,age,credit:rowKnown?credit:null});
 }
 const nyReconciled=reconcileNewYorkDependents(input,rows,diagnostics);known&&=nyReconciled;return {required,known,ctcCount:known?records.filter(row=>row.credit==='ctc').length:null,odcCount:known?records.filter(row=>row.credit==='odc').length:null,records,nyReconciled,diagnostics};
}
