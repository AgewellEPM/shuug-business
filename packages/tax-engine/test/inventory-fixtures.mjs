import {newInventory,newInventoryCost} from '../inventory.mjs';
export function reviewedInventory(){
 const value=newInventory();Object.assign(value,{methodChanged:'no',subnormalWriteDown:'no',lifo:'none',section263a:'applies',source:'Synthetic opening ledger, purchases register and closing count',capitalizationExplanation:'Synthetic reviewed section 263A allocation',beginningCents:1000000,purchasesCents:3000000,personalWithdrawalsCents:100000,laborCents:500000,materialsCents:200000,closingCents:1200000});
 for(const key of Object.keys(value.review))value.review[key]=true;
 value.costs=[{...newInventoryCost('section263a'),description:'Synthetic allocated warehouse cost',amountCents:100000,source:'Synthetic allocation schedule'},{...newInventoryCost(),description:'Synthetic freight cost',amountCents:50000,source:'Synthetic freight register'}];return value;
}
