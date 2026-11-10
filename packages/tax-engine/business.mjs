import { strictObject, list, text, amountFields, expenses, diagnostic } from './model.mjs';
import { sumMoney, wholeDollars as R, wholeRatio as P } from './money.mjs';

const groups={
  '1065':{wages:'9',repairs:'11',rent:'13',taxes:'14',interest:'15',retirement:'18',employeeBenefits:'19',other:'21'},
  '1120S':{wages:'8',repairs:'9',rent:'11',taxes:'12',interest:'13',advertising:'16',retirement:'17',employeeBenefits:'18',other:'20'},
  '1120':{wages:'13',repairs:'14',rent:'16',taxes:'17',interest:'18',advertising:'22',retirement:'23',employeeBenefits:'24',other:'26'},
};
export function allocateIncome(totalCents,owners){
  const dollars=BigInt(R(totalCents))/100n,sign=dollars<0n?-1n:1n,absolute=dollars*sign;
  if(!owners.length||owners.reduce((sum,owner)=>sum+owner.shareBps,0)!==10000)throw new Error('Allocation shares must total exactly 100 percent.');
  const values=owners.map(owner=>{const numerator=absolute*BigInt(owner.shareBps);return {owner,units:numerator/10000n,remainder:numerator%10000n};});
  let extra=absolute-values.reduce((sum,value)=>sum+value.units,0n);
  for(const value of [...values].sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:a.owner.id<b.owner.id?-1:1)){if(extra===0n)break;value.units++;extra--;}
  return values.map(value=>({ownerId:value.owner.id,name:value.owner.name,shareBps:value.owner.shareBps,ordinaryIncomeCents:Number(value.units*sign)*100}));
}
export function calculateBusiness(input){
  const entity=strictObject(input.entity,['businessName','businessCode','accountingMethod','receiptsCents','returnsCents','costOfGoodsCents','otherIncomeCents','officerCompensationCents','guaranteedPaymentsCents','estimatedPaymentsCents','expenses','owners'],'Business return');
  text(entity.businessName,'Business name');text(entity.businessCode,'Business activity code');if(!['cash','accrual'].includes(entity.accountingMethod))throw new Error('Choose the tax accounting method; ledger date filtering does not perform a method conversion.');
  amountFields(entity,['receiptsCents','returnsCents','costOfGoodsCents','otherIncomeCents','officerCompensationCents','guaranteedPaymentsCents','estimatedPaymentsCents'],'Business return');
  const amounts=expenses(entity.expenses),mapping=groups[input.kind],lines={'1a':R(entity.receiptsCents),'1b':R(entity.returnsCents),'2':R(entity.costOfGoodsCents)};
  lines['1c']=sumMoney([lines['1a'],-lines['1b']]);lines['3']=sumMoney([lines['1c'],-lines['2']]);
  const incomeLine=input.kind==='1065'?'8':input.kind==='1120S'?'6':'11',otherIncomeLine=input.kind==='1065'?'7':input.kind==='1120S'?'5':'10';lines[otherIncomeLine]=R(entity.otherIncomeCents);lines[incomeLine]=sumMoney([lines['3'],lines[otherIncomeLine]]);
  const grouped={},categories=Object.keys(amounts);
  for(const key of categories){const category=['equipmentRent','propertyRent'].includes(key)?'rent':['mortgageInterest','otherInterest'].includes(key)?'interest':Object.hasOwn(mapping,key)?key:'other';(grouped[category]??=[]).push(amounts[key]);}
  for(const [key,line]of Object.entries(mapping))lines[line]=R(sumMoney(grouped[key]??[]));
  const diagnostics=[];
  if(input.kind==='1065'){lines['10']=R(entity.guaranteedPaymentsCents);if(entity.officerCompensationCents)diagnostics.push(diagnostic('PARTNER_COMPENSATION_REVIEW','Partners are not employee officers. Review compensation and guaranteed-payment treatment.'));}
  else{lines[input.kind==='1120S'?'7':'12']=R(entity.officerCompensationCents);if(entity.guaranteedPaymentsCents)diagnostics.push(diagnostic('CORPORATE_PAYMENT_REVIEW','Partnership guaranteed payments do not belong on a corporate return.'));}
  const deductionLine=input.kind==='1065'?'22':input.kind==='1120S'?'21':'27',ordinaryLine=input.kind==='1065'?'23':input.kind==='1120S'?'22':'28';
  lines[deductionLine]=sumMoney([...Object.values(mapping).map(line=>lines[line]),input.kind==='1065'?lines['10']:lines[input.kind==='1120S'?'7':'12']]);lines[ordinaryLine]=sumMoney([lines[incomeLine],-lines[deductionLine]]);
  const form=input.kind==='1065'?'f1065':input.kind==='1120S'?'f1120s':'f1120',forms=[{form,copyId:'main',lines}],owners=list(entity.owners,'Owners',input.kind==='1120S'?100:1000),ids=new Set();
  for(const owner of owners){strictObject(owner,['id','name','taxId','shareBps'],'Owner');for(const field of ['id','name','taxId'])text(owner[field],`Owner ${field}`);if(!owner.id||ids.has(owner.id)||!Number.isInteger(owner.shareBps)||owner.shareBps<0||owner.shareBps>10000)throw new Error('Use unique owner identifiers and exact ownership basis points.');ids.add(owner.id);}
  let allocations=[];
  if(input.kind!=='1120'){
    if(owners.length<(input.kind==='1065'?2:1)||owners.reduce((sum,owner)=>sum+owner.shareBps,0)!==10000)diagnostics.push(diagnostic('OWNERSHIP_INCOMPLETE','Complete the owners and exact 100-percent ordinary-income allocation before producing K-1 workpapers.'));
    else{allocations=allocateIncome(lines[ordinaryLine],owners);for(const allocation of allocations)forms.push({form:input.kind==='1065'?'f1065sk1':'f1120ssk',copyId:allocation.ownerId,lines:{'1':allocation.ordinaryIncomeCents},ownerId:allocation.ownerId});}
    diagnostics.push(diagnostic('PASS_THROUGH_DISCLOSURES','Complete and reconcile Schedule K, K-1 separately stated items, capital/basis information and applicable entity disclosures. Ordinary-income allocation alone does not complete those schedules.'));
    if(entity.guaranteedPaymentsCents)diagnostics.push(diagnostic('GUARANTEED_PAYMENT_ALLOCATION','Allocate guaranteed payments to their actual recipients and service/capital treatment before completing partner K-1s.'));
  }else{
    lines['29a']=0;lines['29b']=0;lines['29c']=0;lines['30']=Math.max(0,lines['28']);lines['31']=input.features.length?null:P(lines['30'],2100);lines['32']=0;lines['33']=R(entity.estimatedPaymentsCents);lines['35']=lines['31']===null?null:Math.max(0,lines['31']-lines['33']);lines['36']=lines['31']===null?null:Math.max(0,lines['33']-lines['31']);
    forms[0].schedules={J:{'1a':lines['31'],'2':lines['31'],'3':0,'4':lines['31'],'6':0,'7':lines['31'],'10':0,'11a':lines['31'],'12':lines['31'],'14':lines['33'],'19':lines['33'],'21':0,'22a':0,'22b':0,'23':lines['33']}};
    diagnostics.push(diagnostic('CORPORATE_DISCLOSURES','Complete Schedule C/K/L/M disclosures, special deductions and applicable exceptions before the corporate package is filing-ready.'));
  }
  if(entity.costOfGoodsCents)diagnostics.push(diagnostic('FORM1125A_REQUIRED','Cost of goods sold requires the completed Form 1125-A/inventory workpaper.'));
  if(!entity.businessCode.match(/^\d{6}$/))diagnostics.push(diagnostic('BUSINESS_CODE_REQUIRED','Select the actual six-digit principal business activity code.'));
  return {forms,diagnostics,allocations,summary:{ordinaryBusinessIncomeCents:lines[ordinaryLine],totalDeductionsCents:lines[deductionLine],taxableIncomeCents:input.kind==='1120'?lines['30']:null,totalTaxCents:input.kind==='1120'?lines['31']:null,paymentsCents:input.kind==='1120'?lines['33']:null,amountOwedCents:input.kind==='1120'?lines['35']:null,refundCents:input.kind==='1120'?lines['36']:null}};
}
