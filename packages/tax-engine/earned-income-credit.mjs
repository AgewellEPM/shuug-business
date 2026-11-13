import {strictObject,text,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R,displayMoney} from './money.mjs';
import {calculateDependents,dependentAge} from './dependents.mjs';
import {taxpayerIdentifierStatus,normalizedTaxId} from './taxpayer-identifiers.mjs';
import {validateEicAward} from './eic-model.mjs';
import {eicEligibility} from './eic-eligibility.mjs';
import {eicAward} from './eic-award.mjs';
import {eicTableLookup,eicTableYears} from './eic-tables.mjs';

// Publication 596, Rules 1/15 (2023–2025); Rev. Proc. 2025-32 §4.06 (2026),
// and released Rev. Proc. 2026-35 §3.06 (2027). These are zero-credit bounds.
// Pairs are [all other filing statuses, married filing jointly], in cents.
export const earnedIncomeCreditAnnual=Object.freeze({
 2023:{none:[1764000,2421000],maximum:[5683800,6339800]},
 2024:{none:[1859100,2551100],maximum:[5989900,6681900]},
 2025:{none:[1910400,2621400],maximum:[6155500,6867500]},
 2026:{none:[1954000,2682000],maximum:[6297400,7024400]},
 2027:{none:[2016400,2768400],maximum:[6500200,7251200]},
});
export const newEarnedIncomeCredit=()=>({qualifyingChildren:'unknown',nontaxableCombatPayCents:0,source:'',reviewed:false,earnedSourcesReviewed:false});
function source(value){
 if(value===undefined)return null;
 strictObject(value,[...Object.keys(newEarnedIncomeCredit()),'award'],'Earned Income Credit source');
 if(!['unknown','none','present'].includes(value.qualifyingChildren))throw new Error('Review EIC qualifying children separately from claimed dependents.');
 checkedMoney(value.nontaxableCombatPayCents,'EIC nontaxable combat pay');text(value.source,'Earned Income Credit source',500);
 for(const key of ['reviewed','earnedSourcesReviewed'])if(typeof value[key]!=='boolean')throw new Error('EIC source review decisions must be explicit.');
 if(value.award!==undefined)validateEicAward(value.award);
 return value;
}
const amount=(value,label,negative=false)=>value===undefined||value===null?null:checkedMoney(value,label,{negative});
function possibleEicChild(row,input){
 // Dependency claim and own-support tests do not determine an EIC child.
 // Retain unclaimed/self-supporting candidates and unresolved relevant facts.
 const sourced=Boolean(row.source.trim()),review=row.review;
 if(sourced&&review.relationship&&!['child','adoptedChild','stepchild','fosterChild','grandchild','sibling','nieceNephew','other'].includes(row.relationship))return false;
 if(sourced&&review.jointReturn&&row.jointReturn==='yes')return false;
 if(sourced&&review.residency&&['none','temporaryAbsence'].includes(row.residencyException)&&row.usResidencyDays<=(input.year%4===0?366:365)/2)return false;
 const age=sourced&&review.identity?dependentAge(row.dateOfBirth,input.year):null;
 if(age!==null&&sourced&&review.studentDisability&&row.permanentlyDisabled==='no'){
  if(age>=24||age>=19&&row.studentMonths<5)return false;
 }
 return true;
}

/** Establishes independent zero proofs or a reviewed ordinary EIC award. The main return must
 * call this even when there are no dependent or child-credit source sections.
 * The independent AGI/SSN proofs do not require complete earned-income intake.
 * Earned-income proofs require explicit coverage of every earned/elective source.
 */
