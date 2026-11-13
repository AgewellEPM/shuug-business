import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';
import {diagnostic} from './model.mjs';
import {eicTableLookup,eicTableYears,eicWorksheetAnnual} from './eic-tables.mjs';

const nullable=(value,label,{negative=false}={})=>value===null||value===undefined?null:checkedMoney(value,label,{negative});
const moneyKeys=['adjustedGrossIncomeCents','wageIncomeCents','scheduleCProfitCents','halfSeTaxCents','investmentIncomeCents'];

// Reconcile the already-calculated ordinary federal sources. Worksheet B uses
// Schedule SE line 3, not 92.35% of profit; owners below the SE filing threshold
// and owners with losses belong in Part 2. The same owner never enters both.
function earnedSources(input,context,need){
 const values=Object.fromEntries(moneyKeys.map(key=>[key,nullable(context[key],key,{negative:['adjustedGrossIncomeCents','scheduleCProfitCents'].includes(key)})]));
 for(const key of moneyKeys)need(values[key]!==null,'EIC_AWARD_INCOME_UNRESOLVED',`Complete the original ${key} source before calculating an EIC award.`);
 const businesses=context.businesses,seByOwner=context.seByOwner,wages=input.individual.w2s,rawBusinesses=input.individual.businesses,owners=input.individual.filingStatus==='marriedJoint'?['taxpayer','spouse']:['taxpayer'];
 if(!Array.isArray(businesses)||!Array.isArray(seByOwner)||!Array.isArray(wages)||!Array.isArray(rawBusinesses)){
  need(false,'EIC_AWARD_EARNED_LINKS_REQUIRED','Provide the calculated Schedule C and Schedule SE owner records and their original W-2/business links.');return {...values,kind:null};
 }
 const businessIds=new Set(),seOwners=new Set();
 for(const business of businesses){
  need(Boolean(business.copyId)&&!businessIds.has(business.copyId)&&owners.includes(business.owner),'EIC_AWARD_BUSINESS_LINK_CONFLICT','Each calculated business must have one distinct source identifier and an applicable owner.');businessIds.add(business.copyId);
  need(!business.incomeUnknown&&nullable(business.profitCents,'EIC business profit',{negative:true})!==null,'EIC_AWARD_BUSINESS_UNRESOLVED','Resolve the complete Schedule C profit/loss source before EIC.');
 }
 need(rawBusinesses.length===businesses.length&&rawBusinesses.every(row=>businesses.some(business=>business.copyId===row.id&&business.owner===row.owner)),'EIC_AWARD_BUSINESS_LINK_CONFLICT','Calculated businesses must reconcile to every retained Schedule C source.');
 for(const se of seByOwner){need(owners.includes(se.owner)&&!seOwners.has(se.owner),'EIC_AWARD_SE_OWNER_CONFLICT','Use one calculated Schedule SE record per applicable owner.');seOwners.add(se.owner);}
 if(wages.every(row=>nullable(row.wagesCents,'EIC W-2 wages')!==null))need(values.wageIncomeCents!==null&&R(sumMoney(wages.map(row=>row.wagesCents)))===R(values.wageIncomeCents),'EIC_AWARD_WAGE_RECONCILIATION','EIC ordinary wages must reconcile to the retained W-2 income; other wage treatments require separate integration.');
 else need(false,'EIC_AWARD_WAGE_RECONCILIATION','An original W-2 wage amount is unresolved.');
 if(businesses.some(row=>row.incomeUnknown||!Number.isSafeInteger(row.profitCents)))return {...values,kind:businesses.length?'B':'A'};
 need(values.scheduleCProfitCents!==null&&sumMoney(businesses.map(row=>row.profitCents))===R(values.scheduleCProfitCents),'EIC_AWARD_PROFIT_RECONCILIATION','The EIC business total must equal the complete calculated Schedule C profits and losses.');
 const part1=[],part1Deductions=[],part2=[],ownerSources=[];
 for(const owner of owners){
  const own=businesses.filter(row=>row.owner===owner),net=sumMoney(own.map(row=>row.profitCents)),se=seByOwner.find(row=>row.owner===owner),netEarnings=net>0?P(net,9235):0,filesSE=netEarnings>=40000;
  if(!own.length&&se)need(false,'EIC_AWARD_SE_OWNER_CONFLICT','A Schedule SE record has no corresponding ordinary business source.');
  if(filesSE){
   const lines=se?.lines,known=se&&!se.incomeUnknown&&lines&&['3','4b','5a','13'].every(line=>Number.isSafeInteger(lines[line]))&&Number.isSafeInteger(se.halfTaxCents)&&Number.isSafeInteger(se.netEarningsCents);
   need(known,'EIC_AWARD_SE_REQUIRED','Complete Schedule SE for each owner with at least $400 of net earnings before the EIC Worksheet B calculation.');
   if(!known)continue;
   need(lines['3']===net&&se.netEarningsCents===netEarnings&&lines['13']===se.halfTaxCents,'EIC_AWARD_SE_RECONCILIATION','Schedule SE line 3, net earnings and deductible half-tax must reconcile to the same owner’s source calculation.');
   need(lines['4b']===0&&lines['5a']===0,'EIC_AWARD_SE_SPECIAL_TREATMENT','Optional Schedule SE methods and church-employee amounts need their own EIC source integration.');
   checkedMoney(lines['13'],'EIC Schedule SE deduction');part1.push(net);part1Deductions.push(lines['13']);ownerSources.push({owner,part:1,netProfitCents:net,netEarningsCents:netEarnings,halfSeTaxCents:lines['13']});
  }else{
   if(se)need(!se.incomeUnknown&&se.netEarningsCents===netEarnings&&se.halfTaxCents===0&&se.lines?.['13']===0,'EIC_AWARD_SE_RECONCILIATION','An owner below the ordinary SE filing threshold cannot carry a nonzero or unresolved SE adjustment into Worksheet B.');
   if(own.length){part2.push(net);ownerSources.push({owner,part:2,netProfitCents:net,netEarningsCents:netEarnings,halfSeTaxCents:0});}
  }
 }
 const half=sumMoney(part1Deductions);need(values.halfSeTaxCents!==null&&half===R(values.halfSeTaxCents),'EIC_AWARD_SE_DEDUCTION_CONFLICT','The EIC deductible half-SE total must reconcile to the actual filed-owner Schedule SE adjustments.');
 return {...values,kind:businesses.length?'B':'A',part1Cents:sumMoney(part1),part1DeductionCents:half,part2Cents:sumMoney(part2),ownerSources};
}

