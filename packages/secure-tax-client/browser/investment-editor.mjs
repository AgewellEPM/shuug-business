import {newInvestmentIncome,newInvestmentPayer,investmentReviews,sumMoney} from '@shuug/tax-engine';

export function investmentFields({document,parent,individual,field,group,button}){
  const section=group(parent,'Interest, dividends and investment tax');section.id='investment-income-editor';
  const notice=document.createElement('p');notice.textContent='Enter taxable interest, total ordinary dividends and their qualified subset by payer. Schedule B records foreign-account/trust disclosures. Enter capital-gain distributions and sales in the capital-income section. Limited Form 8960 requires reviewed investment income, MAGI and deductions; rental/pass-through income, special interest adjustments and foreign tax forms need additional treatment.';section.append(notice);
  if(!individual.investmentIncome){
    button(section,'Add interest/dividend payer records',()=>{
      const value=newInvestmentIncome();for(const [key,aggregate]of [['interestPayers','taxableInterestCents'],['dividendPayers','ordinaryDividendsCents']])if(individual[aggregate]){value[key].push({...newInvestmentPayer(),amountCents:individual[aggregate]});individual[aggregate]=0;}
      individual.investmentIncome=value;
    });return;
  }
  const value=individual.investmentIncome;
  if(individual.taxableInterestCents||individual.ordinaryDividendsCents){
    const reconciliation=group(section,'Saved aggregate amounts to reconcile');
    const explanation=document.createElement('p');explanation.textContent='This saved return contains both aggregate amounts and payer records. Compare both sources. Payer records determine income here; retain an aggregate only if it matches exactly, or clear it to zero after reconciling the source amounts.';reconciliation.append(explanation);
    field(reconciliation,individual,'taxableInterestCents','Preserved aggregate taxable interest (USD)',{money:true});field(reconciliation,individual,'ordinaryDividendsCents','Preserved aggregate ordinary dividends (USD)',{money:true});
  }
  for(const [key,label]of [['interestPayers','Taxable interest'],['dividendPayers','Ordinary dividends (including qualified dividends)']]){
    const payers=group(section,`${label} (${value[key].length})`);
    value[key].forEach((payer,index)=>{const row=group(payers,`Payer ${index+1}`);field(row,payer,'payer','Payer name');field(row,payer,'amountCents',key==='dividendPayers'?'Total ordinary dividends (1099-DIV box 1a; USD)':'Taxable amount (USD)',{money:true});if(key==='dividendPayers'){payer.qualifiedDividendsCents??=0;field(row,payer,'qualifiedDividendsCents','Qualified subset (1099-DIV box 1b; USD)',{money:true});}field(row,payer,'source','Statement / source reference');button(row,'Remove this payer',()=>value[key].splice(index,1));});
    if(value[key].length<100)button(payers,`Add ${label.toLowerCase()} payer`,()=>value[key].push(newInvestmentPayer()));
  }
  const questions=group(section,'Foreign accounts and trusts'),options=[['unknown','Not reviewed'],['yes','Yes'],['no','No']];
  field(questions,value,'foreignAccount','Any financial interest in or signature authority over a foreign financial account?',{options});
  field(questions,value,'fbarRequired','If a foreign account exists, is an FBAR required after reviewing exceptions?',{options});
  field(questions,value,'foreignCountries','Countries where FBAR-reportable accounts are located');
  field(questions,value,'foreignTrust','Any foreign-trust distribution, grantor or transferor relationship?',{options});
  const review=group(section,'Investment income and NIIT scope review');for(const [key,label]of investmentReviews)field(review,value.review,key,label,{check:true});
  button(section,'Remove investment section and keep aggregate amounts',()=>{if(value.dividendPayers.some(payer=>payer.qualifiedDividendsCents>0))throw new Error('Keep payer details while qualified dividends are entered. Aggregate-only input cannot preserve their tax treatment.');individual.taxableInterestCents=sumMoney(value.interestPayers.map(payer=>payer.amountCents));individual.ordinaryDividendsCents=sumMoney(value.dividendPayers.map(payer=>payer.amountCents));delete individual.investmentIncome;});
}
