import {strictObject,text,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R} from './money.mjs';
import {federalYearRules} from './federal-years.mjs';

const decisions=['unknown','yes','no'];
const person=()=>({dateOfBirth:'',blind:'unknown',canBeClaimed:'unknown',deceased:'unknown',dateOfDeath:'',source:'',reviewed:false});
export const newIndividualEligibility=()=>({taxpayer:person(),spouse:{...person(),noGrossIncome:'unknown',filingReturn:'unknown'},residency:'unknown',returnPeriod:'unknown',deductionChoice:'unknown',spouseItemizes:'unknown',review:{status:false,earnedIncome:false},source:''});
export const standardDeductionAnnual=Object.freeze(Object.fromEntries(Object.entries({
 2023:{dependentFloorCents:125000,earnedAdditionCents:40000,marriedAdditionCents:150000,unmarriedAdditionCents:185000},
 2024:{dependentFloorCents:130000,earnedAdditionCents:45000,marriedAdditionCents:155000,unmarriedAdditionCents:195000},
 2025:{dependentFloorCents:135000,earnedAdditionCents:45000,marriedAdditionCents:160000,unmarriedAdditionCents:200000},
 2026:{dependentFloorCents:135000,earnedAdditionCents:45000,marriedAdditionCents:165000,unmarriedAdditionCents:205000},
 2027:{dependentFloorCents:140000,earnedAdditionCents:50000,marriedAdditionCents:170000,unmarriedAdditionCents:210000},
}).map(([year,value])=>[year,Object.freeze(value)])));
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>=1800&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const need=(diagnostics,condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));return condition;};
function validatePerson(value,spouse=false){
 strictObject(value,Object.keys(spouse?newIndividualEligibility().spouse:person()),'Federal eligibility person');
 for(const key of ['dateOfBirth','dateOfDeath'])text(value[key],key,10);text(value.source,'Eligibility source',1000);
 for(const key of ['blind','canBeClaimed','deceased',...(spouse?['noGrossIncome','filingReturn']:[])])if(!decisions.includes(value[key]))throw new Error('Federal eligibility decisions require yes, no or unknown.');
 if(typeof value.reviewed!=='boolean')throw new Error('Federal person source review must be a recorded decision.');
}

/** Age is attained the day before the birthday; a decedent must attain it by
 * death, not the end of the calendar year. This does not establish SSN or other
 * Schedule 1-A eligibility. */
export function eligibilityAge(value,year){
 federalYearRules(year);const diagnostics=[];
 if(!value)return {known:false,age65:null,diagnostics:[diagnostic('STANDARD_PERSON_SOURCE_REQUIRED','Enter and review the taxpayer or spouse birth and death source facts.')]};
 const birthValid=date(value.dateOfBirth)&&value.dateOfBirth<=`${year}-12-31`;
 need(diagnostics,birthValid,'STANDARD_BIRTH_DATE_REQUIRED','Enter a valid birth date no later than the tax year end.');
 need(diagnostics,value.reviewed===true&&typeof value.source==='string'&&Boolean(value.source.trim()),'STANDARD_PERSON_SOURCE_REQUIRED','Review and retain the birth, death, blindness and dependency source facts.');
 need(diagnostics,['yes','no'].includes(value.deceased),'STANDARD_DEATH_STATUS_REQUIRED','Review whether this person died during the tax year.');
 const died=value.deceased==='yes';
 if(died)need(diagnostics,date(value.dateOfDeath)&&value.dateOfDeath.slice(0,4)===String(year)&&value.dateOfDeath>=value.dateOfBirth,'STANDARD_DEATH_DATE_REQUIRED','A final-return age determination requires a valid death date in this tax year, no earlier than birth.');
 else if(value.dateOfDeath)need(diagnostics,false,'STANDARD_DEATH_SOURCE_CONFLICT','A retained death date conflicts with the recorded living status. Reconcile the original source.');
 if(diagnostics.length)return {known:false,age65:null,diagnostics};
 const birthday=new Date(value.dateOfBirth+'T00:00:00Z');birthday.setUTCFullYear(birthday.getUTCFullYear()+65);birthday.setUTCDate(birthday.getUTCDate()-1);
 const attained=birthday.toISOString().slice(0,10),asOf=died?value.dateOfDeath:`${year}-12-31`;
 return {known:true,age65:attained<=asOf,attained65Date:attained,asOf,diagnostics};
}

