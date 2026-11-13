import {displayMoney} from './money.mjs';
export function capitalIdentity(input,item,set){
  const name=input.individual.filingStatus==='marriedJoint'?[input.party.name,input.individual.spouseName].filter(Boolean).join(' & '):input.party.name,taxId=input.party.taxId.replaceAll('-','');
  set('1/1',name);set('1/2',taxId);
  const check=(page,number,answer)=>set.checkbox(`topmostSubform[0].Page${page}[0].c${page}_${number}[${answer?0:1}]`);
  if(item.form==='f1040sd'){
    const {unknown,net,long,qualifiedDividendsCents,scopeReviewed}=item.capital;
    if(scopeReviewed)check(1,1,false);if(unknown)return;
    if(net>0){check(2,1,long>0);if(long>0){check(2,2,true);return;}}
    check(2,3,qualifiedDividendsCents>0);return;
  }
  set('2/1',name);set('2/2',taxId);
  const {page,category,trades,unknown}=item.capital,index=(page===1?['A','B','C']:['D','E','F']).indexOf(category);
  set.checkbox(`topmostSubform[0].Page${page}[0].c${page}_1[${index}]`);
  const date=value=>value.toLowerCase()==='various'?'VARIOUS':/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value.slice(5,7)}/${value.slice(8,10)}/${value.slice(0,4)}`:value;
  trades.forEach((trade,row)=>{
    const base=3+row*8;
    // The official description cell permits multiple lines; never truncate a
    // security description or source amounts to make it fit.
    set(`${page}/${base}`,trade.description.match(/.{1,23}/g)?.join('\n')??'');set(`${page}/${base+1}`,date(trade.dateAcquired));set(`${page}/${base+2}`,date(trade.dateSold));
    set(`${page}/${base+3}`,String(trade.columns.d/100),'trade-proceeds');set(`${page}/${base+4}`,String(trade.columns.e/100),'trade-basis');set(`${page}/${base+5}`,trade.codes);
    if(trade.codes)set(`${page}/${base+6}`,String(trade.columns.g/100),'trade-adjustment');set(`${page}/${base+7}`,unknown?null:String(trade.columns.h/100),'trade-gain');
  });
}
export function capitalWorkpaper(input,line,result){
  const value=input.individual?.capitalIncome,worksheet=result?.taxMethod?.worksheet;
  if(value){
    line('Schedule D / Form 8949 source and adjustment statement',12);line('Ordinary investment securities only. Each printed transaction column uses whole dollars; gain/loss and category totals reconcile those columns. Original source cents are preserved below. These records do not establish broker/basis verification or tax-agency acceptance.');
    for(const trade of value.trades){line(`${trade.category}: ${trade.description}; acquired ${trade.dateAcquired}; sold ${trade.dateSold}; proceeds ${displayMoney(trade.proceedsCents)}; basis ${displayMoney(trade.basisCents)} USD. Source: ${trade.source||'not entered'}`);for(const adjustment of trade.adjustments)line(`Adjustment ${adjustment.code}: ${displayMoney(adjustment.amountCents)} USD. ${adjustment.explanation}`);}
    for(const item of value.distributions)line(`Capital-gain distribution: ${item.payer}: ${displayMoney(item.amountCents)} USD. ${item.source}`);
    line(`Prior loss carryovers: short ${displayMoney(value.shortLossCarryoverCents)}; long ${displayMoney(value.longLossCarryoverCents)} USD.`);
    for(const [key,reviewed]of Object.entries(value.review))line(`Capital ${key}: ${reviewed?'reviewed':'unreviewed'}.`);
    const carry=result?.capitalLossCarryforward;if(carry){line('Capital loss carryforward worksheet — amounts for next tax year',12);if(carry.worksheet)for(const [number,cents]of Object.entries(carry.worksheet))line(`Carryover worksheet line ${number}: ${displayMoney(cents)} USD.`);line(`Next-year short-term loss: ${displayMoney(carry.shortTermLossCents)}; long-term loss: ${displayMoney(carry.longTermLossCents)} USD. Keep this return and worksheet; a next-year filing-status or ownership change requires fresh review.`);}
  }
  if(worksheet&&result.taxMethod.method?.includes('qualified-dividends')){line('Qualified Dividends and Capital Gain Tax Worksheet — Form 1040 line 16',12);for(const [number,cents]of Object.entries(worksheet))line(`Qualified-dividend worksheet line ${number}: ${displayMoney(cents)} USD.`);}
}