function worksheet(source,{year,filingStatus,childCount,combatPayCents}){
 const kind=source.kind,lines={},annual=eicWorksheetAnnual[year],lookup=income=>eicTableLookup(income,{year,filingStatus,qualifyingChildren:childCount}),joint=filingStatus==='marriedJoint';
 const wages=sumMoney([R(source.wageIncomeCents),combatPayCents]);
 let earned=wages;
 if(kind==='B'){
  Object.assign(lines,{'1a':source.part1Cents,'1b':0,'1c':source.part1Cents,'1d':source.part1DeductionCents,'1e':source.part1Cents-source.part1DeductionCents,'2a':0,'2b':source.part2Cents,'2c':source.part2Cents,'3':0,'4a':wages});
  earned=lines['4b']=sumMoney([lines['1e'],lines['2c'],lines['3'],lines['4a']]);
 }
 const comparisonThresholdCents=annual.agiComparisonThresholds[(childCount?2:0)+(joint?1:0)],earnedLookup=lookup(earned),agi=R(source.adjustedGrossIncomeCents);
 const result={kind,year,lines,creditChildrenCount:childCount,earnedIncomeCents:earned,combatPayCents,earnedLookup,agiLookup:null,agiComparison:null,comparisonThresholdCents,ownerSources:source.ownerSources,stop:null};
 const finish=(amountCents,stop=null,noCreditIndicator=false)=>{result.stop=stop;return {amountCents,worksheet:result,noCreditIndicator};};
 if(kind==='B'&&earned<=0)return finish(0,'earned-income-not-positive',true);
 if(kind==='B'&&earned>=earnedLookup.cutoffCents)return finish(0,'earned-income-at-or-above-limit',true);
 lines[kind==='A'?'1':'6']=earned;lines[kind==='A'?'2':'7']=earnedLookup.creditCents;
 if(earnedLookup.creditCents===0){result.agiComparison='earned-credit-zero';return finish(0,'earned-table-credit-zero',true);}
 lines[kind==='A'?'3':'8']=agi;
 let credit=earnedLookup.creditCents;
 if(agi===earned)result.agiComparison='same-as-earned';
 else if(agi<comparisonThresholdCents)result.agiComparison='below-comparison-threshold';
 else{result.agiComparison='compare-AGI';result.agiLookup=lookup(agi);lines[kind==='A'?'5':'10']=result.agiLookup.creditCents;credit=Math.min(credit,result.agiLookup.creditCents);}
 lines[kind==='A'?'6':'11']=credit;return finish(credit);
}

