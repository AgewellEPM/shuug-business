import {strictObject,list,text,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';

// Schedule H Worksheet 2, annual IRS instructions (not state return rules).
export const householdCreditReductionRates=Object.freeze({
  2023:Object.freeze({CA:60,NY:60,VI:390}),
  2024:Object.freeze({CA:90,NY:90,VI:420}),
  2025:Object.freeze({CA:120,VI:450}),
});
export const householdStates=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI'.split(' '));
export const newHouseholdFuta=()=>({rows:[],allocations:[],noStateLiability:false,reviewed:false,allocationReviewed:false});
export const newHouseholdFutaRow=()=>({state:'',rateStatus:'unknown',experienceRate:'',periodStart:'',periodEnd:'',source:''});

function percent(value){
  if(!value)return null;
  if(!/^(?:0|[1-9]\d?)(?:\.\d{1,4})?$|^100(?:\.0{1,4})?$/.test(value))throw new Error('Enter the state experience rate as a percentage from 0 to 100 with at most four decimal places.');
  const [whole,fraction='']=value.split('.');return Number(whole)*10000+Number(fraction.padEnd(4,'0'));
}
function dateInYear(value,year){
  if(!new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(value))return false;
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}

/** State wages and contribution timing are reviewed source inputs, never inferred
 * from federal wages. EX means FUTA wages excluded from every state tax base.
 * Employee allocations reconcile the federal $7,000 cap before any rounding. */
export function householdFuta(state,workers,year){
  const value=strictObject(state.sectionB,['rows','allocations','noStateLiability','reviewed','allocationReviewed'],'Schedule H Section B'),diagnostics=[];
  const need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic('HOUSEHOLD_FUTA_'+code,message));};
  for(const key of ['noStateLiability','reviewed','allocationReviewed'])if(typeof value[key]!=='boolean')throw new Error('Section B reviews must be explicit yes/no decisions.');
  need(value.reviewed,'REVIEW','Review all state rate periods and eligible employer contributions, excluding employee charges, interest, penalties, voluntary rate-buydown payments and excess-credit letter claims.');
  const sourceRows=list(value.rows,'State unemployment rate periods',100),allocations=list(value.allocations,'Worker FUTA state allocations',1000),jurisdictions=new Set(),periods=new Map();
  need(value.noStateLiability?sourceRows.length===0:sourceRows.length>0,'ROWS_REQUIRED','Enter every state/rate period, or explicitly confirm no state unemployment liability; these alternatives cannot be combined.');
  const rows=sourceRows.map(row=>{
    strictObject(row,['state','taxableWagesCents','rateStatus','experienceRate','periodStart','periodEnd','paidOnTimeCents','paidLateCents','source'],'State rate period');
    for(const [key,max]of [['state',2],['experienceRate',20],['periodStart',10],['periodEnd',10],['source',500]])text(row[key],`State rate period ${key}`,max);
    for(const key of ['taxableWagesCents','paidOnTimeCents','paidLateCents'])if(row[key]!==undefined)checkedMoney(row[key],`State rate period ${key}`);
    if(!['unknown','assigned','notAssigned'].includes(row.rateStatus))throw new Error('Choose an explicit state experience-rate status.');
    need(householdStates.has(row.state),'STATE_REQUIRED','Select a valid state unemployment jurisdiction for every rate period.');jurisdictions.add(row.state);
    need(row.taxableWagesCents!==undefined&&row.paidOnTimeCents!==undefined&&row.paidLateCents!==undefined,'AMOUNTS_REQUIRED','Enter state taxable wages and both on-time and late contribution amounts for every rate period; enter an explicit zero when none.');
    need(row.rateStatus!=='unknown','RATE_REQUIRED','Confirm the assigned state experience rate or that the state did not assign one. An unknown rate cannot become a zero rate.');
    const rate=percent(row.experienceRate);
    if(row.rateStatus==='assigned'){
      need(rate!==null,'RATE_REQUIRED','Enter the assigned state experience rate, including an explicit 0 when assigned.');
      const valid=dateInYear(row.periodStart,year)&&dateInYear(row.periodEnd,year)&&row.periodStart<=row.periodEnd;
      need(valid,'PERIOD_REQUIRED','Enter the beginning and ending dates of each assigned rate period within the selected tax year.');
      if(valid){const previous=periods.get(row.state)??[];need(!previous.some(p=>row.periodStart<=p[1]&&row.periodEnd>=p[0]),'OVERLAPPING_PERIODS','State experience-rate periods cannot overlap; combine duplicate wages/contributions.');previous.push([row.periodStart,row.periodEnd]);periods.set(row.state,previous);}
    }else need(!row.experienceRate&&!row.periodStart&&!row.periodEnd,'RATE_CONFLICT','An unassigned or unknown rate cannot also contain an assigned rate or effective dates.');
    const b=row.taxableWagesCents===undefined?null:R(row.taxableWagesCents),h=row.paidOnTimeCents===undefined?null:R(row.paidOnTimeCents);
    const additional=row.rateStatus==='assigned'&&rate!==null&&rate<54000,e=additional&&b!==null?P(b,540):null,f=additional&&b!==null?P(b,rate,1000000):null;
    return {...row,b,e,f,g:additional?(e===null||f===null?null:Math.max(0,e-f)):row.rateStatus==='notAssigned'||rate>=54000?0:null,h,rate};
  });
  const reductionStates=[...jurisdictions].filter(jurisdiction=>householdCreditReductionRates[year][jurisdiction]);
  const eligible=workers.filter(worker=>worker.futaTreatment==='ordinary'),byEmployee=new Map(eligible.map(worker=>[worker.id,Math.min(worker.wages,700000)]));
  const allocated=new Map(),byState=new Map(),keys=new Set();let allocationsKnown=true;
  for(const allocation of allocations){
    strictObject(allocation,['employeeId','state','wagesCents'],'Worker FUTA state allocation');text(allocation.employeeId,'Allocated household worker',100);text(allocation.state,'Allocated state jurisdiction',2);
    if(allocation.wagesCents!==undefined)checkedMoney(allocation.wagesCents,'Allocated FUTA wages');else allocationsKnown=false;
    need(byEmployee.has(allocation.employeeId),'ALLOCATION_WORKER','Each FUTA allocation must identify a worker with ordinary FUTA wages.');
    need(allocation.state==='EX'||jurisdictions.has(allocation.state),'ALLOCATION_STATE','Allocate FUTA wages to a recorded state, or EX for wages excluded from every state unemployment tax.');
    const key=allocation.employeeId+':'+allocation.state;need(!keys.has(key),'ALLOCATION_DUPLICATE','Combine each worker/state allocation into one record so federal wages are counted once.');keys.add(key);
    if(allocation.wagesCents!==undefined){allocated.set(allocation.employeeId,sumMoney([allocated.get(allocation.employeeId)??0,allocation.wagesCents]));byState.set(allocation.state,sumMoney([byState.get(allocation.state)??0,allocation.wagesCents]));}
  }
  const allocationComplete=allocationsKnown&&eligible.every(worker=>allocated.has(worker.id)&&allocated.get(worker.id)===byEmployee.get(worker.id));
  if(reductionStates.length||allocations.length){
    need(value.allocationReviewed,'ALLOCATION_REVIEW','Review state allocation of each worker’s first $7,000 of eligible FUTA wages, excluding wages exempt from state unemployment tax.');
    need(allocationComplete,'ALLOCATION_REQUIRED','Allocate each eligible worker’s exact capped FUTA wages across states and state-excluded wages; missing or mismatched amounts cannot produce a credit.');
    for(const jurisdiction of jurisdictions){const source=sourceRows.filter(row=>row.state===jurisdiction);if(source.every(row=>row.taxableWagesCents!==undefined))need((byState.get(jurisdiction)??0)<=sumMoney(source.map(row=>row.taxableWagesCents)),'ALLOCATION_BASE','State-covered FUTA wages cannot exceed the recorded state taxable wages.');}
    need(!state.allFutaWagesStateTaxable||!(byState.get('EX')>0),'ALLOCATION_CONFLICT','State-excluded FUTA wages conflict with confirmation that all FUTA wages are state-taxable.');
  }
  const known=rows.every(row=>row.g!==null&&row.h!==null&&row.paidLateCents!==undefined),late=known?sumMoney(rows.map(row=>row.paidLateCents)):null;
  need(!state.paidOnTime||late===null||late===0,'TIMING_CONFLICT','Late contributions conflict with confirmation that all required contributions were paid by the original return due date.');
  const wages=R(sumMoney([...byEmployee.values()])),g=known?sumMoney(rows.map(row=>row.g)):null,h=known?sumMoney(rows.map(row=>row.h)):null;
  const lines={'18g':g,'18h':h,'19':g===null||h===null?null:sumMoney([g,h]),'20':wages,'21':P(wages,600),'22':P(wages,540),'23':null,'24':null};
  let worksheet1=null,worksheet2=null,credit=known?Math.min(lines['19'],lines['22']):null;
  if(late>0){
    const a=lines['22'],b=lines['19'],c=Math.max(0,a-b),d=R(late),e=Math.min(c,d),f=P(e,9000),g=sumMoney([b,f]);
    worksheet1={'1':a,'2':b,'3':c,'4':d,'5':e,'6':f,'7':g,'8':Math.min(a,g)};credit=worksheet1['8'];
  }
  if(reductionStates.length){
    const reductions=reductionStates.map(jurisdiction=>({state:jurisdiction,wagesCents:allocationComplete?R(byState.get(jurisdiction)??0):null,rate:householdCreditReductionRates[year][jurisdiction]}));
    for(const row of reductions)row.reductionCents=row.wagesCents===null?null:P(row.wagesCents,row.rate);
    const reduction=reductions.some(row=>row.reductionCents===null)?null:sumMoney(reductions.map(row=>row.reductionCents));
    worksheet2={'1':credit,'2':wages,states:[...jurisdictions],reductions,'4':reduction,'5':credit===null||reduction===null?null:Math.max(0,credit-reduction)};credit=worksheet2['5'];
  }
  const paymentOrZeroRate=rows.some(row=>row.paidOnTimeCents>0||row.paidLateCents>0)||rows.length>0&&rows.every(row=>row.rateStatus==='assigned'&&row.rate===0);
  const questions={10:jurisdictions.size===1&&!reductionStates.length&&paymentOrZeroRate,11:state.paidOnTime&&late===0,12:state.allFutaWagesStateTaxable&&!value.noStateLiability};
  if(!diagnostics.length){lines['23']=credit;lines['24']=lines['21']-credit;}
  // Worksheet totals are also unknown when allocation/review is incomplete.
  if(diagnostics.length){if(worksheet1)worksheet1['8']=null;if(worksheet2){worksheet2['1']=null;worksheet2['4']=null;worksheet2['5']=null;}}
  return {lines,rows,worksheet1,worksheet2,questions,diagnostics,sectionAEligible:Object.values(questions).every(Boolean),jurisdictions:[...jurisdictions],adjusted:late>0||reductionStates.length>0};
}
