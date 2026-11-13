import {strictObject,list,text,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio} from './money.mjs';

export const ctRetirementKinds=Object.freeze([['ordinary','Ordinary qualifying employer pension'],['military','Eligible military retirement or survivor benefits'],['teachers','Connecticut Teachers Retirement System'],['other','Other / eligibility unresolved']].map(Object.freeze));
export const newCTRetirement=()=>({distributions:[],source:'',reviewed:false});
export const newCTRetirementDistribution=distributionId=>({distributionId,kind:'other',teacherElection:'unknown',source:'',reviewed:false});
const managed=['41','43','44','45','48b'];

// CT-1040 instructions: 2023 pp. 9–10/24, 2024 pp. 9–10/24/28,
// 2025 pp. 9–10/24–25. Annual sources are pinned in data/ct-sources.json.
export function ctPensionFactor(year,status,agiCents){
 checkedMoney(agiCents,'Federal AGI',{negative:true});
 if(![2023,2024,2025].includes(year)||!['single','marriedSeparate','headOfHousehold','marriedJoint'].includes(status))return null;
 const joint=status==='marriedJoint',agi=R(agiCents),start=(joint?100000:75000)*100;
 if(agi<start)return 10000;if(year===2023)return 0;
 const bounds=joint?[105000,110000,115000,120000,125000,130000,140000,150000]:[77500,80000,82500,85000,87500,90000,95000,100000];
 const index=bounds.findIndex(limit=>agi<limit*100);return index<0?0:[8500,7000,5500,4000,2500,1000,500,250][index];
}
export function ctSocialSecurityAdjustment({year,filingStatus,agiCents,taxableCents,worksheet,livedApartAllYear}){
 if(![2023,2024,2025].includes(year)||!Number.isSafeInteger(agiCents)||!Number.isSafeInteger(taxableCents))return null;
 const threshold=['single','marriedSeparate'].includes(filingStatus)?7500000:10000000;
 if(R(agiCents)<threshold)return {method:'below-threshold',F:R(taxableCents)};
 if(!worksheet||!Number.isSafeInteger(worksheet['1']))return null;
 const A=worksheet['1'];if(A<=0)return {A,F:0};
 const B=worksheet[filingStatus==='marriedSeparate'&&livedApartAllYear==='no'?'7':'9'];
 if(!Number.isSafeInteger(B))return null;if(B<=0)return {A,B,F:0};
 const C=Math.min(A,B),D=wholeRatio(C,2500),E=R(taxableCents);return {A,B,C,D,E,F:Math.max(0,E-D)};
}