export function earnedIncomeCredit(input,context={}){
 const annual=earnedIncomeCreditAnnual[input.year];if(!annual)throw new Error('No reviewed EIC limits exist for this year.');
 const value=source(input.individual.earnedIncomeCredit),diagnostics=[],joint=input.individual.filingStatus==='marriedJoint',index=joint?1:0,eligibility=value?.award?eicEligibility(input,value.award):null;
 const agi=amount(context.adjustedGrossIncomeCents,'EIC federal AGI',true),wages=amount(context.wageIncomeCents,'EIC wages'),profit=amount(context.scheduleCProfitCents,'EIC Schedule C profit',true),halfSE=amount(context.halfSeTaxCents,'EIC deductible half of SE tax'),combatContext=amount(context.combatPayCents,'EIC combat pay');
 const dependents=context.dependents??calculateDependents(input),reviewed=Boolean(value?.reviewed&&value.source.trim());
 // EIC and dependency tests differ. This is only a conservative contradiction
 // check; it never derives EIC childlessness from an empty dependency list.
 const possibleChild=(input.individual.dependents??[]).some(row=>possibleEicChild(row,input));
 const awardChildUnresolved=eligibility&&(eligibility.allQualifyingChildren.length>0||eligibility.diagnostics.some(row=>/^EIC_(CHILD_|STATE_CHILD_|AWARD_CHILD_)/.test(row.code)));
 const childConflict=reviewed&&value.qualifyingChildren==='none'&&(possibleChild||!dependents.known||awardChildUnresolved);
 if(childConflict)diagnostics.push(diagnostic('EIC_CHILD_SOURCE_CONFLICT','The reviewed absence of EIC qualifying children conflicts with a retained possible U.S.-resident qualifying child or unresolved dependent sources, including unclaimed or self-supporting children. Reconcile both records; the childless income limit is not used.'));
 const childless=reviewed&&value.qualifyingChildren==='none'&&!childConflict,knownAnnualChildren=eligibility?.known===true&&eicTableYears.includes(input.year),cutoffCents=knownAnnualChildren?eicTableLookup(0,{year:input.year,filingStatus:input.individual.filingStatus,qualifyingChildren:eligibility.creditChildren.length}).cutoffCents:annual[childless?'none':'maximum'][index],cutoffKind=knownAnnualChildren?'reviewed-valid-SSN-child-count':childless?'reviewed-no-qualifying-children':'all-family-maximum';
 let combatKnown=reviewed&&value.earnedSourcesReviewed&&(!eligibility||eligibility.filerFacts.combatKnown),combat= value?.nontaxableCombatPayCents??null;
 const recordedCombat=[];
 if(combatContext!==null)recordedCombat.push(combatContext);
 if(input.individual.childCredits!==undefined)recordedCombat.push(input.individual.childCredits.nontaxableCombatPayCents);
 const nyCombat=sumMoney((input.individual.stateReturns??[]).filter(state=>state.state==='NY').flatMap(state=>(state.wageRecords??[]).flatMap(wage=>(wage.box12??[]).filter(row=>String(row.code).toUpperCase()==='Q').map(row=>row.amountCents))));
 if(nyCombat)recordedCombat.push(nyCombat);
 if(value&&recordedCombat.some(record=>record!==combat)){
  combatKnown=false;diagnostics.push(diagnostic('EIC_COMBAT_SOURCE_CONFLICT','EIC combat pay differs from existing child-credit or W-2 code Q source amounts. Reconcile the original statements before using earned income to establish zero EIC.'));
 }
 const awardIncomeConflict=value?.award&&(value.award.scope.earnedSources==='other'||value.award.scope.investmentSources==='other');
 const earnedKnown=reviewed&&value.earnedSourcesReviewed&&combatKnown&&(!eligibility||eligibility.filerFacts.earnedSourcesKnown)&&!awardIncomeConflict&&!context.otherTreatments&&wages!==null&&profit!==null&&halfSE!==null;
 const earnedIncomeExcludingCombatCents=earnedKnown?sumMoney([R(wages),R(profit),-R(halfSE)]):null;
 // Each spouse may separately elect combat pay. Since these amounts are
 // nonnegative, excluding all / including all bound every such election.
 const maximumEarnedIncomeCents=earnedKnown?sumMoney([earnedIncomeExcludingCombatCents,R(combat)]):null;
 const result=(amountCents,reason,noCreditIndicator=false)=>({amountCents,reason,noCreditIndicator,cutoffCents,cutoffKind,earnedIncomeExcludingCombatCents,maximumEarnedIncomeCents,...(eligibility?{eligibility}:{}),diagnostics:[...diagnostics,...(eligibility?.diagnostics??[])]});
 const owners=joint?['taxpayer','spouse']:['taxpayer'],taxpayerId=normalizedTaxId(input.party.taxId),spouseId=normalizedTaxId(input.individual.spouseTaxId),identifierConflict=joint&&Boolean(taxpayerId)&&taxpayerId===spouseId;
 if(identifierConflict)diagnostics.push(diagnostic('EIC_FILER_IDENTIFIER_CONFLICT','Joint filers have the same recorded identifier. Reconcile their distinct original identifiers before using SSN eligibility to establish zero EIC.'));
 const identifiers=owners.map(owner=>taxpayerIdentifierStatus(input.individual.taxpayerIdentifiers,owner,{taxId:owner==='taxpayer'?input.party.taxId:input.individual.spouseTaxId}));
 // Annual Step 1 tests AGI before identifiers. Its high-AGI stop does not
 // instruct a No/27c indicator, even when a later SSN test would also deny EIC.
 if(!context.otherTreatments&&!awardIncomeConflict&&agi!==null&&R(agi)>=cutoffCents)return result(0,'AGI-at-or-above-'+cutoffKind);
 if(!identifierConflict&&identifiers.some(record=>record.employmentSsn===false)){
  const stepOnePassLimit=knownAnnualChildren||childless?cutoffCents:annual.none[index],agiStepPassed=!context.otherTreatments&&!awardIncomeConflict&&agi!==null&&R(agi)<stepOnePassLimit;
  return result(0,'required-employment-SSN-not-held',agiStepPassed);
 }
 const canRunAward=value?.award&&reviewed&&value.earnedSourcesReviewed&&!childConflict&&combatKnown&&!identifierConflict;
 const runAward=()=>{
  const award=eicAward(input,{...context,eligibility});
  return {...result(award.amountCents,award.reason),...award,eligibility,diagnostics:[...diagnostics,...award.diagnostics]};
 };
 // Complete annual awards follow the actual eligibility/investment/worksheet
 // stopping order before choosing a prescribed PDF indicator. A legacy or
 // future-year income bound proves the amount only, not that form decision.
 if(canRunAward&&eicTableYears.includes(input.year))return runAward();
 if(earnedKnown&&earnedIncomeExcludingCombatCents>=cutoffCents)return result(0,'earned-income-at-or-above-'+cutoffKind);
 if(earnedKnown&&maximumEarnedIncomeCents<=0)return result(0,'no-positive-reviewed-earned-income-under-either-combat-election');
 if(canRunAward)return runAward();
 diagnostics.push(diagnostic('EARNED_INCOME_CREDIT_REQUIRED','The source facts do not establish zero Earned Income Credit. Complete EIC eligibility and the annual worksheet/table; refundable credits, payments and settlement remain unresolved.'));
 if(!reviewed||value.qualifyingChildren==='unknown')diagnostics.push(diagnostic('EIC_SOURCE_REVIEW_REQUIRED','Review EIC qualifying-child facts separately from dependency claims. An empty dependent list does not establish childlessness.'));
 if(!earnedKnown)diagnostics.push(diagnostic('EIC_EARNED_SOURCE_REQUIRED','Reconcile every EIC earned-income source, self-employment loss and adjustment, and nontaxable combat/other elective income before using an earned-income exclusion.'));
 return result(null,'separate-EIC-calculation-required');
}

