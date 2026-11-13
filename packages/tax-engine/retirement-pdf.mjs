import {displayMoney} from './money.mjs';
export function retirementIdentity(input,item,set){
  if(item.form!=='f1040'||input.year!==2025||!item.retirement)return;
  const flags=item.retirement;for(const [flag,name]of [['iraRollover','c1_35[0]'],['pensionRollover','c1_38[0]'],['livedApart','c1_42[0]']])if(flags[flag])set.checkbox(`topmostSubform[0].Page1[0].${name}`);
}
// The 2023/2024 blanks have no fields for the required written annotations.
// Coordinates come from their original printed line labels, not another year.
export function retirementAnnotations(input,item,{pdf,font,audit}){
  if(item.form!=='f1040'||![2023,2024].includes(input.year)||!item.retirement)return;
  const first=pdf.getPage(0),offset=input.year===2024?24:0;
  for(const [flag,text,x,y]of [['iraRollover','Rollover',414,238],['pensionRollover','Rollover',414,226],['livedApart','D',205,214]])if(item.retirement[flag]){first.drawText(text,{x,y:y-offset,size:8,font});audit.push({annotation:flag,text,page:1,x,y:y-offset});}
}
export function retirementWorkpaper(input,line,result){
  const value=input.individual?.retirementIncome;if(!value)return;line('Retirement distributions and Social Security source workpaper',12);line('Supported taxable amounts are calculated from original distributions and eligible treatments. Source box 2a is a reconciliation input, not a taxable-income override. Original cents and source references follow.');
  for(const row of value.distributions){line(`${row.owner}: ${row.payer}; ${row.plan}; code ${row.distributionCodes||'unentered'}; ${row.treatment}. Gross ${displayMoney(row.grossCents)}; reported taxable ${displayMoney(row.reportedTaxableCents)}; after-tax cost ${displayMoney(row.afterTaxContributionsCents)}; withholding ${displayMoney(row.federalWithholdingCents)} USD. Source: ${row.source||'not entered'}`);if(row.treatment==='rollover')line(`Rollover statement: ${displayMoney(row.rolloverCents)} USD from ${row.plan} to ${row.rolloverDestination}; ${row.rolloverMethod}; received ${row.receivedDate||'direct transfer'}, completed ${row.rolloverDate||'direct transfer'}. ${row.source}`);for(const [key,reviewed]of Object.entries(row.review))line(`Distribution ${key}: ${reviewed?'reviewed':'unreviewed'}.`);}
  for(const row of value.benefits)line(`${row.owner}: ${row.form}; paid ${displayMoney(row.benefitsPaidCents)}; repaid ${displayMoney(row.benefitsRepaidCents)}; net ${displayMoney(row.benefitsPaidCents-row.benefitsRepaidCents)}; reported box 5 ${displayMoney(row.reportedNetCents)}; withholding ${displayMoney(row.federalWithholdingCents)} USD. Source: ${row.source||'not entered'}`);
  for(const row of value.taxExemptInterestPayers)line(`Tax-exempt interest: ${row.payer}; ${displayMoney(row.amountCents)}; withholding ${displayMoney(row.federalWithholdingCents)} USD. ${row.source}`);
  for(const [key,reviewed]of Object.entries(value.review))line(`Retirement ${key}: ${reviewed?'reviewed':'unreviewed'}.`);line(`Married-separate filers lived apart for the entire year: ${value.livedApartAllYear}.`);
  if(value.benefits.length){line('Social Security Benefits Worksheet — Form 1040 instructions',12);if(result.retirement?.worksheet)for(const [number,cents]of Object.entries(result.retirement.worksheet))line(`Social Security worksheet line ${number}: ${displayMoney(cents)} USD.`);else line('Taxable benefits are not calculated; unresolved source income or worksheet treatment remains.');}
}
