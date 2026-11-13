import {newInvestmentIncome} from '../investment-income.mjs';
export function investmentFixture(interestDollars=1234,dividendDollars=3456){
  const value=newInvestmentIncome();value.foreignAccount='no';value.foreignTrust='no';
  for(const key of Object.keys(value.review))value.review[key]=true;
  if(interestDollars)value.interestPayers=[{id:'synthetic-bank',payer:'Synthetic Bank',amountCents:interestDollars*100,source:'Synthetic interest statement'}];
  if(dividendDollars)value.dividendPayers=[{id:'synthetic-fund',payer:'Synthetic Fund',amountCents:dividendDollars*100,source:'Synthetic nonqualified dividend statement'}];
  return value;
}