// Eligibility can independently establish a numeric zero at a later step.
// The printed No/27c instruction still depends on reaching that step: Step 1
// AGI precedes SSN, and Step 2 investment precedes Step 3/4 eligibility stops.
function deniedAward(input,context,result,need,limit){
 const facts=context.eligibility.filerFacts,zero={...result,amountCents:0,reason:'reviewed-EIC-ineligible',ineligible:true},agi=nullable(context.adjustedGrossIncomeCents,'EIC federal AGI',{negative:true});
 const incomeScopeKnown=!context.otherTreatments&&facts?.earnedSourcesKnown===true&&facts?.investmentSourcesKnown===true;
 if(!need(agi!==null&&incomeScopeKnown,'EIC_ZERO_STOP_ORDER_UNRESOLVED','The EIC amount is independently zero, but unresolved earlier AGI/source facts prevent asserting a later No/line 27c instruction.'))return zero;
 if(R(agi)>=limit)return {...zero,reason:'AGI-at-or-above-annual-child-count-limit',stoppingStep:1,stoppingQuestion:1};
 const step=facts?.stoppingStep,question=facts?.stoppingQuestion;
 if(!need([1,3,4].includes(step)&&Number.isInteger(question)&&Boolean(facts.firstDenialReason),'EIC_ZERO_STOP_ORDER_UNRESOLVED','Retain the actual first eligibility stopping step before printing an EIC No/line 27c indicator.'))return zero;
 if(step>2){
  const investment=nullable(context.investmentIncomeCents,'EIC investment income');
  if(!need(investment!==null&&context.investmentKnown===true,'EIC_ZERO_STOP_ORDER_UNRESOLVED','The EIC amount is independently zero, but unresolved Step 2 investment income prevents asserting a later No/line 27c instruction.'))return zero;
  if(R(investment)>eicWorksheetAnnual[input.year].investmentLimitCents)return {...zero,reason:'investment-income-exceeds-annual-limit',stoppingStep:2,stoppingQuestion:3};
 }
 return {...zero,noCreditIndicator:facts.noCreditIndicator===true,stoppingStep:step,stoppingQuestion:question};
}

/** Actual annual Worksheets A/B for reviewed ordinary W-2 / Schedule C sources.
 * Eligibility is independently derived by eic-eligibility. A positive combat
 * source creates both lawful owner elections; choosing the larger credit is a
 * user decision, never an implicit mutation or an automatic saved election. */
