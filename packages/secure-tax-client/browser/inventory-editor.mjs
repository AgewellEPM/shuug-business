import {newInventory,newInventoryCost,inventoryMethods,inventoryReviews} from '@shuug/tax-engine';

export function inventoryFields({document,parent,business,field,group,button}){
 const section=group(parent,'Inventory and cost of goods sold'),note=text=>{const p=document.createElement('p');p.textContent=text;section.append(p);};
 section.dataset.inventoryEditor='true';
 note('Record opening inventory, purchases, labor, other costs and closing inventory. The calculation fills Schedule C Part III or Form 1125-A. Valuations and eligibility need their supporting records; LIFO, alternative methods and accounting-method changes need additional workpapers.');
 if(!business.inventory){button(section,'Add inventory workpaper',()=>{business.inventory=newInventory();});return;}
 const value=business.inventory;
 if(business.costOfGoodsCents)note('The earlier cost-of-goods aggregate is retained above. Reconcile it to the component calculation; clear it to zero only after reviewing its original source.');
 field(section,value,'method','Closing inventory valuation',{options:inventoryMethods});
 field(section,value,'source','Inventory registers, physical count and valuation sources',{multiline:true});
 for(const [key,label]of [['beginningCents','Opening inventory'],['purchasesCents','Gross purchases before personal withdrawals'],['personalWithdrawalsCents','Purchases withdrawn for personal use'],['laborCents','Inventory labor (exclude owner labor)'],['materialsCents','Materials and supplies'],['closingCents','Closing inventory']])field(section,value,key,`${label} (USD)`,{money:true});
 const rows=group(section,'Additional inventory cost details');value.costs.forEach((cost,index)=>{const row=group(rows,`Cost ${index+1}`);field(row,cost,'kind','Cost type',{options:[['other','Other inventory cost'],['section263a','Additional section 263A cost']]});field(row,cost,'description','Cost description');field(row,cost,'amountCents','Cost (USD)',{money:true});field(row,cost,'source','Cost source');button(row,'Remove inventory cost',()=>value.costs.splice(index,1));});
 if(value.costs.length<100)button(rows,'Add inventory cost',()=>value.costs.push(newInventoryCost()));
 const decisions=[['unknown','Not reviewed'],['yes','Yes'],['no','No']];
 field(section,value,'methodChanged','Any change in the method of determining quantities, costs or valuations?',{options:decisions});field(section,value,'subnormalWriteDown','Any writedown of subnormal goods?',{options:decisions});
 field(section,value,'lifo','LIFO use',{options:[['unknown','Not reviewed'],['none','Not used'],['used','Previously adopted LIFO used'],['adopted','LIFO adopted this year']]});
 field(section,value,'section263a','Section 263A capitalization',{options:[['unknown','Not reviewed'],['applies','Applies'],['exempt','Exempt / not applicable']]});field(section,value,'capitalizationExplanation','Section 263A exemption or cost-allocation support',{multiline:true});
 const reviews=group(section,'Inventory source review');for(const [key,label]of inventoryReviews)field(reviews,value.review,key,label,{check:true});
 // Removing the section while it contains source records would silently erase
 // the evidence behind COGS. The return's explicit correction flow retains it.
}
