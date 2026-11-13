import {strictObject,text,list,amountFields,diagnostic} from './model.mjs';
import {sumMoney,wholeDollars as R,checkedMoney} from './money.mjs';

export const inventoryMethods=Object.freeze([['cost','Cost'],['lowerCostMarket','Lower of cost or market'],['other','Other method'],['nonIncidental','Non-incidental materials and supplies'],['afs','Applicable financial statement'],['nonAfs','Books and records without an AFS']]);
export const inventoryReviews=Object.freeze([
 ['opening','Opening inventory reconciles to the prior return or documented first-year opening'],
 ['quantities','Physical quantities and closing valuation are supported by source records'],
 ['valuation','The selected valuation method and all inventory costs are correct for this tax year'],
 ['expenses','Labor and other inventory costs are not also deducted elsewhere; owner labor is excluded'],
 ['capitalization','Section 263A applicability, exemptions and allocations have been reviewed'],
 ['accounting','The sales/purchases accounting method and any small-business exception are supported'],
]);
export function newInventory(){return {method:'cost',methodChanged:'unknown',subnormalWriteDown:'unknown',lifo:'unknown',section263a:'unknown',source:'',capitalizationExplanation:'',beginningCents:0,purchasesCents:0,personalWithdrawalsCents:0,laborCents:0,materialsCents:0,closingCents:0,costs:[],review:Object.fromEntries(inventoryReviews.map(([key])=>[key,false]))};}
export function newInventoryCost(kind='other'){return {id:crypto.randomUUID(),kind,description:'',amountCents:0,source:''};}

/** Reviewed inventory valuations are source amounts, not an eligibility or
 * valuation estimate. The engine calculates the component rollforward and
 * retains each cent; printed lines round once before their arithmetic. */