export function eicAward(input,context={}){
 const eligibility=context.eligibility,diagnostics=[...(eligibility?.diagnostics??[])],need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));return condition;};
 const result={amountCents:null,reason:'eic-award-unresolved',eligibility,allQualifyingChildren:eligibility?.allQualifyingChildren??[],creditChildren:eligibility?.creditChildren??[],worksheet:null,electionCandidates:[],selectedElection:null,selectedCombatPayCents:null,noCreditIndicator:false,ineligible:false,diagnostics};
 if(!eicTableYears.includes(input.year)){need(false,'EIC_AWARD_YEAR_UNAVAILABLE','No final EIC award table and complete annual worksheet pack is installed for this year. Another year’s table was not substituted.');result.reason='annual-EIC-award-unavailable';return result;}
 if(!need(eligibility?.known===true&&typeof eligibility.eligible==='boolean','EIC_AWARD_ELIGIBILITY_UNRESOLVED','Complete the independent EIC eligibility sources before calculating an award.'))return result;
 if(!Array.isArray(eligibility.creditChildren)||!Array.isArray(eligibility.allQualifyingChildren)||eligibility.creditChildren.length>100||eligibility.creditChildren.length>eligibility.allQualifyingChildren.length)throw new Error('EIC qualifying-child derivation is inconsistent.');
 const childCount=Math.min(3,eligibility.creditChildren.length),limit=eicTableLookup(0,{year:input.year,filingStatus:input.individual.filingStatus,qualifyingChildren:childCount}).cutoffCents;
 if(!eligibility.eligible)return deniedAward(input,context,result,need,limit);
 const facts=eligibility.filerFacts;
 need(facts?.earnedSourcesKnown===true,'EIC_AWARD_EARNED_SCOPE_REQUIRED','Review all earned sources, losses, excluded wages and elective income; unsupported earned-income treatments remain unresolved.');
 need(facts?.investmentSourcesKnown===true&&context.investmentKnown===true,'EIC_AWARD_INVESTMENT_SCOPE_REQUIRED','Reconcile the complete EIC investment-income worksheet and actual federal source totals.');
 need(!context.otherTreatments,'EIC_AWARD_OTHER_TREATMENTS','Resolve additional income, loss-limitation and other tax treatments before applying the ordinary EIC worksheet.');
 need(facts?.combatKnown===true,'EIC_AWARD_COMBAT_SOURCE_REQUIRED','Reconcile every owner’s nontaxable combat source and all retained code-Q/child-credit amounts.');
 const source=earnedSources(input,context,need),joint=input.individual.filingStatus==='marriedJoint',owners=joint?['taxpayer','spouse']:['taxpayer'];
 const combat={};for(const owner of owners){combat[owner]=nullable(facts?.combatByOwner?.[owner],`${owner} EIC combat pay`);need(combat[owner]!==null,'EIC_AWARD_COMBAT_SOURCE_REQUIRED','Each applicable owner needs a reviewed combat-pay amount, including an explicit sourced zero.');}
 if(!joint&&facts?.combatByOwner?.spouse)need(false,'EIC_AWARD_COMBAT_OWNER_CONFLICT','Spouse combat pay cannot enter a nonjoint EIC worksheet.');
 if(diagnostics.some(row=>row.severity==='blocking'))return result;
 if(R(source.adjustedGrossIncomeCents)>=limit)return {...result,amountCents:0,reason:'AGI-at-or-above-annual-child-count-limit',ineligible:true,stoppingStep:1,stoppingQuestion:1};
 if(R(source.investmentIncomeCents)>eicWorksheetAnnual[input.year].investmentLimitCents)return {...result,amountCents:0,reason:'investment-income-exceeds-annual-limit',ineligible:true,stoppingStep:2,stoppingQuestion:3};
 const requested=input.individual.earnedIncomeCredit?.award?.combatElections??{},choices=owners.map(owner=>combat[owner]>0?['exclude','include']:['exclude']);
 let combinations=[{}];for(let i=0;i<owners.length;i++)combinations=combinations.flatMap(previous=>choices[i].map(election=>({...previous,[owners[i]]:election})));
 for(const elections of combinations){const combatPayCents=R(sumMoney(owners.map(owner=>elections[owner]==='include'?combat[owner]:0))),computed=worksheet(source,{year:input.year,filingStatus:input.individual.filingStatus,childCount,combatPayCents});result.electionCandidates.push({elections,combatPayCents,...computed});}
 const selected={};let selectionKnown=true;for(const owner of owners){const election=requested[owner];if(election!==undefined&&!['unknown','include','exclude'].includes(election))throw new Error('Choose an explicit supported EIC combat-pay election.');if(combat[owner]===0)selected[owner]='exclude';else if(['include','exclude'].includes(election))selected[owner]=election;else selectionKnown=false;}
 if(!selectionKnown){need(false,'EIC_AWARD_COMBAT_ELECTION_REQUIRED','Compare the lawful combat-pay worksheets and save an include/exclude election for each owner with nontaxable combat pay.');result.reason='combat-election-required';return result;}
 const chosen=result.electionCandidates.find(candidate=>owners.every(owner=>candidate.elections[owner]===selected[owner]));
 return {...result,amountCents:chosen.amountCents,reason:'official-EIC-worksheet-'+chosen.worksheet.kind,worksheet:chosen.worksheet,selectedElection:{elections:chosen.elections,combatPayCents:chosen.combatPayCents,amountCents:chosen.amountCents},selectedCombatPayCents:chosen.combatPayCents,noCreditIndicator:chosen.noCreditIndicator};
}
