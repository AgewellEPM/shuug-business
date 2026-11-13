import {newHouseholdEmployer,newHouseholdEmployee,householdReviews} from '@shuug/tax-engine';
export function householdFields({document,parent,individual,year,field,group,button,readers}){
  const section=group(parent,'Household employment (Schedule H)');section.id='household-employment-editor';
  const notice=document.createElement('p');notice.textContent='Enter reviewed cash payroll for each household employer. Ordinary FICA/Medicare and single-state, timely-paid FUTA Section A are supported. Credit-reduction states, late payments and other Section B cases retain incomplete totals. W-2/W-3 issuance and state payroll filing remain separate.';section.append(notice);
  const employers=individual.householdEmployers??[];
  employers.forEach((value,index)=>{
    const row=group(section,`Household employer ${index+1}`);field(row,value,'owner','Employer on this return',{options:[['taxpayer','Taxpayer'],['spouse','Spouse (joint return)']]});field(row,value,'ein','Household employer EIN (hidden)',{privateId:true});
    const prior=group(row,`${year-1} eligible FUTA wages — all household workers, excluding spouse/child-under-21/parent wages`);
    value.priorYearFutaQuartersCents.forEach((amount,q)=>{const holder={amount:amount??undefined};field(prior,holder,'amount',`Prior-year quarter ${q+1} (USD; blank is unknown)`,{money:true,optionalMoney:true});readers.push(()=>{value.priorYearFutaQuartersCents[q]=holder.amount??null;});});
    const workers=group(row,`Current-year workers (${value.employees.length})`);
    value.employees.forEach((employee,i)=>{
      const worker=group(workers,`Worker ${i+1}`);field(worker,employee,'name','Worker name');
      employee.quartersCents.forEach((amount,q)=>{const holder={amount};field(worker,holder,'amount',`${year} quarter ${q+1} cash wages (USD)`,{money:true});readers.push(()=>{employee.quartersCents[q]=holder.amount;});});
      field(worker,employee,'federalWithholdingCents','Employee federal income tax withheld (USD)',{money:true});
      for(const [key,label]of [['ficaTreatment','Social Security / Medicare treatment'],['futaTreatment','Federal unemployment treatment']])field(worker,employee,key,label,{options:[['unknown','Review required'],['ordinary','Ordinary taxable cash wages (annual limits calculated)'],['exempt','Exempt after family / age / other statutory review']]});
      field(worker,employee,'source','Payroll / classification source reference');button(worker,'Remove this household worker',()=>value.employees.splice(i,1));
    });
    if(value.employees.length<100)button(workers,'Add household worker',()=>value.employees.push(newHouseholdEmployee(crypto.randomUUID())));
    const unemployment=group(row,'State unemployment / FUTA credit');field(unemployment,value.unemployment,'state','State unemployment jurisdiction (two letters)');field(unemployment,value.unemployment,'contributionsCents','State unemployment contributions paid (USD; blank is unknown)',{money:true,optionalMoney:true});
    for(const [key,label]of [['zeroRate','Assigned a 0% state experience rate; no contributions due'],['onlyOneState','Unemployment contributions to only one state'],['paidOnTime','All required state contributions paid by the original return due date'],['allFutaWagesStateTaxable','All FUTA wages also taxable for state unemployment']])field(unemployment,value.unemployment,key,label,{check:true});
    for(const [key,label]of householdReviews)field(row,value.review,key,label,{check:true});
    button(row,'Remove this household employer',()=>{individual.householdEmployers.splice(index,1);if(!individual.householdEmployers.length)delete individual.householdEmployers;});
  });
  if(employers.length<(individual.filingStatus==='marriedJoint'?2:1))button(section,'Add household employer',()=>{individual.householdEmployers??=[];individual.householdEmployers.push(newHouseholdEmployer(employers.some(value=>value.owner==='taxpayer')?'spouse':'taxpayer'));});
}
