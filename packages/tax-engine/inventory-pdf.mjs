import {displayMoney} from './money.mjs';
import {inventoryMethods} from './inventory.mjs';

// Checked against the original 2018/2024 1125-A and 2023–2026 Schedule C
// text and AcroForm widget geometry. 2018 has separate dollar/cent columns.
export const inventoryScheduleCMap=Object.freeze(Object.fromEntries(Array.from({length:8},(_,i)=>[String(35+i),`2/${i+1}`])));
export const inventory1125AMap=Object.freeze(Object.fromEntries(Array.from({length:8},(_,i)=>[String(i+1),`1/${3+2*i}`])));
export function inventoryIdentity(input,item,set){
 const value=item.form==='f1040sc'?input.individual.businesses.find(row=>row.id===item.copyId)?.inventory:item.form==='f1125a'?input.entity.inventory:null;
 if(!value)return false;
 const schedule=item.form==='f1040sc',page=schedule?2:1,check=(number,index=0)=>set.checkbox(`topmostSubform[0].Page${page}[0].c${page}_${number}[${index}]`);
 const method={cost:1,lowerCostMarket:2,other:3,nonIncidental:4,afs:5,nonAfs:6}[value.method];
 if(schedule){if(method<=3)check(method);if(value.methodChanged!=='unknown')check(4,value.methodChanged==='yes'?0:1);return false;}
 set('1/1',input.party.name);set('1/2',input.party.taxId.replaceAll('-',''));
 if(input.year!==2023||method<=3)check(method);
 if(value.subnormalWriteDown==='yes')check(input.year===2023?4:7);
 if(value.lifo==='adopted')check(input.year===2023?5:8);
 if(value.section263a!=='unknown')check(input.year===2023?6:9,value.section263a==='applies'?0:1);
 if(value.methodChanged!=='unknown')check(input.year===2023?7:10,value.methodChanged==='yes'?0:1);
 if(input.year===2023)for(let i=1;i<=8;i++)if(item.lines[i]!==null)set(`1/${2+2*i}`,'00',`cents:${i}`);
 return true;
}
export function inventoryWorkpaper(input,result,line){
 for(const business of input.individual?.businesses??[input.entity]){
  const value=business.inventory;if(!value)continue;
  const calculation=input.kind==='1040'?result.forms.find(form=>form.form==='f1040sc'&&form.copyId===business.id)?.inventory:result.inventory;
  line(`Inventory and cost of goods sold: ${business.name??business.businessName}`,14);
  line(`Source: ${value.source}`);line(`Valuation: ${inventoryMethods.find(([key])=>key===value.method)?.[1]}. Change in method of determining quantities/cost/valuation: ${value.methodChanged}. Subnormal writedown: ${value.subnormalWriteDown}. LIFO: ${value.lifo}.`);
  line(`Section 263A: ${value.section263a}. ${value.capitalizationExplanation}`);
  for(const [key,label]of [['beginningCents','Opening inventory'],['purchasesCents','Gross purchases'],['personalWithdrawalsCents','Personal withdrawals deducted from purchases'],['laborCents','Cost of labor'],['materialsCents','Materials and supplies'],['closingCents','Closing inventory']])line(`${label}: ${displayMoney(value[key])} USD.`);
  if(input.kind!=='1040'&&value.materialsCents)line(`Form 1125-A line 5 statement: materials and supplies ${displayMoney(value.materialsCents)} USD; supported by the inventory source above.`);
  for(const cost of value.costs)line(`${cost.kind==='section263a'?'Additional section 263A costs (1125-A line 4)':'Other costs (1125-A line 5 / Schedule C line 39)'}: ${cost.description}; ${displayMoney(cost.amountCents)} USD. Source: ${cost.source}.`);
  if(calculation){line(`Source-cent rollforward: ${displayMoney(calculation.rawCostCents)} USD. Whole-dollar form rounding difference: ${displayMoney(calculation.roundingDifferenceCents)} USD. Cost of goods sold: ${displayMoney(calculation.costCents)} USD.`);}
  if(business.costOfGoodsCents)line(`Preserved earlier aggregate for reconciliation: ${displayMoney(business.costOfGoodsCents)} USD.`);
 }
}
