import {strictObject,list,text,amountFields,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R} from './money.mjs';

export const capitalCategories=Object.freeze([
  ['A','Short-term: 1099-B basis reported to IRS'],['B','Short-term: 1099-B basis not reported'],['C','Short-term: no 1099-B'],
  ['D','Long-term: 1099-B basis reported to IRS'],['E','Long-term: 1099-B basis not reported'],['F','Long-term: no 1099-B'],
].map(Object.freeze));
export const capitalAdjustmentCodes=Object.freeze([['B','B: corrected 1099-B basis (noncovered: correct basis, zero adjustment)'],['E','E: selling expenses omitted from proceeds/basis'],['T','T: corrected short/long classification'],['W','W: disallowed wash-sale loss']].map(Object.freeze));
export const capitalReviews=Object.freeze([
  ['scope','Only ordinary investment stocks/funds and cash capital-gain distributions; no collectibles, section 1250/1202/1244, business/property/home sales, options/short sales, market discount, digital assets, QOF, installment/like-kind sales, gifts/inheritances, pass-through capital gains or Form 4952 election'],
  ['basis','All lots, proceeds and basis reconcile to source records; correct basis used for noncovered securities and covered-security corrections entered with code B'],
  ['holdingPeriod','Short/long holding periods and ownership verified, including each lot behind a Various acquisition date'],
  ['adjustments','Adjustment codes, signed amounts and wash-sale replacement basis reviewed across all accounts, spouses and retirement accounts; no omitted adjustments'],
  ['carryovers','Prior short/long loss carryovers verified from the prior-year worksheet, including filing-status ownership changes and any basis/debt modifications'],
  ['niit','Every gain, loss, distribution and carryover has the same treatment for regular tax and NIIT; no excluded gains/losses or NIIT carryover adjustments'],
].map(Object.freeze));
export const newCapitalIncome=()=>({trades:[],distributions:[],shortLossCarryoverCents:0,longLossCarryoverCents:0,review:Object.fromEntries(capitalReviews.map(([key])=>[key,false]))});
export const newCapitalTrade=()=>({id:crypto.randomUUID(),description:'',category:'A',dateAcquired:'',dateSold:'',proceedsCents:0,basisCents:0,adjustments:[],source:''});
export const newCapitalDistribution=()=>({id:crypto.randomUUID(),payer:'',amountCents:0,source:''});
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const anniversary=value=>{const [y,m,d]=value.split('-').map(Number),last=new Date(Date.UTC(y+1,m,0)).getUTCDate();return `${y+1}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;};
const columns=['d','e','g','h'],categoryLines={A:'1b',B:'2',C:'3',D:'8b',E:'9',F:'10'};

export function capitalIncome(value,{year,filingStatus,qualifiedDividendsCents=0}){
  const empty={required:false,incomeCents:0,incomeUnknown:false,niitUnknown:false,shortTermCents:0,longTermCents:0,netGainCents:0,preferentialGainCents:0,lossDeductionCents:0,forms:[],diagnostics:[]};
  if(value===undefined)return empty;
  if(!['single','marriedJoint','marriedSeparate','headOfHousehold','survivingSpouse'].includes(filingStatus))throw new Error('Choose a supported capital-income filing status.');
  checkedMoney(qualifiedDividendsCents,'Qualified dividends');
  strictObject(value,['trades','distributions','shortLossCarryoverCents','longLossCarryoverCents','review'],'Capital income');amountFields(value,['shortLossCarryoverCents','longLossCarryoverCents'],'Capital loss carryovers');
  strictObject(value.review,capitalReviews.map(([key])=>key),'Capital income review');for(const [key]of capitalReviews)if(typeof value.review[key]!=='boolean')throw new Error('Capital income reviews must be explicit yes/no decisions.');
  const ids=new Set(),diagnostics=[],need=(ok,code,message)=>{if(!ok)diagnostics.push(diagnostic(code,message));},trades=[];
  const identify=(item,label)=>{text(item.id,label+' identifier',100);if(!item.id||ids.has(item.id))throw new Error('Every capital-income source needs a unique identifier.');ids.add(item.id);text(item.source,label+' source',500);};
  for(const item of list(value.trades,'Capital trades',1000)){
    strictObject(item,['id','description','category','dateAcquired','dateSold','proceedsCents','basisCents','adjustments','source'],'Capital trade');identify(item,'Trade');text(item.description,'Security description',60);text(item.dateAcquired,'Acquisition date',10);text(item.dateSold,'Sale date',10);amountFields(item,['proceedsCents','basisCents'],'Trade');
    if(!capitalCategories.some(([key])=>key===item.category))throw new Error('Choose Form 8949 category A–F for ordinary securities. Digital assets and other categories require additional treatment.');
    const long=['D','E','F'].includes(item.category),acquired=item.dateAcquired.toLowerCase()==='various'?null:item.dateAcquired;
    need(Boolean(item.description.trim()),'CAPITAL_DESCRIPTION_REQUIRED','Describe each security and quantity from the source statement.');
    const validDates=date(item.dateSold)&&Number(item.dateSold.slice(0,4))===year&&(acquired===null||date(acquired)&&acquired<=item.dateSold);
    need(validDates,'CAPITAL_DATES_REQUIRED','Each sale needs a valid date in the selected tax year and an acquisition date no later than sale (or Various).');
    if(validDates&&acquired!==null)need(long===(item.dateSold>anniversary(acquired)),'CAPITAL_HOLDING_PERIOD_CONFLICT','The selected short/long category conflicts with ordinary purchase/sale dates. Review the dates and category; special holding-period rules require additional treatment.');
    const adjustments=list(item.adjustments,'Trade adjustments',4),codes=new Set();
    for(const adjustment of adjustments){strictObject(adjustment,['code','amountCents','explanation'],'Capital adjustment');checkedMoney(adjustment.amountCents,'Capital adjustment',{negative:true});text(adjustment.explanation,'Adjustment explanation',500);if(!capitalAdjustmentCodes.some(([code])=>code===adjustment.code)||codes.has(adjustment.code))throw new Error('Use each supported capital adjustment code once. Unsupported adjustments need separate treatment.');codes.add(adjustment.code);
      if(adjustment.code==='B'&&(!['A','B','D','E'].includes(item.category)||['B','E'].includes(item.category)&&adjustment.amountCents!==0))throw new Error('For noncovered Form 1099-B securities enter the correct basis directly and use code B with zero adjustment; no-1099 categories do not use code B.');
      if(adjustment.code==='W'&&adjustment.amountCents<0||adjustment.code==='E'&&adjustment.amountCents>0||adjustment.code==='T'&&adjustment.amountCents!==0)throw new Error('Wash losses must be positive, selling expenses negative, and classification code T must have a zero amount.');
      need(Boolean(adjustment.explanation.trim()),'CAPITAL_ADJUSTMENT_SOURCE_REQUIRED','Explain each adjustment and retain its source; the code alone does not establish the adjustment.');
    }
    const beforeWash=sumMoney([item.proceedsCents,-item.basisCents,...adjustments.filter(row=>row.code!=='W').map(row=>row.amountCents)]),wash=adjustments.find(row=>row.code==='W')?.amountCents??0;
    if(wash>Math.max(0,-beforeWash))throw new Error('The disallowed wash-sale loss cannot exceed this trade’s loss after other adjustments.');
    // Round each displayed column and compute (h) from those columns so every
    // official row and its carried totals reconcile. Source cents remain saved.
    const d=R(item.proceedsCents),e=R(item.basisCents),g=R(sumMoney(adjustments.map(row=>row.amountCents)));
    trades.push({...item,long,codes:[...codes].sort().join(''),columns:{d,e,g,h:sumMoney([d,-e,g])}});
  }
  const distributions=list(value.distributions,'Capital gain distribution payers',100);
  for(const item of distributions){strictObject(item,['id','payer','amountCents','source'],'Capital distribution');identify(item,'Capital distribution');text(item.payer,'Distribution payer',200);amountFields(item,['amountCents'],'Capital distribution');need(!item.amountCents||Boolean(item.payer.trim()),'CAPITAL_DISTRIBUTION_PAYER_REQUIRED','Name each payer of a capital-gain distribution. Enter only ordinary capital-gain distributions; special-rate amounts require additional treatment.');}
  // Validate the preserved source shape even without an annual form pack; an
  // unsupported year must not turn malformed imported records into valid input.
  if(![2023,2024,2025].includes(year))return {...empty,required:true,incomeUnknown:true,niitUnknown:true,diagnostics:[diagnostic('CAPITAL_YEAR_UNSUPPORTED','No reviewed Schedule D / Form 8949 pack is installed for this tax year. Source records are preserved; another year is not substituted.')]};
  const active=trades.length||distributions.some(item=>item.amountCents)||value.shortLossCarryoverCents||value.longLossCarryoverCents;
  if(!active)return empty;
  for(const [key,label]of capitalReviews.filter(([key])=>key!=='niit'))if(!value.review[key])diagnostics.push(diagnostic('CAPITAL_'+key.toUpperCase()+'_REVIEW',label+'.'));
  const unknown=diagnostics.length>0,lines={},forms=[],capacity=year===2025?11:14;
  for(const [category]of capitalCategories){const rows=trades.filter(item=>item.category===category),base=categoryLines[category];if(!rows.length)continue;
    for(const column of columns)lines[base+column]=column==='h'&&unknown?null:sumMoney(rows.map(row=>row.columns[column]));
    for(let offset=0;offset<rows.length;offset+=capacity){const batch=rows.slice(offset,offset+capacity),page=category<'D'?1:2,totalLines={};for(const column of columns)totalLines[`${page}${column}`]=column==='h'&&unknown?null:sumMoney(batch.map(row=>row.columns[column]));forms.push({form:'f8949',copyId:`capital-${category}-${offset/capacity+1}`,lines:totalLines,capital:{category,page,trades:batch,unknown}});}
  }
  const short= sumMoney([...trades.filter(row=>!row.long).map(row=>row.columns.h),-R(value.shortLossCarryoverCents)]),long=sumMoney([...trades.filter(row=>row.long).map(row=>row.columns.h),R(sumMoney(distributions.map(row=>row.amountCents))),-R(value.longLossCarryoverCents)]),net=sumMoney([short,long]),loss=net<0?Math.min(-net,filingStatus==='marriedSeparate'?150000:300000):0;
  Object.assign(lines,{'4':0,'5':0,'6':R(value.shortLossCarryoverCents),'7':unknown?null:short,'11':0,'12':0,'13':R(sumMoney(distributions.map(row=>row.amountCents))),'14':R(value.longLossCarryoverCents),'15':unknown?null:long,'16':unknown?null:net});
  if(net>0&&long>0)Object.assign(lines,{'18':unknown?null:0,'19':unknown?null:0});if(net<0)lines['21']=unknown?null:loss;
  forms.unshift({form:'f1040sd',copyId:'capital-summary',lines,capital:{unknown,net,long,qualifiedDividendsCents,scopeReviewed:value.review.scope}});
  return {required:true,incomeCents:net<0?-loss:net,incomeUnknown:unknown,niitUnknown:unknown||!value.review.niit,shortTermCents:short,longTermCents:long,netGainCents:net,preferentialGainCents:Math.max(0,Math.min(long,net)),lossDeductionCents:loss,forms,diagnostics};
}

// Current-year loss worksheet, using the signed line-15 amount before its zero
// floor. This preserves losses unused because income is below deductions.
export function capitalLossCarryforward(capital,{taxableIncomeBeforeFloorCents}){
  if(capital.incomeUnknown||taxableIncomeBeforeFloorCents===null)return {shortTermLossCents:null,longTermLossCents:null,worksheet:null};
  checkedMoney(taxableIncomeBeforeFloorCents,'Taxable income before zero floor',{negative:true});
  if(capital.netGainCents>=0)return {shortTermLossCents:0,longTermLossCents:0,worksheet:null};
  const w={'1':R(taxableIncomeBeforeFloorCents),'2':capital.lossDeductionCents};w['3']=Math.max(0,sumMoney([w['1'],w['2']]));w['4']=Math.min(w['2'],w['3']);w['5']=Math.max(0,-capital.shortTermCents);w['6']=Math.max(0,capital.longTermCents);w['7']=sumMoney([w['4'],w['6']]);w['8']=Math.max(0,w['5']-w['7']);w['9']=Math.max(0,-capital.longTermCents);w['10']=Math.max(0,capital.shortTermCents);w['11']=Math.max(0,w['4']-w['5']);w['12']=sumMoney([w['10'],w['11']]);w['13']=Math.max(0,w['9']-w['12']);return {shortTermLossCents:w['8'],longTermLossCents:w['13'],worksheet:w};
}
