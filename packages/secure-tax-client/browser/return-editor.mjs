import { newReturn,calculateReturn,calculationYears,returnTypes,filingStatuses,expenseCategories,parseMoney,displayMoney,scopeNotice } from '@shuug/tax-engine';
import { renderReturn } from './return-view.mjs';

const treatments=[
  ['dependents-credits','Dependents or refundable/nonrefundable credits, including EITC'],
  ['senior-blind-dependent','Age 65+, blindness, or a taxpayer claimed as a dependent'],
  ['schedule-1a','Tips, overtime, senior or car-loan interest deductions (Schedule 1-A)'],
  ['capital-income','Qualified dividends, capital gains, digital assets or asset sales'],
  ['retirement-benefits','Retirement distributions or Social Security benefits'],
  ['rental-pass-through','Rentals, farm income or received partnership/S corporation K-1s'],
  ['itemized-adjustments','Itemized deductions, spouse itemizing, health/retirement/education adjustments'],
  ['inventory-assets','Inventory workpapers, depreciation, home office or asset disposition'],
  ['limitations','Passive, at-risk, excess-loss, AMT or net-investment-income limitations'],
  ['railroad-unreported-wages','Railroad retirement (RRTA), unreported tips/wages (Forms 4137/8919), or W-2 box 12 uncollected taxes'],
  ['foreign','Foreign income, owners, accounts, treaty or withholding requirements'],
  ['entity-special','Entity credits, special taxes/deductions, NOLs, capital/basis or ownership changes'],
  ['state-local','State or local returns'],['amendment','Amended, fiscal-year or short-year return'],
];
const node=(document,tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};

/** Encrypted client-side return editor. No taxpayer input goes to a calculator
 * server or browser storage. onSave uses the existing authenticated vault/CAS. */
