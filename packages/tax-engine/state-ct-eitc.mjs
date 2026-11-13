import {diagnostic} from './model.mjs';
import {checkedMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';
import {normalizedTaxId} from './taxpayer-identifiers.mjs';
import {ctEitcReviews,validateCTEarnedIncomeCredit} from './state-ct-eitc-model.mjs';
export {newCTEarnedIncomeCredit,newCTEitcWage,newCTEitcBusiness,ctEitcReviews} from './state-ct-eitc-model.mjs';

export const ctEitcYears=Object.freeze([2023,2024,2025]);
export const ctEitcAnnual=Object.freeze({2023:Object.freeze({rateBps:4000,investmentLimitCents:1100000,supplementCents:0,federalLine:'27'}),2024:Object.freeze({rateBps:4000,investmentLimitCents:1160000,supplementCents:0,federalLine:'27'}),2025:Object.freeze({rateBps:4000,investmentLimitCents:1195000,supplementCents:25000,federalLine:'27a'})});
const relationCodes={child:1,adoptedChild:1,stepchild:1,nieceNephew:2,grandchild:3,fosterChild:4,sibling:5};
const sourced=row=>Boolean(row?.reviewed&&row.source?.trim());
const nineDigits=value=>/^\d{9}$/.test(normalizedTaxId(value));

// This is an unresolved state supplement question, not an award of $250.
// Income-disqualified federal zeros have no successful annual worksheet.
export function ctEicZeroChildSupplementUnresolved(year,eic){return year===2025&&eic?.amountCents===0&&eic.eligibility?.known===true&&eic.eligibility.eligible===true&&eic.eligibility.creditChildren?.length>0&&eic.worksheet?.earnedIncomeCents>0&&eic.worksheet.earnedIncomeCents<eic.worksheet.earnedLookup?.cutoffCents;}

function stateIdentifier(row,key,need,label){
 const value=row[key].trim();need(row.stateIdStatus!=='unknown','CT_EITC_STATE_ID_REVIEW',`${label}: reconcile the actual original state identifier, including an explicit source showing none.`);
 need(row.stateIdStatus==='provided'?Boolean(value):!value,'CT_EITC_STATE_ID_CONFLICT',`${label}: the state identifier and its presence decision disagree.`);
 return row.stateIdStatus==='provided'?value:'';
}
function childrenFromFederal(eic,input,need){
 const eligibility=eic.eligibility,children=eligibility?.creditChildren??[],all=eligibility?.allQualifyingChildren??[];
 need(Array.isArray(children)&&Array.isArray(all),'CT_EITC_CHILD_SOURCES','Retain the complete computed federal qualifying-child records.');
 if(!Array.isArray(children)||!Array.isArray(all))return [];
 need(all.length===children.length&&all.every(row=>children.some(child=>child.id===row.id)),'CT_EITC_CHILD_SSN_TREATMENT','A federal qualifying child without a timely valid SSN requires a separately resolved Connecticut treatment; neither the child supplement nor a childless state result is assumed.');
 const seen=new Set();return children.map(row=>{
  const original=(input.individual.dependents??[]).find(child=>child.id===row.id),matches=original&&['firstName','middleInitial','lastName','taxId','dateOfBirth','relationship'].every(key=>(original[key]??'')===(row[key]??''));
  need(matches&&!seen.has(row.id)&&row.ssnEligible===true&&nineDigits(row.taxId),'CT_EITC_CHILD_IDENTITY','Each state EITC child must reconcile to one current federal identity with a timely valid SSN.');seen.add(row.id);
  need(Number.isInteger(row.usHomeMonths)&&row.usHomeMonths>=7&&row.usHomeMonths<=12&&Boolean(relationCodes[row.relationship]),'CT_EITC_CHILD_DISCLOSURE','Use actual federal EIC calendar months and the supported state relationship code.');
  const ageBranch=!(row.age<19&&row.younger===true);
  return {id:row.id,firstName:row.firstName,middleInitial:row.middleInitial??'',lastName:row.lastName,taxId:normalizedTaxId(row.taxId),birthYear:row.dateOfBirth?.slice(0,4),relationship:row.relationship,relationshipCode:relationCodes[row.relationship]??null,months:row.usHomeMonths,student:ageBranch&&row.studentYounger===true,disabled:ageBranch&&row.studentYounger!==true&&row.disabled===true};
 });
}
function wageSources(value,input,ctState,need){
 const wages=input.individual.w2s??[],usedWithholding=new Set(),retained=ctState.withholdings??[],zeroMatches=[];
 need(value.wageSources.length===wages.length&&wages.every(wage=>value.wageSources.some(row=>row.w2Id===wage.id)),'CT_EITC_WAGE_COMPLETENESS','Link and review every original W-2 once, including wages with no Connecticut withholding.');
 const rows=value.wageSources.map(row=>{
  const wage=wages.find(item=>item.id===row.w2Id),federalId=normalizedTaxId(row.employerFederalId),stateId=stateIdentifier(row,'employerStateId',need,'W-2 '+row.w2Id);
  need(Boolean(wage)&&sourced(row)&&nineDigits(federalId),'CT_EITC_WAGE_SOURCE','Each wage source needs its current W-2 link, original employer EIN and explicit review.');
  if(!wage)return {...row,employerFederalId:federalId,employerStateId:stateId,wagesCents:null,owner:null,employer:''};
  checkedMoney(wage.wagesCents,'Original W-2 wages');
  for(const state of input.individual.stateReturns??[])for(const ny of state.state==='NY'?(state.wageRecords??[]):[])if(ny.w2Id===row.w2Id&&ny.payerId)need(normalizedTaxId(ny.payerId)===federalId,'CT_EITC_WAGE_ID_CONFLICT','Retained state and Connecticut EITC employer identifiers differ for the same W-2.');
  const matching=retained.map((item,index)=>({item,index})).filter(({item})=>normalizedTaxId(item.payerId)===federalId&&item.wagesCents===wage.wagesCents);
  if(row.ctWithholdingCents>0){
   const match=matching.find(({item,index})=>!usedWithholding.has(index)&&item.withholdingCents===row.ctWithholdingCents&&sourced(item));
   need(Boolean(match),'CT_EITC_WITHHOLDING_RECONCILIATION','Each positive W-2 Connecticut withholding source must reconcile to a distinct reviewed CT-1040 statement with the same EIN, wages and withholding.');if(match)usedWithholding.add(match.index);
  }else zeroMatches.push(matching);
  return {...row,owner:wage.owner,employer:wage.employer,employerFederalId:federalId,employerStateId:stateId,wagesCents:R(wage.wagesCents)};
 });
 for(const matching of zeroMatches)need(!matching.some(({item,index})=>item.withholdingCents>0&&!usedWithholding.has(index)),'CT_EITC_WITHHOLDING_CONFLICT','A no-Connecticut-withholding answer conflicts with a retained statement for the same employer and wages.');
 return rows;
}
function businessSources(value,input,federalResult,need){
 const businesses=input.individual.businesses??[],calculated=(federalResult.forms??[]).filter(item=>item.form==='f1040sc');
 need(value.businessSources.length===businesses.length&&businesses.every(business=>value.businessSources.some(row=>row.businessId===business.id)),'CT_EITC_BUSINESS_COMPLETENESS','Link and review every original Schedule C business; a missing source is not zero income.');
 return value.businessSources.map(row=>{
  const original=businesses.find(item=>item.id===row.businessId),computed=calculated.find(item=>item.copyId===row.businessId),stateId=stateIdentifier(row,'ctTaxRegistrationNumber',need,'Business '+row.businessId);
  const federalId=normalizedTaxId(original?.ein?.trim()||(original?.owner==='spouse'?input.individual.spouseTaxId:input.party.taxId)),income=computed?.lines?.['31'];
  need(Boolean(original)&&sourced(row)&&nineDigits(federalId),'CT_EITC_BUSINESS_SOURCE','Each business disclosure needs its original business link, reviewed state registration source and EIN, or the actual owner SSN when the business has no EIN.');
  need(Boolean(computed)&&computed.owner===original?.owner&&Number.isSafeInteger(income)&&!computed.incomeUnknown,'CT_EITC_BUSINESS_INCOME','The state business amount must come from the matching, resolved federal Schedule C line31.');
  return {...row,owner:original?.owner??null,name:original?.name??'',federalId,ctTaxRegistrationNumber:stateId,incomeCents:Number.isSafeInteger(income)?income:null};
 });
}

/** Ordinary original CT resident EITC. All credit/income amounts are derived
 * from the same federal return; source review never supplies an override. */
export function calculateCTEitc(input,ctState,federalResult){
 const year=input.year,eic=federalResult.earnedIncomeCredit,value=ctState.earnedIncomeCredit,diagnostics=[];
 const result={required:value!==undefined||eic?.amountCents!==0,known:false,eligible:null,amountCents:null,lines:{},rateBps:4000,ratioBps:null,questions:{federalCreditClaimed:null,investmentOverLimit:null,alreadyFiled:null,qualifyingChildren:null,wagesWithoutCtWithholding:null,selfEmployed:null,jointFederalSeparateState:null,supplementChild:null},children:[],wageSources:[],printedWageSources:[],businessSources:[],forms:[],diagnostics};
 let failures=0;const need=(condition,code,message)=>{if(!condition){failures++;diagnostics.push(diagnostic(code,message));}return Boolean(condition);};
 if(value!==undefined)validateCTEarnedIncomeCredit(value);
 if(!need(ctEitcYears.includes(year),'CT_EITC_YEAR_UNAVAILABLE','No reviewed CT-EITC calculation and annual schedule pack is installed for this year.'))return result;
 if(ctEicZeroChildSupplementUnresolved(year,eic)){result.required=true;need(false,'CT_EIC_ZERO_CHILD_SUPPLEMENT_REVIEW','A zero federal table cell inside the qualifying-child income range does not resolve the 2025 CT child supplement. Neither $250 nor zero is assumed.');return result;}
 if(year===2025&&eic?.amountCents===0&&eic.eligibility?.known&&eic.eligibility.eligible&&eic.eligibility.allQualifyingChildren.length>eic.eligibility.creditChildren.length&&eic.worksheet?.earnedIncomeCents>0&&eic.worksheet.earnedIncomeCents<eic.worksheet.earnedLookup?.cutoffCents){result.required=true;need(false,'CT_EITC_CHILD_SSN_TREATMENT','A zero self-only federal table result with a qualifying child lacking a valid SSN does not resolve the 2025 state child supplement.');return result;}
 if(eic?.amountCents===0)return {...result,required:value!==undefined,known:true,eligible:false,amountCents:0};
 if(!need(Number.isSafeInteger(eic?.amountCents)&&eic.amountCents>0,'CT_FEDERAL_EIC_UNRESOLVED','Complete the same-year federal EIC before computing the Connecticut credit.'))return result;
 checkedMoney(eic.amountCents,'Federal earned income credit');result.lines['8']=eic.amountCents;
 need(eic.eligibility?.known===true&&eic.eligibility.eligible===true&&eic.worksheet?.year===year,'CT_EITC_FEDERAL_SOURCE','A positive state credit requires the complete same-year federal eligibility and selected annual worksheet.');
 need(federalResult.adjustedGrossIncomeKnown===true&&federalResult.summary?.earnedIncomeCreditCents===eic.amountCents,'CT_EITC_FEDERAL_RECONCILIATION','Federal source income and the saved federal EIC summary must reconcile before the state credit is known.');
 result.children=childrenFromFederal(eic,input,need);
 if(!need(value!==undefined,'CT_EITC_SOURCE_REQUIRED','Complete the original Connecticut EITC source review and linked wage/business disclosures.'))return result;
 need(Boolean(value.source.trim()),'CT_EITC_SOURCE_REQUIRED','Retain the original Connecticut EITC evidence reference.');
 for(const [key,label]of ctEitcReviews)need(value.review[key],'CT_EITC_REVIEW_'+key.toUpperCase(),label+'.');
 need(ctState.residency==='resident'&&ctState.review?.residency===true,'CT_EITC_RESIDENCY','This credit requires reviewed full-year Connecticut residency; part-year and nonresident returns do not qualify.');
 need(value.returnStatus==='original','CT_EITC_ORIGINAL_RETURN','Confirm that this is an original Connecticut return. Already-filed returns require CT-1040X, outside this pack.');
 need(value.filingStatus==='sameAsFederal','CT_EITC_SEPARATE_ALLOCATION','Confirm matching federal/state filing status. Joint-federal/separate-state returns require separately reconstructed AGI and the line12–15 allocation; no ratio is inferred.');
 result.wageSources=wageSources(value,input,ctState,need);result.printedWageSources=result.wageSources.filter(row=>row.ctWithholdingCents===0&&row.wagesCents>0);result.businessSources=businessSources(value,input,federalResult,need);
 const mixed=result.printedWageSources.length>0&&(ctState.withholdings??[]).some(row=>row.withholdingCents>0);
 need(!mixed,'CT_EITC_MIXED_WITHHOLDING_REVIEW','Mixed Connecticut-withholding and no-withholding sources need resolved Schedule CT-EITC line6 disclosure treatment. All linked statements are retained.');
 need(result.printedWageSources.length<=3&&result.businessSources.length<=3,'CT_EITC_INCOME_CONTINUATION','The annual schedule has three wage and three primary-business rows. Every source is retained; additional income-row disclosure requires a reviewed continuation/selection treatment.');
 Object.assign(result.questions,{federalCreditClaimed:true,investmentOverLimit:false,alreadyFiled:value.returnStatus==='unknown'?null:value.returnStatus==='alreadyFiled',qualifyingChildren:result.children.length>0,wagesWithoutCtWithholding:mixed?null:result.printedWageSources.length>0,selfEmployed:result.businessSources.length>0,jointFederalSeparateState:value.filingStatus==='sameAsFederal'?false:null,supplementChild:year===2025?result.children.length>0:null});
 if(failures)return result;
 result.known=true;result.eligible=true;result.lines['10']=P(eic.amountCents,4000);if(year===2025)result.lines['15a']=result.children.length?25000:0;
 result.amountCents=result.lines['16']=result.lines['10']+(result.lines['15a']??0);
 result.forms.push({form:'ct1040eitc',copyId:'CT-EITC',state:'CT',lines:result.lines,rateBps:result.rateBps,ratioBps:null,questions:result.questions,children:result.children,wageSources:result.wageSources,printedWageSources:result.printedWageSources,businessSources:result.businessSources});
 return result;
}
