import {displayMoney} from './money.mjs';
const page2={'14':'2/2','15':'2/3','16':'2/4','25':'2/31','26':'2/32'};
export const householdMap=Object.freeze({...Object.fromEntries(Array.from({length:8},(_,i)=>[String(i+1),`1/${i+4}`])),...page2});
export const householdMap2023=Object.freeze({'1a':'1/4','2a':'1/6','2c':'1/8','3':'1/9','4':'1/10','5':'1/11','6':'1/12','7':'1/13','8a':'1/14','8d':'1/17',...page2});

export function householdIdentity(input,item,set){
  const h=item.household,p=item.owner==='spouse'?{name:input.individual.spouseName,taxId:input.individual.spouseTaxId}:input.party;
  set('1/1',p.name);set('1/2',p.taxId.replaceAll('-',''));set('1/3',h.ein);
  const check=(page,number,index,parent='')=>set.checkbox(`topmostSubform[0].Page${page}[0].${parent}c${page}_${number}[${index}]`);
  if(h.a!==null){check(1,1,h.a?0:1);if(!h.a){check(1,2,h.b?0:1);if(!h.b&&h.threshold!==null)check(1,3,h.threshold?1:0);}}
  if((h.a||h.b)&&h.threshold!==null)check(1,4,input.year===2025?(h.threshold?1:0):(h.threshold?0:1));
  if(h.sectionA){
    check(2,1,0,'Line10[0].');check(2,2,0);check(2,3,0);set('2/1',h.state.state);if(h.state.zeroRate)set('2/2','0% rate');
  }
  if(h.threshold===true)check(2,5,0);
}
export function householdWorkpaper(input,line){
  for(const employer of input.individual?.householdEmployers??[]){
    line(`Schedule H payroll workpaper — ${employer.owner}`,12);
    line('Quarterly source amounts retain cents. Worker tax classifications and exclusions require preparer review. This export does not issue or file employer W-2/W-3 or state payroll returns.');
    line(`Prior-year eligible FUTA quarters: ${employer.priorYearFutaQuartersCents.map(amount=>displayMoney(amount)).join(', ')} USD.`);
    for(const employee of employer.employees)line(`${employee.name}: cash wages by quarter ${employee.quartersCents.map(displayMoney).join(', ')} USD; federal withholding ${displayMoney(employee.federalWithholdingCents)} USD; FICA ${employee.ficaTreatment}; FUTA ${employee.futaTreatment}. ${employee.source}`);
  }
}
