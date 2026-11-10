import { strictObject, text, amountFields, expenses, diagnostic } from './model.mjs';
import { sumMoney, wholeDollars } from './money.mjs';
export const scheduleCLines=Object.freeze({advertising:'8',vehicle:'9',commissions:'10',contractLabor:'11',employeeBenefits:'14',insurance:'15',mortgageInterest:'16a',otherInterest:'16b',professional:'17',office:'18',retirement:'19',equipmentRent:'20a',propertyRent:'20b',repairs:'21',supplies:'22',taxes:'23',travel:'24a',meals:'24b',utilities:'25',wages:'26',other:'27b'});
export function scheduleC(input,index=0){
  strictObject(input,['id','owner','name','ein','businessCode','receiptsCents','returnsCents','costOfGoodsCents','otherIncomeCents','expenses','materialParticipation','fullyAtRisk'],'Schedule C business');
  for(const key of ['id','name','ein','businessCode'])text(input[key],`Business ${key}`);if(!['taxpayer','spouse'].includes(input.owner))throw new Error('Assign each Schedule C to the taxpayer or spouse.');
  amountFields(input,['receiptsCents','returnsCents','costOfGoodsCents','otherIncomeCents'],'Schedule C');
  if(typeof input.materialParticipation!=='boolean'||typeof input.fullyAtRisk!=='boolean')throw new Error('Review material participation and at-risk status explicitly.');
  const deductions=expenses(input.expenses),lines={'1':wholeDollars(input.receiptsCents),'2':wholeDollars(input.returnsCents),'4':wholeDollars(input.costOfGoodsCents),'6':wholeDollars(input.otherIncomeCents)};
  lines['3']=sumMoney([lines['1'],-lines['2']]);lines['5']=sumMoney([lines['3'],-lines['4']]);lines['7']=sumMoney([lines['5'],lines['6']]);
  for(const [key,line]of Object.entries(scheduleCLines))lines[line]=wholeDollars(deductions[key]??0);
  lines['28']=sumMoney(Object.values(scheduleCLines).map(line=>lines[line]));lines['29']=sumMoney([lines['7'],-lines['28']]);lines['30']=0;lines['31']=lines['29'];
  const diagnostics=[];
  if(!input.name.trim())diagnostics.push(diagnostic('BUSINESS_NAME_REQUIRED','Name each Schedule C business.',{field:`individual.businesses.${index}.name`}));
  if(input.costOfGoodsCents>0)diagnostics.push(diagnostic('INVENTORY_WORKPAPER_REQUIRED','Cost of goods sold needs its inventory and Form 1125-A/Schedule C Part III workpaper.'));
  if(lines['31']<0)diagnostics.push(diagnostic('LOSS_LIMITATION_REVIEW','A business loss needs its applicable passive-activity, at-risk, excess-business-loss and carryover workpapers before a complete return total can be used.'));
  if((deductions.retirement??0)>0)diagnostics.push(diagnostic('RETIREMENT_PLAN_REVIEW','Confirm deductible employee-plan amounts and the separate self-employed retirement adjustment.'));
  return {form:'f1040sc',copyId:input.id,owner:input.owner,businessName:input.name,lines,profitCents:lines['31'],diagnostics};
}
