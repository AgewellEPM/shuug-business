import { newReturn } from '../index.mjs';
export function reviewed(kind='1040'){
  const input=newReturn(kind);input.party={name:'Synthetic Taxpayer',firstName:'Synthetic',lastName:'Taxpayer',taxId:'000123456',street:'1 Example Street',city:'Hartford',state:'CT',zip:'06103'};for(const key of Object.keys(input.review))input.review[key]=true;
  if(input.entity){input.entity.businessName='Synthetic business';input.entity.businessCode='541219';}return input;
}
export const business=(owner='taxpayer',profitDollars=80000)=>({id:`business-${owner}`,owner,name:'Synthetic activity',ein:'',businessCode:'541219',receiptsCents:profitDollars*100,returnsCents:0,costOfGoodsCents:0,otherIncomeCents:0,expenses:[],materialParticipation:true,fullyAtRisk:true});
export const wage=(owner,dollars,withholding=0)=>({id:`w2-${owner}`,owner,employer:'Synthetic employer',wagesCents:dollars*100,socialSecurityWagesCents:dollars*100,medicareWagesCents:dollars*100,federalWithholdingCents:withholding*100});