export function earnedIncomeCreditWorkpaper(input,result,line){
 if(input.kind!=='1040')return;const value=input.individual.earnedIncomeCredit,eic=result.earnedIncomeCredit;
 line('Earned Income Credit source review',13);
 line('This check runs independently of dependent and Schedule 8812 scope. Supported annual awards require reviewed EIC eligibility, source reconciliation and the exact annual worksheet/table. Independent source facts may establish zero.');
 if(value)line(`EIC qualifying children: ${value.qualifyingChildren}; source reviewed: ${value.reviewed}; all earned/elective sources reviewed: ${value.earnedSourcesReviewed}; nontaxable combat pay: ${displayMoney(value.nontaxableCombatPayCents)} USD. Source: ${value.source}`);
 else line('No EIC source review was entered. An empty dependent list does not establish childlessness.');
 if(eic){line(`EIC amount: ${displayMoney(eic.amountCents)} USD; reason: ${eic.reason}. Applied income limit: ${displayMoney(eic.cutoffCents)} USD (${eic.cutoffKind}).`);line(`Reviewed earned income excluding elective combat: ${displayMoney(eic.earnedIncomeExcludingCombatCents)} USD; including all combat: ${displayMoney(eic.maximumEarnedIncomeCents)} USD.`);for(const item of eic.diagnostics??[])line(`${item.code}: ${item.message}`);}
 else line('Independent EIC result is unavailable; no zero or award is inferred.');
 if(input.year===2026)line('2026 income exclusions use final Rev. Proc. 2025-32. Full annual EIC eligibility, any new supporting schedules and award tables remain outside this limited check.');
}
