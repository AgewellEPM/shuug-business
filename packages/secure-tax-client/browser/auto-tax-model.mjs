import {newReturn,calculationYears,expenseCategories,calculateReturn} from '@shuug/tax-engine';
import {assertAutoTaxScope,autoTaxRecordYear,extractAutoTaxRecords} from './auto-tax-records.mjs';
import {mileageDeduction} from './auto-tax-mileage.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>{throw new Error(message);};
const categories=new Set(expenseCategories.map(([id])=>id));
const operatingVehicleCategories=new Set(['fuel','ev_charging','repairs','maintenance','tires','cleaning','insurance','registration','rental','lease','interest']);
const exact=(value,keys,label)=>{if(!object(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail(label+' has an unsupported format.');};
const validMoney=value=>Number.isSafeInteger(value)&&value>=0&&value<=100_000_000;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const managedId=year=>'auto-gig-business-'+year;
const clone=structuredClone;
function sum(values){const result=values.reduce((total,value)=>total+BigInt(value),0n);if(result>1_000_000_000_000_000n)fail('The app amounts exceed the supported exact calculation bounds.');return Number(result);}

export function newAutoTaxSettings(year){
  if(!Number.isInteger(year)||!calculationYears.includes(year))fail('Choose a supported annual private draft pack; another tax year will not be substituted.');
  return {version:1,baseInput:newReturn('1040',year),incomeConfirmed:false,reviewedSourceDigest:null,businessConfirmed:false,vehicleMethod:'unreviewed',mileageEligible:false,incomeDecisions:{},expenseDecisions:{}};
}
function validateSettings(settings,year){
  exact(settings,['version','baseInput','incomeConfirmed','reviewedSourceDigest','businessConfirmed','vehicleMethod','mileageEligible','incomeDecisions','expenseDecisions'],'Private draft settings');
  if(settings.version!==1||!['incomeConfirmed','businessConfirmed','mileageEligible'].every(key=>typeof settings[key]==='boolean')||!['unreviewed','standard','none'].includes(settings.vehicleMethod)||settings.reviewedSourceDigest!==null&&!digest(settings.reviewedSourceDigest))fail('The private draft review settings are invalid.');
  if(settings.baseInput?.type!=='tax-return'||settings.baseInput.version!==1||settings.baseInput.kind!=='1040'||settings.baseInput.year!==year||!object(settings.baseInput.individual)||!Array.isArray(settings.baseInput.individual.businesses))fail('The manual base return must be a Form 1040 for this exact tax year.');
  const checked=calculateReturn(settings.baseInput);if(!checked.calculationAvailable)fail('The manual base return needs valid source input before it can be updated: '+(checked.diagnostics[0]?.message??'unsupported input'));
  for(const [name,keys]of [['incomeDecisions',['fingerprint','include']],['expenseDecisions',['fingerprint','category','deductibleCents']]]){
    if(!object(settings[name])||Object.keys(settings[name]).length>100000)fail('The private source review map is invalid or exceeds its supported size.');
    for(const row of Object.values(settings[name])){
      exact(row,keys,'App source review');if(!digest(row.fingerprint))fail('Each app source review must bind its exact original content.');
      if(name==='incomeDecisions'&&typeof row.include!=='boolean')fail('Choose an explicit include or exclude decision for the original income source.');
      if(name==='expenseDecisions'&&(!categories.has(row.category)||!Number.isSafeInteger(row.deductibleCents)||row.deductibleCents<0||row.deductibleCents>1_000_000_000_000_000))fail('An expense needs a supported Schedule C category and exact nonnegative reviewed deductible cents.');
    }
  }
}

/** Build only the reserved Schedule C from current client-private app sources.
 * Gross income remains provisional until explicitly reconciled; deductions are
 * zero until an exact original row has an explicit tax-eligible amount review.
 * No private data leaves this function or enters a server-side calculator. */
export async function prepareAutoTaxDraft(records,{scope,year,settings=newAutoTaxSettings(year)}={}){
  assertAutoTaxScope(scope);if(!Number.isInteger(year)||!calculationYears.includes(year))fail('No annual draft pack is installed for the requested year.');
  validateSettings(settings,year);
  const source=await extractAutoTaxRecords(records,{scope}),rows=source.records.filter(row=>autoTaxRecordYear(row)===year),incomeRows=rows.filter(row=>row.kind==='income'),expenseRows=rows.filter(row=>row.kind==='expense'),trips=source.records.filter(row=>row.kind==='trip');
  const issues=[...source.issues],codes=new Set(issues.map(row=>row.code)),issue=(code,message)=>{if(!codes.has(code)){codes.add(code);issues.push({code,message});}};
  const current=settings.reviewedSourceDigest===source.digest;
  if(settings.incomeConfirmed&&!current)issue('APP_SOURCE_CHANGED','App sources changed after the last gross-income review. Reconcile the current originals before confirming this draft again.');
  const currentDecision=(map,row)=>Object.hasOwn(map,row.id)&&map[row.id].fingerprint===row.fingerprint?map[row.id]:null;
  const invalidIncome=incomeRows.some(row=>!validMoney(row.body.amountCents)||row.body.amountCents===0||row.body.currency!=='USD');
  const invalidExpense=expenseRows.some(row=>!validMoney(row.body.amountCents)||row.body.amountCents===0||row.body.currency!=='USD');
  const recordedIncomeCents=invalidIncome?null:sum(incomeRows.map(row=>row.body.amountCents)),recordedExpenseCents=invalidExpense?null:sum(expenseRows.map(row=>row.body.amountCents));
  let duplicateUnresolved=false;
  const duplicateGroups=new Map();
  for(const row of incomeRows){
    const body=row.body;if(!validMoney(body.amountCents)||body.currency!=='USD')continue;
    const keys=['same:'+JSON.stringify([body.date,body.platform,body.amountCents])];
    if(body.bankReference?.transactionId&&body.bankReference?.provider)keys.push('bank:'+JSON.stringify([body.bankReference.provider,body.bankReference.transactionId]));
    for(const key of keys){const group=duplicateGroups.get(key)??[];group.push(row);duplicateGroups.set(key,group);}
  }
  for(const [key,group]of duplicateGroups)if(group.length>1){
    const decisions=group.map(row=>currentDecision(settings.incomeDecisions,row));
    if(decisions.some(row=>!row)||key.startsWith('bank:')&&decisions.filter(row=>row?.include).length>1){
      duplicateUnresolved=true;issue('APP_DUPLICATE_INCOME','Possible duplicate app income shares a bank transaction or the same date, platform and amount. Review every candidate; the same bank transaction cannot be included twice.');
    }
  }
  const staleIncome=incomeRows.some(row=>Object.hasOwn(settings.incomeDecisions,row.id)&&!currentDecision(settings.incomeDecisions,row));
  if(staleIncome)issue('APP_INCOME_REVIEW_STALE','An income include/exclude decision describes older source content and was not reused. Review that row again before confirming income.');
  const selectedIncome=incomeRows.filter(row=>validMoney(row.body.amountCents)&&row.body.currency==='USD'&&currentDecision(settings.incomeDecisions,row)?.include!==false);
  const provisionalReceipts=sum(selectedIncome.map(row=>row.body.amountCents));
  const positiveTripFares=rows.some(row=>row.kind==='trip'&&row.body.classification!=='personal'&&Number.isSafeInteger(row.body.earningsCents)&&row.body.earningsCents>0);
  const missingGross=positiveTripFares&&incomeRows.length===0;
  if(positiveTripFares)issue('APP_TRIP_FARES_SEPARATE','Recorded trip fares remain separate from entered income. They were not added to payouts, deposits or the Schedule C receipts source.');
  if(missingGross)issue('APP_GROSS_SOURCE_REQUIRED','Trips contain recorded fares but no reconciled income records for this year. Add the original gross-income sources; a zero receipts figure cannot be confirmed from these trips.');
  const incomeConfirmed=settings.incomeConfirmed&&current&&!source.issues.length&&!invalidIncome&&!duplicateUnresolved&&!staleIncome&&!missingGross;
  if(!incomeConfirmed)issue('APP_GROSS_REVIEW_REQUIRED','Confirm that current entered USD income reconciles all gross business receipts, refunds, provider fees, payouts and deposits without duplication. Entered amounts alone do not establish gross receipts.');

  const entityConflict=source.intakes.some(row=>(row.taxYear===null||row.taxYear===year)&&['partnership','corporation','s-corporation','c-corporation','1120','1120S','1065'].includes(row.businessType));
  const businessConfirmed=settings.businessConfirmed&&!entityConflict;
  if(entityConflict)issue('APP_ENTITY_UNSUPPORTED','The app intake identifies a partnership or corporation. Its records cannot be routed into the taxpayer’s sole-proprietor Schedule C. Correct or separately prepare the original business arrangement.');
  if(!businessConfirmed)issue('APP_BUSINESS_REVIEW_REQUIRED','Confirm that these records belong to this taxpayer’s sole-proprietor gig business. The app account and default individual filing status do not establish tax ownership or entity treatment.');

  let expensesKnown=!invalidExpense;
  const groupedExpenses=new Map();
  for(const row of expenseRows){
    const decision=currentDecision(settings.expenseDecisions,row),body=row.body;
    if(!decision){
      if(body.classification!=='personal'){expensesKnown=false;issue('APP_EXPENSE_REVIEW_REQUIRED','Review the Schedule C category and tax-eligible cents for each business or unclassified expense. Gross spending, meal labels and planning percentages are not automatic deductions.');}
      if(Object.hasOwn(settings.expenseDecisions,row.id)){expensesKnown=false;issue('APP_EXPENSE_REVIEW_STALE','An expense changed after its tax-eligible amount review. The previous deduction was not reused.');}
      continue;
    }
    if(!validMoney(body.amountCents)||body.currency!=='USD'){expensesKnown=false;continue;}
    const share=body.businessUsePercent===undefined?body.amountCents:Number.isInteger(body.businessUsePercent)&&body.businessUsePercent>=0&&body.businessUsePercent<=100?Number(BigInt(body.amountCents)*BigInt(body.businessUsePercent)/100n):null;
    if(share===null||decision.deductibleCents>share||body.classification==='personal'&&decision.deductibleCents>0){expensesKnown=false;issue('APP_EXPENSE_AMOUNT_CONFLICT','A reviewed deduction exceeds its original amount or recorded business-use share, or contradicts a personal classification. Correct the source or review before using it.');continue;}
    if(decision.deductibleCents>0&&(decision.category==='vehicle'||operatingVehicleCategories.has(body.category))){expensesKnown=false;issue(settings.vehicleMethod==='standard'?'APP_VEHICLE_DOUBLE_COUNT':'APP_ACTUAL_VEHICLE_UNSUPPORTED','Actual vehicle operating costs need a separate reviewed expense-method and asset workpaper. This app bridge supports verified standard mileage or no vehicle deduction; review an explicit zero exclusion here. Tolls and parking still need their own separate eligible amount.');continue;}
    if(decision.deductibleCents>0){const values=groupedExpenses.get(decision.category)??[];values.push(decision.deductibleCents);groupedExpenses.set(decision.category,values);}
  }
  const businessDistanceMeters=rows.filter(row=>row.kind==='trip'&&row.body.classification==='business'&&Number.isFinite(row.body.distanceMeters)&&row.body.distanceMeters>=0).reduce((total,row)=>total+row.body.distanceMeters,0);
  let mileage=null,mileageKnown=true;
  if(settings.vehicleMethod==='standard'){
    mileage=mileageDeduction(trips,year,{eligible:settings.mileageEligible&&current});
    if(mileage.amountCents===null){mileageKnown=false;for(const row of mileage.issues)issue('APP_MILEAGE_'+row.code.toUpperCase().replaceAll('-','_'),row.message);}
    else if(mileage.amountCents>0)groupedExpenses.set('vehicle',[mileage.amountCents]);
  }else if(settings.vehicleMethod==='unreviewed'&&businessDistanceMeters>0){mileageKnown=false;issue('APP_VEHICLE_METHOD_REQUIRED','Review standard-mileage eligibility for the recorded business trips, or explicitly choose no standard-mileage claim. No planning cost per mile or unverified annual rate was used.');}
  const expenses=[...groupedExpenses].sort(([a],[b])=>a.localeCompare(b)).map(([category,values])=>({category,amountCents:sum(values),description:'Client-reviewed app sources for '+year+(category==='vehicle'&&settings.vehicleMethod==='standard'?' — verified standard-mileage calculation':'')}));
  const knownDeductions=expensesKnown&&mileageKnown&&!source.issues.length;
  const provisionalDeductions=sum(expenses.map(row=>row.amountCents));
  const input=clone(settings.baseInput),id=managedId(year),existing=input.individual.businesses.find(row=>row.id===id),other=input.individual.businesses.filter(row=>row.id!==id);
  let identityReview=source.issues.some(row=>['APP_PROFILE_NAME_INVALID','APP_PROFILE_NAME_CONFLICT'].includes(row.code));
  if(source.profileName!==null){
    if(!input.party.name.trim()){input.party.name=source.profileName;input.review.identity=false;}
    else if(input.party.name!==source.profileName){identityReview=true;issue('APP_PROFILE_IDENTITY_REVIEW','The entered return name differs from the encrypted client profile’s legal name. The entered name was preserved; review the original identity sources.');}
  }
  if(identityReview)input.review.identity=false;
  if(input.individual.businesses.filter(row=>row.id===id).length>1||other.some(row=>row.id?.startsWith('auto-gig-business-')))fail('Keep exactly one managed gig business for this tax year; prior-year managed businesses cannot be copied into another return.');
  if(other.length>=5)fail('The current annual pack supports at most five Schedule C activities. Preserve the manual businesses and review a separate supported arrangement before adding this managed activity.');
  if(existing?.owner&&existing.owner!=='taxpayer'||existing?.inventory!==undefined)fail('This managed app business supports taxpayer-owned gig work without inventory. Keep spouse or inventory activities in separately reviewed manual businesses.');
  const business={id,owner:'taxpayer',name:'Gig work',ein:'',businessCode:'',materialParticipation:false,fullyAtRisk:false,...(existing??{}),receiptsCents:provisionalReceipts,returnsCents:0,costOfGoodsCents:0,otherIncomeCents:0,expenses};
  input.individual.businesses=[...other,business];
  const automatic=[];
  if(identityReview)automatic.push('auto-tax:identity-review');
  if(!incomeConfirmed)automatic.push('auto-tax:income-review');if(!businessConfirmed)automatic.push('auto-tax:business-review');if(!expensesKnown)automatic.push('auto-tax:expense-review');if(!mileageKnown)automatic.push('auto-tax:mileage-review');if(source.issues.length)automatic.push('auto-tax:source-conflict');
  input.features=[...input.features.filter(value=>!value.startsWith('auto-tax:')),...automatic];
  const checked=calculateReturn(input);if(!checked.calculationAvailable)fail('The updated private draft cannot be represented by the current annual engine: '+(checked.diagnostics[0]?.message??'unsupported input'));
  const returnIssues=checked.diagnostics.filter(row=>row.severity==='blocking').map(({code,message})=>({code,message}));
  for(const row of returnIssues)if(!issues.some(existing=>existing.code===row.code&&existing.message===row.message))issues.push(row);
  const receiptsCents=incomeConfirmed?provisionalReceipts:null,deductionsCents=knownDeductions?provisionalDeductions:null,profitCents=businessConfirmed&&receiptsCents!==null&&deductionsCents!==null?receiptsCents-deductionsCents:null;
  return {year,input,source,totals:{recordedIncomeCents,recordedExpenseCents,businessDistanceMeters,receiptsCents,deductionsCents,profitCents},issues,returnIssues,incomeConfirmed,businessConfirmed,...(mileage?{mileage}:{})};
}
