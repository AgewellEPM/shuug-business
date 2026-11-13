import {wholeDollars as R,sumMoney,displayMoney} from './money.mjs';

export function investmentIdentity(input,item,set){
  set('1/1',input.individual.filingStatus==='marriedJoint'?[input.party.name,input.individual.spouseName].filter(Boolean).join(' & '):input.party.name);set('1/2',input.party.taxId.replaceAll('-',''));
  if(item.form!=='f1040sb')return;
  const value=item.investment;
  for(const [key,start,capacity]of [['interestPayers',3,14],['dividendPayers',34,15]]){
    const rows=value[key].filter(payer=>payer.amountCents>0),overflow=rows.length>capacity,shown=overflow?rows.slice(0,capacity-1):rows;
    const remainder=overflow?R(sumMoney(rows.slice(capacity-1).map(row=>row.amountCents))):0;
    const total=R(sumMoney(rows.map(row=>row.amountCents))),displayed=sumMoney([...shown.map(row=>R(row.amountCents)),remainder]);
    // Preserve round-once source totals without printing a column whose rounded
    // entries do not add up. The attached statement retains every original row.
    if(displayed!==total){set(`1/${start}`,'All payers: see supporting statement');set(`1/${start+1}`,String(total/100),'investment-statement-total');continue;}
    shown.forEach((payer,index)=>{set(`1/${start+index*2}`,payer.payer);set(`1/${start+index*2+1}`,String(R(payer.amountCents)/100),'investment-payer');});
    if(overflow){set(`1/${start+(capacity-1)*2}`,'Additional payers: see supporting statement');set(`1/${start+(capacity-1)*2+1}`,String(remainder/100),'investment-overflow');}
  }
  const prefix='topmostSubform[0].Page1[0].';
  const check=(answer,name)=>{if(answer!=='unknown')set.checkbox(`${prefix}${name}[${answer==='yes'?0:1}]`);};
  check(value.foreignAccount,input.year===2025?'TagcorrectingSubform[0].c1_1':'c1_1');check(value.foreignTrust,'c1_3');
  if(value.foreignAccount==='yes'){
    check(value.fbarRequired,'c1_2');
    if(value.fbarRequired==='yes')set('1/65',value.foreignCountries);
  }
}

export function investmentWorkpaper(input,line){
  const value=input.individual?.investmentIncome;if(!value)return;
  line('Schedule B supporting statement — interest and ordinary dividend payers',12);
  line('Original source amounts retain cents below. Form totals round the original sum once. If rounding individual rows would not reconcile, Schedule B refers to this complete statement and reports one rounded total. No Form 8938, 3520/3520-A or FBAR is prepared/transmitted here.');
  for(const [key,label]of [['interestPayers','Taxable interest'],['dividendPayers','Ordinary dividends including qualified subset']]){
    line(label,11);for(const payer of value[key])line(`${payer.payer||'Payer name not entered'}: ${displayMoney(payer.amountCents)} USD.${key==='dividendPayers'?` Qualified subset: ${displayMoney(payer.qualifiedDividendsCents??0)} USD.`:''} Source: ${payer.source||'not entered'}`);
    line(`Original total: ${displayMoney(sumMoney(value[key].map(payer=>payer.amountCents)))} USD.`);
  }
  line(`Foreign account/signature authority: ${value.foreignAccount}; FBAR required: ${value.fbarRequired}; account countries: ${value.foreignCountries||'not entered'}; foreign trust: ${value.foreignTrust}.`);
  line('Form 8960 scope: taxable interest, ordinary dividends including qualified dividends, and reviewed ordinary Schedule D securities. MAGI equals AGI and Part II deductions/modifications are zero only after explicit review. Capital gains/losses must have matching regular-tax and NIIT treatment.');
  for(const [key,checked]of Object.entries(value.review))line(`${key}: ${checked?'reviewed':'unreviewed'}.`);
}
