import {investmentIdentity} from './investment-pdf.mjs';
import {capitalIdentity} from './capital-pdf.mjs';
import {inventoryIdentity} from './inventory-pdf.mjs';
import {retirementIdentity} from './retirement-pdf.mjs';
import {identity2026} from './form-maps-2026.mjs';
import {householdIdentity} from './household-pdf.mjs';
import {energyIdentity} from './energy-pdf.mjs';
const digits=value=>value.replaceAll('-','');
export function identityFields(input,item,set){
  retirementIdentity(input,item,set);
  if(inventoryIdentity(input,item,set))return;
  const p=input.party,person=item.owner==='spouse'?{name:input.individual.spouseName,taxId:input.individual.spouseTaxId}:p;
  if(input.year===2026&&identity2026(input,item,set))return;
  if(['f1040sd','f8949'].includes(item.form)){capitalIdentity(input,item,set);return;}
  if(['f1040sb','f8960'].includes(item.form)){investmentIdentity(input,item,set);return;}
  if(item.form==='f1040sh'){householdIdentity(input,item,set);return;}
  if(item.form==='f5695'){energyIdentity(input,item,set);return;}
  if(item.form==='f1040s3'){set('1/1',input.individual.filingStatus==='marriedJoint'?[p.name,input.individual.spouseName].filter(Boolean).join(' & '):p.name);set('1/2',digits(p.taxId));return;}
  if(item.form==='f8959'){set('1/1',input.individual.filingStatus==='marriedJoint'?[p.name,input.individual.spouseName].filter(Boolean).join(' & '):p.name);set('1/2',digits(p.taxId));return;}
  if(input.year<2025&&priorIdentity(input,item,set))return;
  if(item.form==='f1040'){
    set('1/14',p.firstName);set('1/15',p.lastName);set('1/16',digits(p.taxId));
    if(input.individual.filingStatus==='marriedJoint'){set('1/17',input.individual.spouseFirstName);set('1/18',input.individual.spouseLastName);set('1/19',digits(input.individual.spouseTaxId));}
    set('1/20',p.street);set('1/22',p.city);set('1/23',p.state);set('1/24',p.zip);
    const status=input.individual.filingStatus,left=['single','marriedJoint','marriedSeparate'].indexOf(status),reference=left>=0?`Checkbox_ReadOrder[0].c1_8[${left}]`:`c1_8[${status==='headOfHousehold'?0:1}]`;
    const checkbox=`topmostSubform[0].Page1[0].${reference}`;set.checkbox(checkbox);
  }else if(['f1040s1','f1040s2','f8995','f1040sse','f1040sc'].includes(item.form)){
    set('1/1',person.name);set('1/2',digits(person.taxId));
    if(item.form==='f1040sc'){const business=input.individual.businesses.find(value=>value.id===item.copyId);set('1/3',business.name);set('1/4',business.businessCode);set('1/5',business.name);set('1/6',digits(business.ein));set('1/7',p.street);set('1/8',[p.city,p.state,p.zip].filter(Boolean).join(', '));}
    if(item.form==='f8995')item.businesses.forEach((business,index)=>{set(`1/${3+index*3}`,business.name);set(`1/${4+index*3}`,digits(business.taxId));set(`1/${5+index*3}`,String(business.qbiCents/100),'business-qbi');});
  }else if(['f1065','f1120s','f1120'].includes(item.form)){
    const partnership=item.form==='f1065';set('1/4',p.name);set('1/5',p.street);set('1/7',p.city);set('1/8',p.state);set('1/10',p.zip);set(partnership?'1/14':item.form==='f1120s'?'1/13':'1/11',digits(p.taxId));
    if(partnership)set('1/13',input.entity.businessCode);else if(item.form==='f1120s')set('1/12',input.entity.businessCode);
    if(item.form!=='f1120')set(partnership?'1/18':'1/16',String(input.entity.owners.length));
  }else{
    const owner=input.entity.owners.find(owner=>owner.id===item.ownerId),partnership=item.form==='f1065sk1';
    set('1/6',digits(p.taxId));set('1/7',[p.name,p.street,[p.city,p.state,p.zip].filter(Boolean).join(', ')].filter(Boolean).join('\n'));
    set(partnership?'1/9':'1/11',digits(owner.taxId));set(partnership?'1/10':'1/12',owner.name);
    if(!partnership)set(input.year===2023?'1/13':'1/16',(owner.shareBps/100).toFixed(2));
  }
}

// Older entity forms have one combined city/state/ZIP field. Their field
// numbers and the 1040 filing-status groups changed in later editions.
function priorIdentity(input,item,set){
  const p=input.party,location=[p.city,p.state,p.zip].filter(Boolean).join(', ');
  if(item.form==='f1040'){
    set('1/4',p.firstName);set('1/5',p.lastName);set('1/6',digits(p.taxId));
    if(input.individual.filingStatus==='marriedJoint'){set('1/7',input.individual.spouseFirstName);set('1/8',input.individual.spouseLastName);set('1/9',digits(input.individual.spouseTaxId));}
    set('1/10',p.street);set('1/12',p.city);set('1/13',p.state);set('1/14',p.zip);
    const status=input.individual.filingStatus,left=['single','marriedJoint','marriedSeparate'].indexOf(status);
    const suffix=input.year===2023?`c1_3[${{single:0,headOfHousehold:1,marriedJoint:2,marriedSeparate:3,survivingSpouse:4}[status]}]`:left>=0?`FilingStatus_ReadOrder[0].c1_3[${left}]`:`c1_3[${status==='headOfHousehold'?0:1}]`;
    set.checkbox(`topmostSubform[0].Page1[0].${suffix}`);return true;
  }
  if(['f1065','f1120s','f1120'].includes(item.form)){
    set('1/4',p.name);set('1/5',p.street);set('1/6',location);
    const partnership=item.form==='f1065',sCorp=item.form==='f1120s';
    set(partnership?'1/10':sCorp?'1/9':'1/7',digits(p.taxId));
    if(partnership||sCorp){set(partnership?'1/9':'1/8',input.entity.businessCode);set(partnership?'1/14':'1/12',String(input.entity.owners.length));}
    return true;
  }
  return false;
}
