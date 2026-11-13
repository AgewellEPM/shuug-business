import {strictObject,list,text,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R} from './money.mjs';
import {ctYears,ctTaxCalculation,ctPropertyTaxCredit} from './state-ct-rates.mjs';
import {calculateNYResident,nyYears} from './state-ny.mjs';
import {ctRetirementAdjustments} from './state-ct-retirement.mjs';

export const ctReviews=Object.freeze([
 ['residency','Full-year Connecticut residency, matching federal filing status and spouse residency reviewed'],
 ['adjustments','All Connecticut additions/subtractions and their annual worksheets reviewed'],
 ['withholding','All Connecticut W-2/1099 withholding statements reconciled'],
 ['payments','Estimated, prior-year-applied and extension payments reconciled'],
 ['credits','Property-tax eligibility and all other Connecticut credit/AMT requirements reviewed'],
 ['filingCharges','No late-payment interest, late penalty or estimated-tax underpayment charge is required'],
 ['coverage','No unlisted Connecticut treatment, dependent schedule or supplemental form is required'],
].map(Object.freeze));
export const ctAdjustmentLines=Object.freeze([
 ['31','Non-Connecticut state/local bond interest','add'],['32','Non-Connecticut municipal mutual-fund interest','add'],['33','Lump-sum distributions omitted from federal AGI','add'],['34','Positive fiduciary adjustment','add'],['35','Connecticut bond loss','add'],['36','Federal bonus-depreciation add-back','add'],['36a','80% federal Section 179 add-back','add'],['37','Other additions (describe)','add'],
 ['39','U.S. government obligation interest','subtract'],['40','Qualifying U.S. government mutual-fund dividends','subtract'],['41','Reviewed Social Security worksheet adjustment','subtract'],['42','State/local income-tax refunds in federal AGI','subtract'],['43','Railroad retirement benefits','subtract'],['44','Military retirement pay','subtract'],['45','50% Connecticut teachers retirement income','subtract'],['46','Negative fiduciary adjustment (positive amount)','subtract'],['47','Connecticut bond gain','subtract'],['48','Eligible CHET contributions/carryforward','subtract'],['48a','Prior federal bonus-depreciation add-backs','subtract'],['48b','Reviewed pension/annuity/IRA worksheet adjustment','subtract'],['48c','Eligible licensed cannabis business deductions','subtract'],['48d','Eligible ABLE contributions (2024–2025)','subtract'],['49','Other subtractions (describe)','subtract'],
].map(Object.freeze));
export const ctUnsupportedTreatments=Object.freeze([
 ['otherJurisdiction','Income-tax credit for another jurisdiction / Schedule 2'],['alternativeMinimumTax','Connecticut alternative minimum tax / CT-6251'],['earnedIncomeCredit','Connecticut earned income tax credit / CT-EITC'],['passThroughCredit','Pass-through entity tax credit / CT-PE'],['claimOfRight','Claim-of-right credit / CT-1040CRC'],['otherCredit','Other income-tax or historic-home credits'],['dependents','Dependent information / CT-Dependent'],['chet','CHET account disclosure or refund contribution / CT-CHET'],['lateOrEstimatedCharges','Late-payment charges or estimated-tax underpayment / CT-2210'],['amended','Amended return / CT-1040X'],['other','Another treatment or required attachment outside this resident pack'],
].map(Object.freeze));
export function newCTStateReturn(){return {state:'CT',residency:'resident',town:'',townZip:'',adjustments:[],withholdings:[],propertyTaxes:[],useTax:{onePercentCents:0,generalCents:0,luxuryCents:0,vesselsCents:0,source:'',reviewed:false},estimatedPaymentsCents:0,priorYearAppliedCents:0,extensionPaymentCents:0,nextYearAppliedCents:0,unsupportedTreatments:[],review:Object.fromEntries(ctReviews.map(([key])=>[key,false]))};}
export const newCTAdjustment=()=>({line:'31',amountCents:0,source:'',description:'',reviewed:false});
export const newCTWithholding=()=>({payer:'',payerId:'',wagesCents:0,withholdingCents:0,source:'',reviewed:false});
export const newCTPropertyTax=()=>({kind:'residence',town:'',description:'',paidDates:'',amountCents:0,source:'',reviewed:false});
export const stateJurisdictions=Object.freeze('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
export const stateCoverage=year=>stateJurisdictions.map(state=>{const installed=state==='CT'&&ctYears.includes(year)||state==='NY'&&nyYears.includes(year);return {state,year,status:installed?'resident-scope':'not-installed',description:installed?`${state==='CT'?'CT-1040':'IT-201 / IT-2'} full-year resident calculation and draft forms; additional schedules remain limited.`:'No reviewed annual state calculation/form pack is installed.'};});
const emptySummary=()=>({adjustedGrossIncomeCents:null,incomeTaxCents:null,propertyTaxCreditCents:null,useTaxCents:null,totalTaxCents:null,paymentsCents:null,refundCents:null,amountOwedCents:null});
const validDate=(date,year)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date.slice(0,4)===String(year)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
const flags=(value,keys,label)=>{strictObject(value,keys,label);for(const key of keys)if(typeof value[key]!=='boolean')throw new Error(`${label} requires explicit yes/no values.`);};
function sourceReview(row,label,diagnostics){text(row.source,`${label} source`,500);if(typeof row.reviewed!=='boolean')throw new Error(`${label} review must be explicit.`);const ready=row.reviewed&&row.source.trim().length>0;if(!ready)diagnostics.push(diagnostic('CT_SOURCE_REVIEW',`${label} requires its source reference and eligibility/amount review.`));return ready;}
function validatedCT(value,year,status,diagnostics){
 strictObject(value,[...Object.keys(newCTStateReturn()),'retirement'],'Connecticut resident return');
 if(!['resident','partYear','nonresident'].includes(value.residency))throw new Error('Choose the Connecticut residency classification.');
 text(value.town,'Connecticut town',70);text(value.townZip,'Connecticut town ZIP',10);if(value.townZip&&!/^\d{5}(?:-\d{4})?$/.test(value.townZip))throw new Error('Connecticut town ZIP must have five or nine digits.');
 flags(value.review,ctReviews.map(([key])=>key),'Connecticut review');for(const [key,label]of ctReviews)if(!value.review[key])diagnostics.push(diagnostic('CT_REVIEW_'+key.toUpperCase(),label+'.',{field:`individual.stateReturns.CT.review.${key}`}));
 for(const key of ['estimatedPaymentsCents','priorYearAppliedCents','extensionPaymentCents','nextYearAppliedCents'])checkedMoney(value[key],`Connecticut ${key}`);
 const lines={},seen=new Set();let adjustmentsKnown=value.review.adjustments,withholdingKnown=value.review.withholding,propertyKnown=value.review.credits;
 for(const row of list(value.adjustments,'Connecticut adjustments',ctAdjustmentLines.length)){
  strictObject(row,Object.keys(newCTAdjustment()),'Connecticut adjustment');const definition=ctAdjustmentLines.find(([line])=>line===row.line);if(!definition||seen.has(row.line))throw new Error('Choose each Connecticut adjustment line at most once.');seen.add(row.line);text(row.description,'Connecticut adjustment description',300);checkedMoney(row.amountCents,'Connecticut adjustment amount');
  if(row.line==='48d'&&year===2023){diagnostics.push(diagnostic('CT_ANNUAL_ADJUSTMENT','ABLE subtraction line 48d is not in the 2023 CT-1040 pack.'));adjustmentsKnown=false;}
  if(['37','49'].includes(row.line)&&!row.description.trim()){diagnostics.push(diagnostic('CT_ADJUSTMENT_DESCRIPTION','Other Connecticut additions/subtractions require a specific explanation.'));adjustmentsKnown=false;}
  if(row.line==='48'&&year===2023&&row.amountCents){diagnostics.push(diagnostic('CT_CHET_DISCLOSURE','The 2023 CHET subtraction requires the account-number disclosure, which is not populated by this resident pack.'));adjustmentsKnown=false;}
  if(['48','48d'].includes(row.line)&&row.amountCents>(['marriedJoint','survivingSpouse'].includes(status)?1000000:500000)){diagnostics.push(diagnostic('CT_CONTRIBUTION_LIMIT','CHET/ABLE subtraction exceeds the annual filing-status limit; reconcile eligible contributions and carryforward.'));adjustmentsKnown=false;}
  adjustmentsKnown=sourceReview(row,`Connecticut line ${row.line}`,diagnostics)&&adjustmentsKnown;lines[row.line]=year===2023&&row.line==='48d'?null:R(row.amountCents);
 }
 const withholdings=list(value.withholdings,'Connecticut withholding statements',100);
 for(const [index,row]of withholdings.entries()){
  strictObject(row,Object.keys(newCTWithholding()),'Connecticut withholding statement');for(const key of ['payer','payerId'])text(row[key],`Connecticut withholding ${key}`);for(const key of ['wagesCents','withholdingCents'])checkedMoney(row[key]);
  if(!row.payer.trim()||!/^\d{9}$/.test(row.payerId.replaceAll('-',''))){withholdingKnown=false;diagnostics.push(diagnostic('CT_WITHHOLDING_ID',`Connecticut withholding statement ${index+1} needs the payer name and nine-digit EIN/payer ID.`));}
  withholdingKnown=sourceReview(row,`Connecticut withholding statement ${index+1}`,diagnostics)&&withholdingKnown;
 }
 if(withholdings.length>5){withholdingKnown=false;diagnostics.push(diagnostic('CT_WITHHOLDING_SUPPLEMENT','More than five withholding statements require Schedule CT-1040WH, which is not populated by this resident pack. All source statements are preserved.'));}
 seen.clear();const propertyTaxes=list(value.propertyTaxes,'Connecticut property-tax records',3);
 for(const row of propertyTaxes){
  strictObject(row,Object.keys(newCTPropertyTax()),'Connecticut property-tax record');if(!['residence','auto1','auto2'].includes(row.kind)||seen.has(row.kind))throw new Error('Use one record per eligible residence/vehicle.');seen.add(row.kind);for(const key of ['town','description','paidDates'])text(row[key],`Property-tax ${key}`,key==='description'?180:70);checkedMoney(row.amountCents,'Qualifying property tax paid');
  const dates=row.paidDates.split(',').map(date=>date.trim());if(!row.town.trim()||!row.description.trim()||dates.length>2||dates.some(date=>!validDate(date,year))){propertyKnown=false;diagnostics.push(diagnostic('CT_PROPERTY_DETAILS','Qualifying property taxes require the town, property description and up to two actual payment dates in this tax year (YYYY-MM-DD, comma separated).'));}
  if(row.kind==='auto2'&&!['marriedJoint','survivingSpouse'].includes(status)){propertyKnown=false;diagnostics.push(diagnostic('CT_PROPERTY_VEHICLE_LIMIT','Only a joint return or qualifying surviving spouse may claim a second motor vehicle.'));}
  propertyKnown=sourceReview(row,`Connecticut property tax (${row.kind})`,diagnostics)&&propertyKnown;
 }
 const use=value.useTax;strictObject(use,Object.keys(newCTStateReturn().useTax),'Connecticut use tax');for(const key of ['onePercentCents','generalCents','luxuryCents','vesselsCents'])checkedMoney(use[key]);text(use.source,'Use-tax worksheet reference',500);if(typeof use.reviewed!=='boolean')throw new Error('Connecticut use-tax review must be explicit.');const useTaxCents=R(sumMoney([use.onePercentCents,use.generalCents,use.luxuryCents,use.vesselsCents])),useKnown=use.reviewed&&(useTaxCents===0||Boolean(use.source.trim()));if(!useKnown)diagnostics.push(diagnostic('CT_USE_TAX_REVIEW','Review all taxable purchases, rate assignments, tax already paid and the Connecticut Individual Use Tax Worksheet; explicitly confirm zero when no use tax is due.'));
 const treatments=list(value.unsupportedTreatments,'Connecticut additional treatments',30);for(const treatment of treatments)text(treatment,'Connecticut treatment',200);if(new Set(treatments).size!==treatments.length)throw new Error('Select each Connecticut treatment once.');
 for(const treatment of treatments)diagnostics.push(diagnostic('CT_ADDITIONAL_TREATMENT',`Connecticut treatment requires a schedule/calculation outside this pack: ${treatment}. Affected state totals are unknown; no zero treatment was substituted.`));
 return {lines,adjustmentsKnown,withholdingKnown,propertyKnown,useKnown,useTaxCents};
}
export function calculateCTResident(input,value,federalResult){
 const {year}=input,status=input.individual.filingStatus,diagnostics=[],summary=emptySummary(),result={state:'CT',year,summary,calculation:null,propertyCredit:null,lines:{},diagnostics,forms:[]};
 const valid=validatedCT(value,year,status,diagnostics),lines=result.lines=valid.lines;
 if(!ctYears.includes(year)){diagnostics.push(diagnostic('CT_YEAR_UNAVAILABLE',`No reviewed Connecticut resident calculation/form pack is installed for ${year}.`));return result;}
 if(value.residency!=='resident'){diagnostics.push(diagnostic('CT_RESIDENCY_UNSUPPORTED','Nonresident and part-year returns require CT-1040NR/PY and allocation schedules. This CT-1040 resident pack does not calculate them.'));return result;}
 if(status==='marriedSeparate'&&(!input.individual.spouseName?.trim()||!/^\d{9}$/.test(input.individual.spouseTaxId?.replaceAll('-','')??'')))diagnostics.push(diagnostic('CT_SEPARATE_SPOUSE_IDENTITY','Connecticut married-filing-separately status requires the spouse name and Social Security number on the resident form.'));
 if(year===2023)diagnostics.push(diagnostic('CT_SOURCE_DRAFT_MARK','The 2023 CT-1040 PDF currently linked by DRS carries its original DRAFT 12-12-2023 mark. It is preserved in this review packet; a verified final filing template remains required.'));
 result.retirement=ctRetirementAdjustments(input,value,federalResult);diagnostics.push(...result.retirement.diagnostics);Object.assign(lines,result.retirement.lines);valid.adjustmentsKnown&&=result.retirement.known;
 const agiKnown=federalResult.adjustedGrossIncomeKnown===true&&Number.isSafeInteger(federalResult.summary?.adjustedGrossIncomeCents),known=agiKnown&&valid.adjustmentsKnown&&value.review.residency;
 if(!agiKnown)diagnostics.push(diagnostic('CT_FEDERAL_AGI_UNRESOLVED','Resolve the federal adjusted gross income before Connecticut AGI and income tax can be calculated.'));
 lines['1']=agiKnown?R(federalResult.summary.adjustedGrossIncomeCents):null;
 lines['38']=valid.adjustmentsKnown?sumMoney(ctAdjustmentLines.filter(([, ,kind])=>kind==='add').map(([line])=>lines[line]??0)):null;
 lines['50']=valid.adjustmentsKnown?sumMoney(ctAdjustmentLines.filter(([, ,kind])=>kind==='subtract').map(([line])=>lines[line]??0)):null;
 lines['2']=lines['38'];lines['3']=lines['1']===null||lines['2']===null?null:sumMoney([lines['1'],lines['2']]);lines['4']=lines['50'];lines['5']=known?sumMoney([lines['3'],-lines['4']]):null;
 if(known)result.calculation=ctTaxCalculation(lines['5'],{year,filingStatus:status});
 lines['6']=result.calculation?.incomeTaxCents??null;
 const dependentSchedule=federalResult.dependents?.required===true;
 if(dependentSchedule&&!value.unsupportedTreatments.includes('dependents'))diagnostics.push(diagnostic('CT_DEPENDENT_SCHEDULE_REQUIRED','Federal dependent intake requires Connecticut dependent disclosure and related credit review. Schedule CT-Dependent is not populated by this resident pack; completing federal Schedule 8812 does not complete the state requirement.'));
 const ordinary=!dependentSchedule&&value.unsupportedTreatments.length===0&&value.review.coverage&&value.review.credits;
 const federalEicZero=federalResult.earnedIncomeCredit?.amountCents===0;if(!federalEicZero)diagnostics.push(diagnostic('CT_FEDERAL_EIC_UNRESOLVED','Federal EIC is unresolved or positive. Complete Schedule CT-EITC and CT-1040 line 20a before Connecticut payments, refund or balance are known. A general state credit review does not establish a zero federal credit.'));
 for(const line of ['7','9','13','20a','20b','20c',...(year>=2024?['20d']:[])])lines[line]=ordinary?0:null;
 if(!federalEicZero)lines['20a']=null;
 lines['8']=ordinary?lines['6']:null;lines['10']=lines['8'];
 if(known&&ordinary&&valid.propertyKnown)result.propertyCredit=ctPropertyTaxCredit(lines['5'],sumMoney(value.propertyTaxes.map(row=>R(row.amountCents))),lines['10'],{year,filingStatus:status});
 const property=result.propertyCredit;lines['11']=property?.allowedCreditCents??null;lines['12']=lines['10']===null||lines['11']===null?null:Math.max(0,lines['10']-lines['11']);lines['14']=ordinary?lines['12']:null;
 for(const [line,key]of [['69a','onePercentCents'],['69b','generalCents'],['69c','luxuryCents'],['69d','vesselsCents']])lines[line]=valid.useKnown?R(value.useTax[key]):null;
 lines['69']=valid.useKnown?sumMoney(['69a','69b','69c','69d'].map(line=>lines[line])):null;lines['15']=lines['69'];lines['16']=lines['14']===null||lines['15']===null?null:sumMoney([lines['14'],lines['15']]);lines['17']=lines['16'];
 lines['18']=valid.withholdingKnown?sumMoney(value.withholdings.map(row=>R(row.withholdingCents))):null;lines['19']=value.review.payments?R(sumMoney([value.estimatedPaymentsCents,value.priorYearAppliedCents])):null;lines['20']=value.review.payments?R(value.extensionPaymentCents):null;
 lines['21']=ordinary&&federalEicZero&&lines['18']!==null&&lines['19']!==null&&lines['20']!==null?sumMoney([lines['18'],lines['19'],lines['20']]):null;
 const settlementKnown=lines['17']!==null&&lines['21']!==null;lines['22']=settlementKnown?Math.max(0,lines['21']-lines['17']):null;lines['23']=R(value.nextYearAppliedCents);lines['24']=0;lines['24a']=0;
 const excessApplication=lines['22']!==null&&lines['23']>lines['22'];if(excessApplication)diagnostics.push(diagnostic('CT_OVERPAYMENT_APPLICATION','The amount applied to next year exceeds the calculated Connecticut overpayment.'));
 lines['25']=lines['22']===null||excessApplication||!value.review.filingCharges?null:lines['22']-lines['23'];lines['26']=settlementKnown?Math.max(0,lines['17']-lines['21']):null;for(const line of ['27','28','29'])lines[line]=ordinary&&value.review.filingCharges?0:null;lines['30']=lines['27']===null?null:lines['26'];
 if(property&&lines['10']>0&&value.propertyTaxes.length){for(const row of value.propertyTaxes)lines[{residence:'60',auto1:'61',auto2:'62'}[row.kind]]=R(row.amountCents);Object.assign(lines,{'63':property.paidCents,'65':property.limitedPaidCents,'67':property.phaseOutCents,'68':property.allowedCreditCents});}
 Object.assign(summary,{adjustedGrossIncomeCents:lines['5'],incomeTaxCents:lines['6'],propertyTaxCreditCents:lines['11'],useTaxCents:lines['15'],totalTaxCents:lines['16'],paymentsCents:lines['21'],refundCents:lines['25'],amountOwedCents:lines['30']});
 result.forms.push({form:'ct1040',copyId:'CT-resident',state:'CT',lines,withholdings:value.withholdings,adjustments:value.adjustments,propertyTaxes:value.propertyTaxes,calculation:result.calculation,propertyCredit:property});return result;
}
export function calculateStateReturns(input,federalResult){
 const values=input.individual?.stateReturns;if(values===undefined)return {states:[],forms:[],diagnostics:[]};const seen=new Set(),states=[];
 for(const value of list(values,'State returns',51)){
  if(!value||typeof value!=='object'||Array.isArray(value)||!stateJurisdictions.includes(value.state)||seen.has(value.state))throw new Error('Choose each U.S. state or District of Columbia at most once.');seen.add(value.state);
  if(value.state==='CT')states.push(calculateCTResident(input,value,federalResult));
  else if(value.state==='NY'&&value.residency!==undefined)states.push(calculateNYResident(input,value,federalResult));
  else states.push({state:value.state,year:input.year,summary:emptySummary(),forms:[],diagnostics:[diagnostic(value.state==='NY'?'NY_SOURCE_INPUT_REQUIRED':'STATE_PACK_UNAVAILABLE',value.state==='NY'?'Complete the New York residency and source inputs before calculating the saved state requirement.':`No reviewed ${input.year} ${value.state} state calculation/form pack is installed. Its preserved inputs require completion outside this pack.`)]});
 }
 return {states,forms:states.flatMap(state=>state.forms),diagnostics:states.flatMap(state=>state.diagnostics)};
}