export function mountReturnEditor(document,container,{onSave,run,captureScope=()=>0,isCurrentScope=()=>true,onDirty=()=>{},download=()=>{},confirm=globalThis.confirm,proposalOnly=false,allowCreation=false}={}){
  let draft=newReturn(),editingId=null,creating=false,dirty=false,enabled=false,readers=[],sequence=0;
  const section=node(document,'section');section.id='tax-preparation';
  const heading=node(document,'h2','Prepare a tax return'),notice=node(document,'p',scopeNotice),kind=node(document,'select');kind.id='return-kind';
  const kindLabel=node(document,'label','Return type');kindLabel.htmlFor=kind.id;const year=node(document,'select'),yearLabel=node(document,'label','Tax year');year.id='return-year';yearLabel.htmlFor=year.id;for(const value of calculationYears){const option=node(document,'option',String(value));option.value=String(value);year.append(option);}for(const type of returnTypes){const option=node(document,'option',type.label);option.value=type.id;kind.append(option);}
  const scope=node(document,'p','Current calculations accept reviewed ordinary wages, taxable interest, nonqualified ordinary dividends and eligible business amounts. Extra schedules and credits must be selected below; this pack never treats an unknown treatment as zero. Business forms include ordinary-income workpapers; entity disclosures and full K-1 schedules remain incomplete.');
  const body=node(document,'div'),output=node(document,'div'),calculate=node(document,'button','Calculate draft'),save=node(document,'button',proposalOnly?'Save private correction review kit':'Encrypt and save return'),clear=node(document,'button',proposalOnly?'Discard correction':'New return');for(const button of [calculate,save,clear])button.type='button';clear.className='secondary';
  if(proposalOnly)scope.textContent+=' Preparing a return proposal downloads encrypted input and a readable private review in one file. Keep that file on trusted firm devices. The separate key environment must approve its exact content before owner publication creates or changes a client return.';
  section.append(heading,notice,kindLabel,kind,yearLabel,year,scope,body,calculate,save,clear,output);container.append(section);
  const modified=()=>{dirty=true;output.replaceChildren(node(document,'p','Input changed. Calculate again to review the current draft.'));onDirty();};
  function field(parent,target,key,label,{money=false,options=null,check=false,multiline=false,privateId=false,optionalMoney=false}={}){
    const id=`return-field-${++sequence}`,wrapper=node(document,'div'),caption=node(document,'label',label),input=node(document,options?'select':multiline?'textarea':'input');caption.htmlFor=id;input.id=id;input.dataset.returnField=key;
    if(options){for(const [value,name]of options){const option=node(document,'option',name);option.value=value;input.append(option);}input.value=target[key];}
    else if(check){input.type='checkbox';input.checked=target[key]===true;wrapper.className='tax-check';}
    else{if(!multiline)input.type=privateId?'password':'text';input.value=money?(target[key]||optionalMoney&&target[key]===0?displayMoney(target[key]):''):target[key]??'';input.maxLength=multiline?10000:money?18:200;if(money){input.inputMode='decimal';input.placeholder=optionalMoney?'Enter source amount':'0.00';}if(privateId){input.autocomplete='off';input.maxLength=11;}}
    input.disabled=!enabled;wrapper.append(caption,input);parent.append(wrapper);
    readers.push(()=>{if(optionalMoney&&input.value.trim()===''){delete target[key];return;}target[key]=check?input.checked:money?(parseMoney(input.value)??0):input.value;});return input;
  }
  function group(parent,label){const details=node(document,'details');details.open=true;details.append(node(document,'summary',label));parent.append(details);return details;}
  function button(parent,text,action){const value=node(document,'button',text);value.type='button';value.className='secondary';value.disabled=!enabled;value.addEventListener('click',()=>run(async()=>{collect();action();dirty=true;draw();onDirty();}));parent.append(value);}
  function collect(){for(const read of readers)read();return structuredClone(draft);}
  function validate(value){const result=calculateReturn(value);if(!result.calculationAvailable)throw new Error(result.diagnostics[0].message);return value;}
  function expenseFields(parent,business){
    const details=group(parent,'Reviewed deductible expenses');details.open=false;
    details.append(node(document,'p','Enter the eligible deductible amount after business-use, meal, capitalization and other limits. Gross spending is not automatically a tax deduction. Keep source records and explanations.'));
    const rows=new Map(business.expenses.map(item=>[item.category,item]));
    for(const [category,label]of expenseCategories){const item=rows.get(category)??{category,amountCents:0,description:''};field(details,item,'amountCents',`${label} (USD)`,{money:true});field(details,item,'description',`${label}: source / tax treatment`);rows.set(category,item);}
    readers.push(()=>{business.expenses=[...rows.values()].filter(item=>item.amountCents||item.description);});
  }
  function draw(){
    readers=[];sequence=0;body.replaceChildren();output.replaceChildren();kind.value=draft.kind;year.value=String(draft.year);heading.textContent=proposalOnly?(creating?'Prepare a new client return':'Propose a return correction'):editingId?'Edit encrypted tax return':'Prepare a tax return';section.hidden=proposalOnly&&!editingId&&!creating;
    save.textContent=proposalOnly?(creating?'Save private new-return review kit':'Save private correction review kit'):'Encrypt and save return';clear.textContent=proposalOnly?(creating?'Discard new return':'Discard correction'):'New return';
    const identity=group(body,'Return identity');for(const [key,label]of [['name','Full taxpayer / entity legal name'],...(draft.individual?[['firstName','First name and middle initial for Form 1040'],['lastName','Last name for Form 1040']]:[]),['taxId','Taxpayer ID / EIN (hidden)'],['street','Street address'],['city','City'],['state','State'],['zip','ZIP code']])field(identity,draft.party,key,label,{privateId:key==='taxId'});
    if(draft.individual){
      const value=draft.individual,filing=group(body,'Filing details and payments');field(filing,value,'filingStatus','Filing status',{options:filingStatuses});field(filing,value,'spouseName','Spouse full legal name (joint return)');field(filing,value,'spouseFirstName','Spouse first name and middle initial');field(filing,value,'spouseLastName','Spouse last name');field(filing,value,'spouseTaxId','Spouse taxpayer ID (hidden)',{privateId:true});
      for(const [key,label]of [['taxableInterestCents','Taxable interest'],['ordinaryDividendsCents','Nonqualified ordinary dividends'],['priorQbiLossCents','Prior-year QBI loss carryforward'],['estimatedPaymentsCents','Federal estimated payments'],['priorYearAppliedCents','Prior-year overpayment applied']])field(filing,value,key,`${label} (USD)`,{money:true});
      const wages=group(body,`W-2 income (${value.w2s.length})`);value.w2s.forEach((wage,index)=>{const row=group(wages,`W-2 ${index+1}`);field(row,wage,'employer','Employer');field(row,wage,'owner','Employee',{options:[['taxpayer','Taxpayer'],['spouse','Spouse (joint return)']]});for(const [key,label]of [['wagesCents','Box 1 wages'],['socialSecurityWagesCents','Box 3 Social Security wages'],['medicareWagesCents','Box 5 Medicare wages'],['federalWithholdingCents','Box 2 federal withholding']])field(row,wage,key,`${label} (USD)`,{money:true});field(row,wage,'medicareTaxWithheldCents','Box 6 Medicare tax withheld (USD; required for Form 8959)',{money:true,optionalMoney:true});button(row,'Remove this W-2',()=>value.w2s.splice(index,1));});
      if(value.w2s.length<100)button(wages,'Add W-2',()=>value.w2s.push({id:crypto.randomUUID(),owner:'taxpayer',employer:'',wagesCents:0,socialSecurityWagesCents:0,medicareWagesCents:0,federalWithholdingCents:0}));
      const businesses=group(body,`Self-employed businesses (${value.businesses.length})`);value.businesses.forEach((business,index)=>{const row=group(businesses,`Schedule C ${index+1}`);field(row,business,'name','Business / activity name');field(row,business,'ein','Business EIN, if assigned (hidden)',{privateId:true});field(row,business,'businessCode','Principal activity code');field(row,business,'owner','Business owner',{options:[['taxpayer','Taxpayer'],['spouse','Spouse (joint return)']]});
        for(const [key,label]of [['receiptsCents','Gross receipts'],['returnsCents','Returns and allowances'],['costOfGoodsCents','Cost of goods sold'],['otherIncomeCents','Other ordinary business income']])field(row,business,key,`${label} (USD)`,{money:true});
        field(row,business,'materialParticipation','Material participation confirmed',{check:true});field(row,business,'fullyAtRisk','All investment at risk confirmed',{check:true});expenseFields(row,business);button(row,'Remove this Schedule C',()=>value.businesses.splice(index,1));});
      if(value.businesses.length<5)button(businesses,'Add Schedule C business',()=>value.businesses.push({id:crypto.randomUUID(),owner:'taxpayer',name:'',ein:'',businessCode:'',receiptsCents:0,returnsCents:0,costOfGoodsCents:0,otherIncomeCents:0,expenses:[],materialParticipation:false,fullyAtRisk:false}));
    }else{
      const value=draft.entity,income=group(body,'Business income and deductions');field(income,value,'businessName','Business / activity name');field(income,value,'businessCode','Six-digit principal activity code');field(income,value,'accountingMethod','Tax accounting method',{options:[['cash','Cash'],['accrual','Accrual']]});
      for(const [key,label]of [['receiptsCents','Gross receipts / sales'],['returnsCents','Returns and allowances'],['costOfGoodsCents','Cost of goods sold'],['otherIncomeCents','Other ordinary business income'],...(draft.kind==='1065'?[['guaranteedPaymentsCents','Deductible guaranteed payments']]:[['officerCompensationCents','Deductible officer compensation']]),...(draft.kind==='1120'?[['estimatedPaymentsCents','Corporate federal estimated payments']]:[])])field(income,value,key,`${label} (USD)`,{money:true});expenseFields(income,value);
      const owners=group(body,`Owners and ordinary-income allocation (${value.owners.length})`);owners.append(node(document,'p','Enter reviewed ordinary-income allocation percentages totaling exactly 100.00%. Changing ownership, special allocations, basis and capital information need their own completed workpapers.'));
      value.owners.forEach((owner,index)=>{const row=group(owners,`Owner ${index+1}`);field(row,owner,'name','Owner legal name');field(row,owner,'taxId','Owner taxpayer ID (hidden)',{privateId:true});const percent={value:displayMoney(owner.shareBps)};field(row,percent,'value','Ordinary-income allocation (%)');readers.push(()=>{const parsed=parseMoney(percent.value);if(parsed===null||parsed>10000)throw new Error('Use an allocation percentage from 0.00 through 100.00.');owner.shareBps=parsed;});button(row,'Remove this owner',()=>value.owners.splice(index,1));});
      if(value.owners.length<(draft.kind==='1120S'?100:1000))button(owners,'Add owner',()=>value.owners.push({id:crypto.randomUUID(),name:'',taxId:'',shareBps:0}));
    }
    const coverage=group(body,'Additional treatments and preparation review');coverage.append(node(document,'p','Select every additional treatment that applies. Selected items remain in the encrypted input and prevent a complete tax total when the calculation is missing.'));
    const chosen=new Map(),known=new Set(treatments.map(([id])=>id));for(const [id,label]of [...treatments,...draft.features.filter(id=>!known.has(id)).map(id=>[id,id])]){const value={selected:draft.features.includes(id)};field(coverage,value,'selected',label,{check:true});chosen.set(id,value);}readers.push(()=>{draft.features=[...chosen].filter(([,value])=>value.selected).map(([id])=>id);});
    for(const [key,label]of [['identity','Identity and filing details reviewed'],['income','All income sources reviewed'],['deductions','Deduction eligibility and limitations reviewed'],['credits','Credit eligibility reviewed; any credit needing calculation selected above'],...(draft.entity?[['ownership','Entity ownership and allocations reviewed']]:[]),['coverage','Installed coverage reviewed; every additional treatment selected above']])field(coverage,draft.review,key,label,{check:true});field(coverage,draft,'notes','Preparation notes (encrypted)',{multiline:true});updateEnabled();
  }
  function updateEnabled(){for(const control of section.querySelectorAll('input,textarea,select,button'))control.disabled=!enabled;kind.disabled=!enabled||proposalOnly&&!creating;year.disabled=!enabled||editingId!==null;}
  function clearView(){draft=newReturn(kind.value);editingId=null;creating=false;dirty=false;draw();onDirty();}
  const api={get dirty(){return dirty||editingId!==null||creating;},get editingId(){return editingId;},get proposalMode(){return proposalOnly?(creating?'creation':'correction'):null;},get active(){return dirty||editingId!==null||creating||output.childElementCount>0;},setEnabled(value){enabled=value;updateEnabled();},clear:clearView,
    edit(data,id){validate(data);if(!confirmDiscard())return false;draft=structuredClone(data);editingId=id;creating=false;dirty=false;draw();section.scrollIntoView?.({behavior:'smooth',block:'start'});onDirty();return true;},
    startNew(kind='1040',year=2025){if(!proposalOnly||!allowCreation||!returnTypes.some(type=>type.id===kind))throw new Error('New return proposals are unavailable in this editor.');if(!confirmDiscard())return false;draft=newReturn(kind,year);editingId=null;creating=true;dirty=false;draw();section.scrollIntoView?.({behavior:'smooth',block:'start'});onDirty();return true;},
    getInput:()=>collect(),element:section};
  function confirmDiscard(){return !api.dirty||creating&&!dirty||confirm('Discard the current unsaved return input and open another return? Saved ciphertext is retained.');}
  body.addEventListener('input',modified);body.addEventListener('change',modified);
  kind.addEventListener('change',()=>{const next=kind.value;if(proposalOnly&&!creating||!confirmDiscard()){kind.value=draft.kind;return;}draft=newReturn(next,draft.year);editingId=null;dirty=false;draw();onDirty();});
  year.addEventListener('change',()=>{if(editingId!==null){year.value=String(draft.year);return;}collect();draft.year=Number(year.value);modified();draw();});
  clear.addEventListener('click',()=>{if(confirmDiscard())clearView();});
  calculate.addEventListener('click',()=>run(async()=>{const value=validate(collect()),generation=captureScope();output.replaceChildren(renderReturn(document,value,{run,download,isCurrent:()=>isCurrentScope(generation)&&!document.hidden}));}));
  save.addEventListener('click',()=>run(async()=>{const value=validate(collect()),generation=captureScope(),id=editingId;if(!isCurrentScope(generation))throw new Error('The account view changed.');await onSave(value,id,preparedId=>{if(isCurrentScope(generation))editingId=preparedId;});if(isCurrentScope(generation))clearView();}));
  draw();return api;
}