export function inventoryCost(value,{year=2025,kind='1040',legacyCostCents=0}={}){
 checkedMoney(legacyCostCents,'Existing cost of goods sold');
 if(value===undefined)return {required:false,incomeUnknown:legacyCostCents!==0,costCents:legacyCostCents?null:0,provisionalCents:R(legacyCostCents),lines:{},diagnostics:legacyCostCents?[diagnostic(kind==='1040'?'INVENTORY_WORKPAPER_REQUIRED':'FORM1125A_REQUIRED','The recorded cost of goods sold has no inventory workpaper. Complete its opening, purchases, costs and closing inventory before using dependent income or tax totals.')]:[]};
 strictObject(value,['method','methodChanged','subnormalWriteDown','lifo','section263a','source','capitalizationExplanation','beginningCents','purchasesCents','personalWithdrawalsCents','laborCents','materialsCents','closingCents','costs','review'],'Inventory workpaper');
 if(!inventoryMethods.some(([key])=>key===value.method))throw new Error('Choose an inventory valuation method.');
 for(const key of ['methodChanged','subnormalWriteDown'])if(!['yes','no','unknown'].includes(value[key]))throw new Error('Review inventory method changes and subnormal goods explicitly.');
 if(!['none','used','adopted','unknown'].includes(value.lifo)||!['applies','exempt','unknown'].includes(value.section263a))throw new Error('Review LIFO and section 263A explicitly.');
 text(value.source,'Inventory source',2000);text(value.capitalizationExplanation,'Inventory capitalization explanation',2000);
 amountFields(value,['beginningCents','purchasesCents','personalWithdrawalsCents','laborCents','materialsCents','closingCents'],'Inventory');
 strictObject(value.review,inventoryReviews.map(([key])=>key),'Inventory review');
 for(const decision of Object.values(value.review))if(typeof decision!=='boolean')throw new Error('Inventory review decisions must be explicit.');
 const diagnostics=[],add=(code,message)=>diagnostics.push(diagnostic(code,message));
 if(![2023,2024,2025,2026].includes(year)||year===2026&&kind!=='1040')add('INVENTORY_ANNUAL_PACK_REQUIRED','This inventory workpaper has no reviewed form pack for the selected return year.');
 if(!value.source.trim())add('INVENTORY_SOURCE_REQUIRED','Identify the opening inventory, purchase register, physical count and closing-valuation sources.');
 if(inventoryReviews.some(([key])=>value.review[key]!==true))add('INVENTORY_REVIEW_REQUIRED','Complete the source, quantity, valuation, accounting, capitalization and duplicate-expense reviews.');
 if(!['cost','lowerCostMarket'].includes(value.method))add('INVENTORY_ALTERNATIVE_METHOD_REQUIRED','Alternative inventory methods require their applicable accounting and deduction-timing workpaper; the ordinary inventory formula is not substituted.');
 if(value.methodChanged!=='no')add('INVENTORY_METHOD_CHANGE_REQUIRED','Resolve changes in the method of determining quantities, costs or valuations and any Form 3115 / section 481(a) adjustment before using this inventory total.');
 if(value.subnormalWriteDown!=='no')add('INVENTORY_WRITEDOWN_REQUIRED','Subnormal-goods valuation needs its separate evidence and valuation workpaper.');
 if(value.lifo!=='none')add('INVENTORY_LIFO_REQUIRED','LIFO adoption, layers, reserves and any recapture require their own completed schedules.');
 if(value.section263a==='unknown'||!value.capitalizationExplanation.trim())add('INVENTORY_CAPITALIZATION_REQUIRED','Document whether section 263A applies and the exemption or allocation supporting the source costs.');
 const ids=new Set(),additional=[],other=[];
 for(const item of list(value.costs,'Inventory cost details',100)){
  strictObject(item,['id','kind','description','amountCents','source'],'Inventory cost');text(item.id,'Inventory cost identifier',100);text(item.description,'Inventory cost description',500);text(item.source,'Inventory cost source',1000);checkedMoney(item.amountCents,'Inventory cost');
  if(!item.id||ids.has(item.id)||!['section263a','other'].includes(item.kind))throw new Error('Use unique inventory cost records with a supported cost category.');ids.add(item.id);
  if(!item.description.trim()||!item.source.trim())add('INVENTORY_COST_SOURCE_REQUIRED','Each additional inventory cost requires its description and source.');
  (item.kind==='section263a'?additional:other).push(item.amountCents);
 }
 const additionalCents=sumMoney(additional),otherCents=sumMoney(other),purchases=sumMoney([value.purchasesCents,-value.personalWithdrawalsCents]);
 if(purchases<0)add('INVENTORY_WITHDRAWALS_EXCEED_PURCHASES','Personal withdrawals cannot exceed the purchases from which they are removed.');
 if(value.section263a==='exempt'&&additionalCents)add('INVENTORY_CAPITALIZATION_CONFLICT','An exempt section 263A selection conflicts with additional section 263A costs. Reconcile the source treatment.');
 const rawTotal=sumMoney([value.beginningCents,purchases,value.laborCents,value.materialsCents,additionalCents,otherCents]),rawCostCents=sumMoney([rawTotal,-value.closingCents]);
 if(rawCostCents<0)add('INVENTORY_CLOSING_EXCEEDS_AVAILABLE','Closing inventory exceeds opening inventory and the current-year costs. Reconcile quantities and valuation.');
 let lines;
 if(kind==='1040'){
  lines={'35':R(value.beginningCents),'36':R(purchases),'37':R(value.laborCents),'38':R(value.materialsCents),'39':R(sumMoney([additionalCents,otherCents])),'41':R(value.closingCents)};
  lines['40']=sumMoney(['35','36','37','38','39'].map(key=>lines[key]));lines['42']=sumMoney([lines['40'],-lines['41']]);
 }else{
  lines={'1':R(value.beginningCents),'2':R(purchases),'3':R(value.laborCents),'4':R(additionalCents),'5':R(sumMoney([value.materialsCents,otherCents])),'7':R(value.closingCents)};
  lines['6']=sumMoney(['1','2','3','4','5'].map(key=>lines[key]));lines['8']=sumMoney([lines['6'],-lines['7']]);
 }
 const computed=lines[kind==='1040'?'42':'8'];
 if(computed<0&&!diagnostics.some(item=>item.code==='INVENTORY_CLOSING_EXCEEDS_AVAILABLE'))add('INVENTORY_ROUNDING_CONFLICT','Printed whole-dollar amounts produce negative cost of goods sold; reconcile rounding with the source workpaper.');
 if(legacyCostCents&&legacyCostCents!==rawCostCents)add('INVENTORY_AGGREGATE_CONFLICT','The prior recorded cost of goods sold disagrees with the original-cent component workpaper. Reconcile the retained prior amount before replacing it.');
 if(['1120','1120S'].includes(kind)&&value.personalWithdrawalsCents)add('INVENTORY_CORPORATE_DISTRIBUTION_REQUIRED','Corporate property removed for personal use requires the actual recipient, fair market value, basis and distribution/gain treatment. The component COGS workpaper is retained, but corporate income and tax remain unresolved.');
 const incomeUnknown=diagnostics.length>0;
 if(kind==='1065'&&value.personalWithdrawalsCents)diagnostics.push(diagnostic('INVENTORY_PARTNER_DISTRIBUTIONS','Purchases exclude personal withdrawals. Allocate those withdrawals to actual partners on Schedule K / K-1 and their capital/basis records.'));
 if(incomeUnknown){lines[kind==='1040'?'40':'6']=null;lines[kind==='1040'?'42':'8']=null;}
 return {required:true,incomeUnknown,costCents:incomeUnknown?null:computed,provisionalCents:Math.max(0,computed),rawCostCents,roundingDifferenceCents:computed-rawCostCents,lines,diagnostics};
}
