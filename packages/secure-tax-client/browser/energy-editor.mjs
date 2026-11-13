import {newEnergyCredits,energyCategories,energyReviews,panelEnabledTypes} from '@shuug/tax-engine';

export function energyFields({document,parent,individual,year,field,group,button,readers}){
  const section=group(parent,'Residential energy credits (Form 5695)');
  section.id='residential-energy-editor';
  const notice=document.createElement('p');notice.textContent='Supported: one qualifying home, clean-energy costs/carryforward and energy-efficient improvements. Fuel cells, multiple homes, separate-return joint occupants and fractional condo/co-op allocations need additional treatment. Enter eligible costs after rebates, business-use and installation rules; keep receipts and manufacturer records.';section.append(notice);
  if(!individual.energyCredits){button(section,'Add residential energy credits',()=>{individual.energyCredits=newEnergyCredits();});return;}
  const value=individual.energyCredits,address=group(section,'Property address');
  for(const [key,label]of [['street','Number and street'],['unit','Unit'],['city','City'],['state','State (two letters)'],['zip','ZIP code']])field(address,value.home,key,label);
  field(section,value,'carryforwardCents','Prior-year Form 5695 line 16 carryforward (USD)',{money:true});
  const items=group(section,`Eligible costs (${value.items.length})`);
  value.items.forEach((item,index)=>{
    const row=group(items,`Property / audit ${index+1}`);field(row,item,'category','Property category',{options:energyCategories});field(row,item,'costCents','Eligible cost (USD)',{money:true});field(row,item,'qmid',year===2025?'Manufacturer QMID (four characters; required for specified improvements/equipment)':'Manufacturer QMID (not required for this year)');field(row,item,'source','Receipt / manufacturer record reference');button(row,'Remove this energy item',()=>value.items.splice(index,1));
  });
  if(value.items.length<100)button(items,'Add energy item',()=>value.items.push({id:crypto.randomUUID(),category:'solar',costCents:0,qmid:'',source:''}));
  const enabled=group(section,'Electrical work: qualifying property enabled');enabled.open=false;
  for(const [code,label]of panelEnabledTypes){const selected={enabled:value.panelEnabledTypes.includes(code)};field(enabled,selected,'enabled',`${code}: ${label}`,{check:true});readers.push(()=>{value.panelEnabledTypes=value.panelEnabledTypes.filter(item=>item!==code);if(selected.enabled)value.panelEnabledTypes.push(code);value.panelEnabledTypes.sort();});}
  const review=group(section,'Energy eligibility and source review');
  for(const [key,label]of energyReviews)field(review,value.review,key,label,{check:true});
  button(section,'Remove residential energy credits',()=>{delete individual.energyCredits;});
}