export function ctRetirementAdjustments(input,state,federal){
 const value=state.retirement,empty={required:false,known:true,lines:{},diagnostics:[],sources:[],socialSecurity:null,pension:null};if(value===undefined)return empty;
 strictObject(value,Object.keys(newCTRetirement()),'Connecticut retirement worksheet');text(value.source,'Connecticut retirement source',1000);if(typeof value.reviewed!=='boolean')throw new Error('Connecticut retirement review must be explicit.');
 const result={...empty,required:true},diagnostics=result.diagnostics,need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));};
 need(value.reviewed&&Boolean(value.source.trim()),'CT_RETIREMENT_REVIEW','Review all federal retirement sources, Connecticut eligibility and elections, and retain the worksheet source reference.');
 const {year,individual}=input,status=individual.filingStatus,retirement=federal.retirement,source=individual.retirementIncome,rows=source?.distributions??[],details=retirement?.details??[];
 const agi=federal.summary?.adjustedGrossIncomeCents;
 need([2023,2024,2025].includes(year),'CT_RETIREMENT_YEAR','No Connecticut retirement worksheet is installed for this year.');
 need(federal.adjustedGrossIncomeKnown===true&&Number.isSafeInteger(agi)&&!retirement?.incomeUnknown,'CT_RETIREMENT_FEDERAL_UNRESOLVED','Resolve federal AGI and the federal retirement worksheets before calculating Connecticut retirement adjustments.');
 const linked=new Map();for(const row of list(value.distributions,'Connecticut pension classifications',100)){
  strictObject(row,Object.keys(newCTRetirementDistribution('')),'Connecticut pension classification');text(row.distributionId,'Federal distribution identifier',100);text(row.source,'Connecticut pension source',1000);
  if(!row.distributionId||linked.has(row.distributionId)||!ctRetirementKinds.some(([key])=>key===row.kind)||!['unknown','pension','teacher50'].includes(row.teacherElection)||typeof row.reviewed!=='boolean')throw new Error('Choose unique federal distribution links and explicit Connecticut pension classifications.');
  linked.set(row.distributionId,row);need(rows.some(source=>source.id===row.distributionId),'CT_RETIREMENT_STALE_LINK','A Connecticut classification refers to a removed federal distribution. Reconcile the saved source link.');
 }
 const totals={ira:0,ordinary:0,military:0,teacher50:0,teacherPension:0},teacherChoices=new Map();
 for(const row of rows){
  const detail=details.find(item=>item.id===row.id),classification=linked.get(row.id),taxable=detail?.taxableCents;
  need(Number.isSafeInteger(taxable),'CT_RETIREMENT_SOURCE_UNRESOLVED','Every Connecticut distribution must reconcile to a calculated federal taxable source amount.');
  if(['traditionalIRA','rothIRA'].includes(row.plan)){
   need(!classification,'CT_RETIREMENT_IRA_CLASSIFICATION','IRA eligibility follows the federal IRA source; remove an incompatible employer-pension classification.');
   if(row.plan==='traditionalIRA'&&Number.isSafeInteger(taxable))totals.ira=sumMoney([totals.ira,taxable]);continue;
  }
  need(Boolean(classification?.reviewed&&classification.source.trim())&&classification.kind!=='other','CT_PENSION_CLASSIFICATION','Classify each employer pension using its source: ordinary qualifying plan, eligible military pay, or Connecticut Teachers Retirement System.');
  if(!classification)continue;
  need(row.plan==='qualifiedPlan','CT_PENSION_PLAN_UNSUPPORTED','This federal pension/annuity source has no supported Connecticut eligibility mapping.');
  need(classification.kind==='teachers'||classification.teacherElection==='unknown','CT_TEACHER_STALE_ELECTION','A teacher election is saved on a different pension classification.');
  if(classification.kind==='teachers'){
   need(classification.teacherElection!=='unknown','CT_TEACHER_ELECTION','Choose either the 50% teachers subtraction or the annual pension subtraction for this recipient; both cannot apply to the same income.');
   if(teacherChoices.has(row.owner))need(teacherChoices.get(row.owner)===classification.teacherElection,'CT_TEACHER_ELECTION_CONFLICT','Use one Connecticut teachers election for each recipient.');teacherChoices.set(row.owner,classification.teacherElection);
  }
  const key=classification.kind==='teachers'?(classification.teacherElection==='teacher50'?'teacher50':'teacherPension'):classification.kind;
  if(Object.hasOwn(totals,key)&&Number.isSafeInteger(taxable))totals[key]=sumMoney([totals[key],taxable]);
  result.sources.push({distributionId:row.id,owner:row.owner,kind:classification.kind,teacherElection:classification.teacherElection,taxableCents:taxable??null,source:classification.source});
 }
 const benefits=source?.benefits??[];
 need(!benefits.some(row=>row.form==='RRB-1099'),'CT_RAILROAD_ALLOCATION_REQUIRED','Railroad Social Security equivalent benefits require a separately reviewed federal taxable allocation and line 43 reconciliation. This automatic worksheet does not substitute a prorated railroad amount.');
 const taxableSSA=retirement?.lines?.['6b']??(benefits.length?null:0);
 result.socialSecurity=benefits.length?ctSocialSecurityAdjustment({year,filingStatus:status,agiCents:agi,taxableCents:taxableSSA,worksheet:retirement?.worksheet,livedApartAllYear:source?.livedApartAllYear}):{F:0};
 need(result.socialSecurity!==null,'CT_SOCIAL_SECURITY_UNRESOLVED','The Connecticut Social Security worksheet requires the corresponding completed federal benefit worksheet.');
 const factor=Number.isSafeInteger(agi)?ctPensionFactor(year,status,agi):null,hasPension=totals.ira+totals.ordinary+totals.teacherPension>0;
 need(!hasPension||factor!==null,'CT_PENSION_STATUS_UNRESOLVED','The published pension worksheet does not establish this filing-status/year treatment. Retain a separately reviewed worksheet before claiming the adjustment.');
 // The state worksheet begins with the reported federal 5b total. Rounding
 // every classification independently can otherwise deduct $2 from $1 income.
 const federalPension=retirement?.lines?.['5b']??(rows.some(row=>row.plan==='qualifiedPlan')?null:0),military=R(totals.military),teacherFull=R(totals.teacher50),eligibleRaw=sumMoney([totals.ordinary,totals.teacherPension]);
 const remainder=Number.isSafeInteger(federalPension)?federalPension-military-teacherFull:null;
 need(remainder!==null&&remainder>=0&&(eligibleRaw>0||remainder===0),'CT_PENSION_ROUNDING_ALLOCATION','Rounded military/teachers source allocations do not reconcile to federal line 5b. Complete a separately reviewed allocation instead of deducting income twice.');
 const iraPercent={2023:2500,2024:5000,2025:7500}[year],ira=R(totals.ira),pension=remainder!==null&&remainder>=0?remainder:0;
 const base=iraPercent===undefined?null:sumMoney([wholeRatio(ira,iraPercent),pension]);
 result.pension={federalAGICents:agi??null,federalPensionCents:federalPension,excludedMilitaryCents:military,excludedTeacherIncomeCents:teacherFull,iraTaxableCents:ira,iraPercentBps:iraPercent??null,pensionTaxableCents:pension,baseCents:base,factorBps:factor,subtractionCents:hasPension?(base===null||factor===null?null:wholeRatio(base,factor)):0};
 const calculated={'41':result.socialSecurity?.F??null,'43':0,'44':military,'45':wholeRatio(teacherFull,5000),'48b':result.pension.subtractionCents};
 for(const row of state.adjustments??[])if(managed.includes(row.line))need(row.amountCents===calculated[row.line],'CT_RETIREMENT_ADJUSTMENT_CONFLICT',`Saved manual line ${row.line} differs from the source-linked retirement calculation. Reconcile or remove that manual amount; it is not added twice.`);
 result.known=diagnostics.length===0;result.lines=Object.fromEntries(managed.map(line=>[line,result.known?calculated[line]:null]));return result;
}
