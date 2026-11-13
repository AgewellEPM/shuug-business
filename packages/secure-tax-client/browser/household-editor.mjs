import {newHouseholdEmployer,newHouseholdEmployee,householdReviews,newHouseholdFuta,newHouseholdFutaRow} from '@shuug/tax-engine';
export function householdFields({document,parent,individual,year,field,group,button,readers}){
  const section=group(parent,'Household employment (Schedule H)');section.id='household-employment-editor';
  const notice=document.createElement('p');notice.textContent='Enter reviewed cash payroll for each household employer. FUTA supports state rate periods, late contributions and annual credit reductions for 2023–2025. Missing rates, payments or wage allocations leave tax totals incomplete. W-2/W-3 issuance and state payroll filing remain separate.';section.append(notice);
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
    if(value.unemployment.sectionB){
      const b=value.unemployment.sectionB,detail=group(unemployment,'Detailed state unemployment records / Section B');
      const instructions=document.createElement('p');instructions.textContent=`These records replace the single-state amount above. Enter each state/rate period and employer contributions for ${year}, separated by whether paid by April 15, ${year+1}. Enter 0 for a known zero; blanks stay unknown. The two confirmations above about payment timing and state-taxable wages still apply. Wages for a state are determined under that state’s rules, separately from the federal $7,000 limit.`;detail.append(instructions);
      field(detail,b,'noStateLiability','Reviewed: no state unemployment liability for these FUTA wages (leave state rows empty)',{check:true});
      b.rows.forEach((record,i)=>{
        const stateRow=group(detail,`State rate period ${i+1}`);field(stateRow,record,'state','Rate-period state (two letters)');
        field(stateRow,record,'taxableWagesCents','State taxable wages (USD; blank is unknown)',{money:true,optionalMoney:true});
        field(stateRow,record,'rateStatus','State experience-rate assignment',{options:[['unknown','Review required'],['assigned','State assigned an experience rate'],['notAssigned','Reviewed: state did not assign an experience rate']]});
        field(stateRow,record,'experienceRate','Assigned experience rate (%)');field(stateRow,record,'periodStart','Rate period begins (YYYY-MM-DD)');field(stateRow,record,'periodEnd','Rate period ends (YYYY-MM-DD)');
        field(stateRow,record,'paidOnTimeCents','Eligible contributions paid by original due date (USD)',{money:true,optionalMoney:true});field(stateRow,record,'paidLateCents','Eligible contributions paid after original due date (USD)',{money:true,optionalMoney:true});field(stateRow,record,'source','State rate / payment source reference');
        button(stateRow,'Remove this state rate period',()=>b.rows.splice(i,1));
      });
      if(b.rows.length<100)button(detail,'Add state rate period',()=>b.rows.push(newHouseholdFutaRow()));
      const allocations=group(detail,'FUTA wages by worker and state — required for credit-reduction states');
      const allocationNotice=document.createElement('p');allocationNotice.textContent='Allocate each FUTA worker’s first $7,000 of eligible annual wages across the states where those wages were state-taxable. Use EX for wages excluded from every state unemployment tax. Include every eligible worker, and count each wage once. State wage totals cannot replace this federal allocation.';allocations.append(allocationNotice);
      b.allocations.forEach((allocation,i)=>{
        const allocationRow=group(allocations,`Worker/state allocation ${i+1}`);field(allocationRow,allocation,'employeeId','FUTA allocation worker',{options:[['','Select worker'],...value.employees.filter(employee=>employee.futaTreatment==='ordinary').map(employee=>[employee.id,employee.name||'Unnamed worker'])]});field(allocationRow,allocation,'state','FUTA allocation state (two letters or EX)');field(allocationRow,allocation,'wagesCents','Allocated capped FUTA wages (USD; blank is unknown)',{money:true,optionalMoney:true});button(allocationRow,'Remove this FUTA allocation',()=>b.allocations.splice(i,1));
      });
      if(b.allocations.length<1000)button(allocations,'Add worker/state FUTA allocation',()=>b.allocations.push({employeeId:'',state:''}));
      field(allocations,b,'allocationReviewed','Reviewed: every eligible worker’s capped FUTA wages allocated once; state-excluded wages identified',{check:true});
      field(detail,b,'reviewed','Reviewed: all state rate periods and eligible employer payments recorded; no employee charges, penalties, interest, voluntary payments or excess-credit letter claims',{check:true});
      button(detail,'Remove detailed state unemployment records',()=>delete value.unemployment.sectionB);
    }else button(unemployment,'Add detailed state unemployment / Section B',()=>{value.unemployment.sectionB=newHouseholdFuta();});
    for(const [key,label]of householdReviews)field(row,value.review,key,label,{check:true});
    button(row,'Remove this household employer',()=>{individual.householdEmployers.splice(index,1);if(!individual.householdEmployers.length)delete individual.householdEmployers;});
  });
  if(employers.length<(individual.filingStatus==='marriedJoint'?2:1))button(section,'Add household employer',()=>{individual.householdEmployers??=[];individual.householdEmployers.push(newHouseholdEmployer(employers.some(value=>value.owner==='taxpayer')?'spouse':'taxpayer'));});
}
