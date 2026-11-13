import {displayMoney} from './money.mjs';
import {householdEmployment} from './household-employment.mjs';
const page2={'14':'2/2','15':'2/3','16':'2/4','18g':'2/23','18h':'2/24','19':'2/25','20':'2/26','21':'2/27','22':'2/28','23':'2/29','24':'2/30','25':'2/31','26':'2/32'};
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
  }else if(h.threshold===true&&h.futaDetails){
    const details=h.futaDetails;
    for(const [number,line]of [[1,10],[2,11],[3,12]])check(2,number,details.questions[line]?0:1,number===1?'Line10[0].':'');
    details.rows.slice(0,2).forEach((row,index)=>{
      const start=5+index*9,put=(offset,value)=>set(`2/${start+offset}`,value),money=(offset,value)=>put(offset,value===null?null:String(value/100));
      put(0,row.state);money(1,row.b);
      if(row.rateStatus==='assigned'){put(2,row.periodStart.slice(5).replace('-','/'));put(3,row.periodEnd.slice(5).replace('-','/'));if(row.rate!==null)put(4,row.experienceRate+'%');}
      money(5,row.e);money(6,row.f);money(7,row.e===null?null:row.g);money(8,row.h);
    });
    if(details.adjusted)check(2,4,0);
  }
  if(h.threshold===true)check(2,5,0);
}
export function householdWorkpaper(input,line){
  const calculated=input.individual?.householdEmployers?householdEmployment(input.individual.householdEmployers,{year:input.year,filingStatus:input.individual.filingStatus}):null;
  for(const employer of input.individual?.householdEmployers??[]){
    line(`Schedule H payroll workpaper — ${employer.owner}`,12);
    line('Quarterly source amounts retain cents. Worker tax classifications and exclusions require preparer review. This export does not issue or file employer W-2/W-3 or state payroll returns.');
    line(`Prior-year eligible FUTA quarters: ${employer.priorYearFutaQuartersCents.map(amount=>displayMoney(amount)).join(', ')} USD.`);
    for(const employee of employer.employees)line(`${employee.name}: cash wages by quarter ${employee.quartersCents.map(displayMoney).join(', ')} USD; federal withholding ${displayMoney(employee.federalWithholdingCents)} USD; FICA ${employee.ficaTreatment}; FUTA ${employee.futaTreatment}. ${employee.source}`);
    const details=calculated?.forms.find(form=>form.owner===employer.owner)?.household.futaDetails;
    if(!details)continue;
    line(`Schedule H line 17 state unemployment statement — ${employer.owner}`,12);
    line('Amounts below are USD; columns (b), (e), (f), (g), (h) use form whole-dollar rounding. Column (h) includes only contributions paid by the original return due date. Rows after the first two continue line 17 and are included in its totals.');
    details.rows.forEach((row,i)=>{
      const omitted=row.rateStatus==='notAssigned'||row.rate!==null&&row.rate>=54000,cell=value=>omitted?'Not applicable':displayMoney(value);
      line(`Row ${i+1}: (a) ${row.state}; (b) ${displayMoney(row.b)}; (c) ${row.rateStatus==='assigned'?row.periodStart+' to '+row.periodEnd:row.rateStatus==='notAssigned'?'Not assigned':'Unknown'}; (d) ${row.rateStatus==='assigned'?(row.experienceRate?row.experienceRate+'%':'Unknown'):row.rateStatus}.`);
      line(`(e) ${cell(row.e)}; (f) ${cell(row.f)}; (g) ${cell(row.g)}; (h) ${displayMoney(row.h)}. Source: ${row.source}`);
      line(`Recorded source cents: state wages ${displayMoney(row.taxableWagesCents)}; on-time contributions ${displayMoney(row.paidOnTimeCents)}; late contributions ${displayMoney(row.paidLateCents)}.`);
    });
    if(employer.unemployment.sectionB.noStateLiability)line('Explicit review: no state unemployment liability; no state contribution credit claimed.');
    for(const allocation of employer.unemployment.sectionB.allocations){const worker=employer.employees.find(item=>item.id===allocation.employeeId);line(`FUTA allocation: ${worker?.name??'Unknown worker'}; ${allocation.state==='EX'?'Excluded from every state unemployment tax':allocation.state}; ${displayMoney(allocation.wagesCents)} USD, before rounding.`);}
    if(details.worksheet1){line('Schedule H Worksheet 1 — late contributions',12);for(const [key,amount]of Object.entries(details.worksheet1))line(`Worksheet 1 line ${key}: ${displayMoney(amount)} USD.`);}
    if(details.worksheet2){
      const worksheet=details.worksheet2;line('Schedule H Worksheet 2 — annual FUTA credit reduction',12);
      for(const key of ['1','2'])line(`Worksheet 2 line ${key}: ${displayMoney(worksheet[key])} USD.`);
      line(`Worksheet 2 line 3 state selections: ${worksheet.states.join(', ')}.`);
      for(const row of worksheet.reductions)line(`${row.state}: FUTA wages ${displayMoney(row.wagesCents)} USD x ${(row.rate/10000).toFixed(3)} = ${displayMoney(row.reductionCents)} USD.`);
      for(const key of ['4','5'])line(`Worksheet 2 line ${key}: ${displayMoney(worksheet[key])} USD.`);
    }
  }
}