export function standardDeduction(value,{year,filingStatus,wagesCents=0,businessProfitCents=0,seAdjustmentCents=0,incomeKnown=false,stateReturns=[]}={}){
 const base=federalYearRules(year).standardDeductions[filingStatus],annual=standardDeductionAnnual[year];if(base===undefined)throw new Error('Choose a supported federal filing status.');
 const diagnostics=[],empty={known:false,deductionCents:null,earnedIncomeCents:null,worksheet:null,flags:{},persons:{},diagnostics};
 if(value===undefined){diagnostics.push(diagnostic('STANDARD_ELIGIBILITY_REQUIRED','Complete federal age, blindness, claimability, residency and standard-deduction eligibility. Missing facts are not treated as no.'));return empty;}
 strictObject(value,Object.keys(newIndividualEligibility()),'Federal deduction eligibility');validatePerson(value.taxpayer);validatePerson(value.spouse,true);
 strictObject(value.review,['status','earnedIncome'],'Federal eligibility reviews');for(const key of ['status','earnedIncome'])if(typeof value.review[key]!=='boolean')throw new Error('Federal eligibility reviews must be recorded decisions.');
 text(value.source,'Federal eligibility source',1000);
 for(const [key,options]of Object.entries({residency:['unknown','fullYearCitizenOrResident','nonresident','dualStatus'],returnPeriod:['unknown','fullYear','deathShortYear','accountingShortYear'],deductionChoice:['unknown','standard','itemized'],spouseItemizes:decisions}))if(!options.includes(value[key]))throw new Error('Choose a supported federal eligibility treatment.');
 need(diagnostics,value.review.status&&Boolean(value.source.trim()),'STANDARD_STATUS_REVIEW','Review the filing status, standard-versus-itemized choice, annual residency and return period against retained sources.');
 need(diagnostics,value.residency==='fullYearCitizenOrResident','STANDARD_RESIDENCY_UNRESOLVED','The supported standard deduction requires full-year U.S. citizen/resident treatment. Nonresident, dual-status and treaty/election exceptions require separate source work.');
 need(diagnostics,value.deductionChoice==='standard','STANDARD_DEDUCTION_CHOICE','Review and select the standard deduction. Itemized or undecided deductions require Schedule A work before the return deduction is known.');
 need(diagnostics,value.returnPeriod==='fullYear'||value.returnPeriod==='deathShortYear'&&value.taxpayer.deceased==='yes','STANDARD_RETURN_PERIOD_UNRESOLVED','Use a reviewed full calendar year or a decedent’s final period. Accounting-period short returns and inconsistent death periods require separate work.');
 const joint=filingStatus==='marriedJoint',separate=filingStatus==='marriedSeparate',persons={taxpayer:eligibilityAge(value.taxpayer,year)};diagnostics.push(...persons.taxpayer.diagnostics);
 need(diagnostics,value.taxpayer.blind!=='unknown'&&value.taxpayer.canBeClaimed!=='unknown','STANDARD_PERSON_DECISIONS','Review taxpayer blindness and whether someone can claim this taxpayer, whether or not they actually claim them.');
 let spouseAdditional=false;
 if(separate){
  need(diagnostics,value.spouseItemizes==='no','STANDARD_SPOUSE_ITEMIZES','A separate return requires a reviewed spouse itemization decision. If the spouse itemizes, no standard deduction is allowed; complete the required itemized-deduction treatment.');
  const excluded=value.spouse.noGrossIncome==='no'||value.spouse.filingReturn==='yes'||value.spouse.canBeClaimed==='yes';
  spouseAdditional=!excluded&&value.spouse.noGrossIncome==='yes'&&value.spouse.filingReturn==='no'&&value.spouse.canBeClaimed==='no';
  need(diagnostics,excluded||spouseAdditional,'STANDARD_SEPARATE_SPOUSE_REVIEW','Determine whether the separate-return spouse had no gross income, is not filing a return, and cannot be claimed by another taxpayer before determining spouse age/blindness additions.');
 }
 if(joint||spouseAdditional){persons.spouse=eligibilityAge(value.spouse,year);diagnostics.push(...persons.spouse.diagnostics);need(diagnostics,value.spouse.blind!=='unknown'&&value.spouse.canBeClaimed!=='unknown','STANDARD_SPOUSE_DECISIONS','Review the applicable spouse blindness and claimability decisions.');}
 if(!separate&&value.spouseItemizes==='yes')need(diagnostics,false,'STANDARD_SPOUSE_ITEMIZES_CONFLICT','A spouse separate-return itemization decision conflicts with this filing status.');
 for(const state of stateReturns.filter(row=>row?.state==='NY')){
  for(const [key,owner]of [['taxpayerDob','taxpayer'],...(['marriedJoint','marriedSeparate'].includes(filingStatus)?[['spouseDob','spouse']]:[])])if(state[key])need(diagnostics,state[key]===value[owner].dateOfBirth,'STANDARD_STATE_BIRTH_CONFLICT','The federal birth date and retained New York source birth date differ. Reconcile both sources before using deductions.');
  if(['yes','no'].includes(state.claimedDependent))need(diagnostics,state.claimedDependent===value.taxpayer.canBeClaimed,'STANDARD_STATE_DEPENDENCY_CONFLICT','New York and federal taxpayer claimability answers differ. Reconcile the source facts before using deductions.');
 }
 const dependent=value.taxpayer.canBeClaimed==='yes'||joint&&value.spouse.canBeClaimed==='yes';
 let earned=null;
 if(dependent){
  need(diagnostics,value.review.earnedIncome&&incomeKnown,'STANDARD_EARNED_INCOME_UNRESOLVED','The dependent worksheet requires all earned income and the self-employment adjustment to be resolved. This path supports represented wages and Schedule C income/loss only; other earned sources need their own source treatment.');
  checkedMoney(wagesCents,'Dependent worksheet wages');checkedMoney(businessProfitCents,'Dependent worksheet business income',{negative:true});checkedMoney(seAdjustmentCents,'Dependent worksheet SE adjustment');
  if(value.review.earnedIncome&&incomeKnown)earned=sumMoney([R(wagesCents),R(businessProfitCents),-R(seAdjustmentCents)]);
 }
 const flags={taxpayerClaimable:persons.taxpayer.known&&value.taxpayer.canBeClaimed==='yes',spouseClaimable:joint&&persons.spouse?.known===true&&value.spouse.canBeClaimed==='yes',taxpayerAge65:persons.taxpayer.age65===true,taxpayerBlind:persons.taxpayer.known&&value.taxpayer.blind==='yes',spouseAge65:persons.spouse?.age65===true,spouseBlind:persons.spouse?.known===true&&value.spouse.blind==='yes',spouseItemizes:value.review.status&&separate&&value.spouseItemizes==='yes',dualStatus:value.review.status&&value.residency==='dualStatus'};
 const boxCount=['taxpayerAge65','taxpayerBlind','spouseAge65','spouseBlind'].filter(key=>flags[key]).length,additionalUnit=['single','headOfHousehold'].includes(filingStatus)?annual.unmarriedAdditionCents:annual.marriedAdditionCents;
 const limitedBase=dependent?(earned===null?null:Math.min(base,Math.max(annual.dependentFloorCents,sumMoney([earned,annual.earnedAdditionCents])))):base,addition=boxCount*additionalUnit;
 const worksheet={dependent,earnedIncomeCents:earned,earnedAdditionCents:annual.earnedAdditionCents,dependentFloorCents:annual.dependentFloorCents,filingStatusLimitCents:base,limitedBaseCents:limitedBase,boxCount,additionalUnitCents:additionalUnit,additionalCents:addition};
 return {known:diagnostics.length===0,deductionCents:diagnostics.length||limitedBase===null?null:sumMoney([limitedBase,addition]),earnedIncomeCents:earned,worksheet,flags,persons,diagnostics};
}
