import {diagnostic} from './model.mjs';
import {sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';
import {validateNYEic} from './state-ny-eic-model.mjs';
import {nyEicYears,nyNoncustodialAnnual,nyOrdinaryEic,nyCityEicRate} from './state-ny-eic-calculation.mjs';
import {nyEicIncomeSources} from './state-ny-eic-sources.mjs';
import {nyNoncustodialEic} from './state-ny-eic-noncustodial.mjs';
export * from './state-ny-eic-model.mjs';
export {nyEicYears} from './state-ny-eic-calculation.mjs';

/** Full-year ordinary IT-215 plus separately sourced IT-209. The caller supplies
 * independently calculated IT-201 lines39/40/33, not a combined post-credit tax.
 * Separate-state filings, resident/accumulation credits and partial-year city
 * allocation retain explicit unknowns until their own packs are implemented. */
export function calculateNYEic(input,state,federal,context={}){
 const diagnostics=[],need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));return Boolean(condition);},source=state.earnedIncomeCredit===undefined?null:validateNYEic(state.earnedIncomeCredit),eic=federal.earnedIncomeCredit,main=federal.forms?.find(row=>row.form==='f1040')?.lines??{},federalAmount=eic?.amountCents;
 const result={known:false,stateCreditCents:null,ordinaryStateCreditCents:null,cityCreditCents:null,noncustodialCreditCents:null,selectedKind:null,lines:{},flags:{},worksheetA:null,worksheetB:null,cityWorksheet:null,children:[],businessIdentifier:null,noncustodial:null,diagnostics,forms:[]};
 if(!nyEicYears.includes(input.year)){need(false,'NY_EIC_YEAR','No reviewed New York EIC annual form/calculation pack is installed for this year.');return result;}
 const income=nyEicIncomeSources(input,state,federal,source),nc=result.noncustodial=nyNoncustodialEic(input,state,federal,source,income);diagnostics.push(...nc.diagnostics);
 const nyc=state.locality==='nyc',localityKnown=context.localityKnown===true&&['none','nyc','yonkers'].includes(state.locality),federalKnown=Number.isSafeInteger(federalAmount)&&federalAmount>=0;
 if(!federalKnown)need(false,'NY_EIC_FEDERAL_UNRESOLVED','Complete the actual federal EIC amount before the New York ordinary and NYC credits are known.');
 if(federalKnown&&federalAmount===0){result.ordinaryStateCreditCents=0;if(localityKnown)result.cityCreditCents=0;result.flags['1']=false;}
 if(!localityKnown)need(false,'NY_EIC_LOCALITY','Resolve full-year NYC/Yonkers/nonlocal residency before the NYC earned-income credit is known.');else if(!nyc)result.cityCreditCents=0;
 if(federalKnown&&federalAmount>0){
  const start=diagnostics.length;need(source?.source?.trim()&&source.review.federal&&source.review.filing,'NY_EIC_SOURCE_REVIEW','Review the current federal award, original state return and unchanged filing/residency sources before claiming IT-215.');
  need(state.residency==='resident'&&state.review?.residency&&source?.filingStatus==='sameAsFederal'&&source?.returnType==='original','NY_EIC_FILING_SCOPE','This state credit pack supports full-year original returns with matching federal/state filing status. Separate-state or amended treatment needs additional source workflow.');
  need(income.known,'NY_EIC_INCOME_UNRESOLVED','Reconcile all ordinary income and wage/business source links before preparing IT-215.');diagnostics.push(...income.diagnostics);
  const selected=eic.selectedCombatPayCents,printedCombat=Object.hasOwn(main,'1i')?main['1i']:0,printedEic=main[input.year>=2025?'27a':'27'];
  need(eic.eligibility?.known===true&&eic.eligibility.eligible===true&&eic.worksheet?.year===input.year&&['A','B'].includes(eic.worksheet.kind)&&Number.isSafeInteger(selected)&&selected===printedCombat&&printedEic===federalAmount,'NY_EIC_FEDERAL_AWARD_LINK','Use the current computed federal EIC worksheet, printed credit and exact saved owner combat election; an entered total alone is insufficient.');
  result.children=(eic.eligibility?.creditChildren?.length?eic.eligibility.creditChildren:eic.eligibility?.attachmentChildren??[]).map(row=>({...row}));need(result.children.every(row=>row.ssnEligible===true),'NY_EIC_CHILD_IDENTIFIER_SCOPE','A federal self-only award with an attached child lacking a valid SSN needs separate New York identifier treatment; no state credit is inferred.');
  if(income.known&&Number.isSafeInteger(selected)){
   const wages=sumMoney([income.wagesCents,selected]),business=eic.worksheet?.kind==='B'?sumMoney(['1e','2c','3'].map(key=>eic.worksheet.lines[key]??0)):0;
   need(eic.worksheet?.lines?.[eic.worksheet?.kind==='A'?'1':'4a']===wages&&business===income.businessIncomeCents,'NY_EIC_FEDERAL_WORKSHEET_CONFLICT','The federal EIC wage/combat and business worksheet must match the same retained source calculation.');
   need(income.investmentIncomeCents<=nyNoncustodialAnnual[input.year].investmentLimitCents,'NY_EIC_INVESTMENT_CONFLICT','The positive federal award conflicts with represented investment income above the annual New York limit.');
   result.worksheetA={lines:{'1':income.wagesCents,'2':selected,'3':wages}};Object.assign(result.lines,{'6':wages,'7':0,'8':income.businessIncomeCents,'9':income.federalAgiCents,'10':federalAmount});result.businessIdentifier=income.businessIdentifier;
  }
  const ordinarySourceKnown=diagnostics.length===start;
  Object.assign(result.flags,{'1':true,'2':income.known?income.investmentIncomeCents>nyNoncustodialAnnual[input.year].investmentLimitCents:null,'3':input.individual.filingStatus==='marriedSeparate'&&eic.eligibility?.filerFacts.separatedSpouse===true,'4':result.children.length>0,'5':false});
  if(ordinarySourceKnown&&localityKnown&&nyc&&Number.isSafeInteger(context.nyAgiCents)){const rate=nyCityEicRate(context.nyAgiCents,{year:input.year});result.cityCreditCents=P(federalAmount,rate.rateBasisPoints);result.cityWorksheet={...rate,worksheetCLines:{'1':federalAmount,'2':rate.rateBasisPoints,'3':result.cityCreditCents}};result.lines['27']=result.cityCreditCents;}
  else if(ordinarySourceKnown&&localityKnown&&nyc)need(false,'NY_EIC_CITY_AGI','Resolve actual New York AGI before the NYC EIC rate worksheet.');
  const worksheetKnown=need(source?.review.worksheetB&&source.worksheetBCredits==='none'&&!state.unsupportedTreatments?.includes('otherJurisdictionCredit'),'NY_EIC_WORKSHEET_B_CREDITS','Review the actual absence of resident and available accumulation-distribution credits. Positive or unresolved amounts need their supporting credit forms; no zero is assumed.');
  const baseKnown=need(Number.isSafeInteger(context.stateTaxBeforeCreditsCents)&&context.stateTaxBeforeCreditsCents>=0&&Number.isSafeInteger(context.householdCreditCents)&&context.householdCreditCents>=0,'NY_EIC_WORKSHEET_B_TAX','Resolve IT-201 line39 before credits and line40 household credit independently of other child/local credits.');
  if(ordinarySourceKnown&&worksheetKnown&&baseKnown){const computed=nyOrdinaryEic({year:input.year,federalEicCents:federalAmount,stateTaxBeforeCreditsCents:context.stateTaxBeforeCreditsCents,householdCreditCents:context.householdCreditCents,nyc:false});result.ordinaryStateCreditCents=computed.stateCreditCents;Object.assign(result.lines,computed.lines);result.worksheetB=computed.worksheetB;}
 }
 if(nc.known&&result.ordinaryStateCreditCents!==null){const useNc=nc.amountCents>result.ordinaryStateCreditCents;result.selectedKind=useNc?'noncustodial':result.ordinaryStateCreditCents>0?'ordinary':'none';result.stateCreditCents=useNc?0:result.ordinaryStateCreditCents;result.noncustodialCreditCents=useNc?nc.amountCents:0;}
 else if(!nc.known)need(false,'NY_IT209_ALTERNATIVE_UNRESOLVED','Complete the separate noncustodial-parent exclusion or award before selecting New York line65 versus line66.');
 result.known=[result.stateCreditCents,result.noncustodialCreditCents,result.cityCreditCents].every(Number.isSafeInteger);
 const printableChildren=result.children.every(row=>row.firstName?.trim()&&row.lastName?.trim()&&/^\d{9}$/.test(String(row.taxId??'').replace(/\D/g,''))&&Number.isInteger(row.usHomeMonths)&&row.usHomeMonths>=0&&row.usHomeMonths<=12);
 if(nc.eligible===true&&printableChildren){
  const lines={...nc.lines},flags={...nc.flags,'33':federalKnown?federalAmount>0:null,'34':result.children.length>0,'44':localityKnown?nyc:null};
  if(federalKnown&&federalAmount>0){Object.assign(lines,{'35':federalAmount,'37':result.lines['12']??null,'38':result.worksheetB?.lines['5']??null,'39':result.lines['13']??null,'40':result.lines['14']??null,'41':result.lines['15']??null,'42':result.ordinaryStateCreditCents,'43':nc.amountCents});if(result.worksheetB)for(const [line,key]of [['38a','1'],['38b','2'],['38c','3'],['38d','4'],['38e','5']])lines[line]=result.worksheetB.lines[key];}
  if(localityKnown&&nyc)lines['45']=result.cityCreditCents;
  result.forms.push({form:'nyit209',copyId:'NY-noncustodial-EIC',state:'NY',lines,eic:{...result,flags,forms:[]}});
 }else if(federalKnown&&federalAmount>0&&printableChildren)result.forms.push({form:'nyit215',copyId:'NY-EIC',state:'NY',lines:result.lines,eic:{...result,forms:[]}});
 result.known=[result.stateCreditCents,result.noncustodialCreditCents,result.cityCreditCents].every(Number.isSafeInteger);return result;
}