/** Preserve Schedule H's column layout when line 17 has more than two rows. */
export function householdContinuationPdf(pdf,font,input,result){
  const columns=[{width:30,title:['(a)','State']},{width:75,title:['(b)','State wages']},{width:45,title:['(c)','From']},{width:45,title:['(c)','To']},{width:45,title:['(d)','Rate (%)']},{width:75,title:['(e)','(b) x 0.054']},{width:75,title:['(f)','(b) x (d)']},{width:75,title:['(g)','(e) minus (f)']},{width:75,title:['(h)','Paid by due date']}];
  for(const item of result.forms.filter(item=>item.form==='f1040sh'&&!item.household.sectionA&&item.household.threshold===true&&item.household.futaDetails?.rows.length>2)){
    const rows=item.household.futaDetails.rows.slice(2),party=item.owner==='spouse'?input.individual.spouseName:input.party.name;let page,y;
    const text=(value,x,baseline,width,size=8)=>{
      const content=String(value);while(size>6&&font.widthOfTextAtSize(content,size)>width-6)size-=.25;
      if(font.widthOfTextAtSize(content,size)>width-6)throw new Error('A Schedule H continuation cell cannot fit its original text; no truncated value was exported.');
      page.drawText(content,{x:x+3,y:baseline,size,font});
    };
    const grid=(top,bottom)=>{let x=36;for(const column of [...columns,{width:0}]){page.drawLine({start:{x,y:top},end:{x,y:bottom},thickness:.5});x+=column.width;}for(const baseline of [top,bottom])page.drawLine({start:{x:36,y:baseline},end:{x:576,y:baseline},thickness:.5});};
    rows.forEach((row,index)=>{
      if(!page||y<90){
        page=pdf.addPage([612,792]);text(`${input.year} Schedule H — line 17 continuation`,36,750,540,13);text(`${party} / employer EIN ${item.household.ein}`,36,730,540,10);text('Continued rows are included in Schedule H line 18 totals. Amounts are whole USD.',36,712,540,9);y=692;
        grid(y,y-34);let x=36;for(const column of columns){column.title.forEach((title,i)=>text(title,x,y-12-i*11,column.width,7));x+=column.width;}y-=34;
      }
      const money=value=>value===null?'':String(value/100),assigned=row.rateStatus==='assigned';
      const cells=[row.state,money(row.b),assigned?row.periodStart.slice(5).replace('-','/'):'',assigned?row.periodEnd.slice(5).replace('-','/'):'',assigned&&row.rate!==null?row.experienceRate+'%':'',money(row.e),money(row.f),row.e===null?'':money(row.g),money(row.h)];
      grid(y,y-26);let x=36;cells.forEach((cell,i)=>{text(cell,x,y-17,columns[i].width);x+=columns[i].width;});page.drawText(String(index+3),{x:22,y:y-17,size:7,font});y-=26;
    });
  }
}
