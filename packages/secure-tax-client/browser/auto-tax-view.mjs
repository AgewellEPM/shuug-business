// Private-client presentation only. The controller owns encryption, persistence,
// source reconciliation and return calculation; this view sends no requests.
const categories={advertising:'Advertising',vehicle:'Vehicle costs — exclude with 0 only',commissions:'Commissions and fees',contractLabor:'Contract labor',employeeBenefits:'Employee benefits',insurance:'Business insurance',mortgageInterest:'Business mortgage interest',otherInterest:'Other business interest',professional:'Legal and professional services',office:'Office expenses',retirement:'Retirement plans',equipmentRent:'Equipment rent',propertyRent:'Property rent',repairs:'Repairs and maintenance',supplies:'Supplies',taxes:'Taxes and licenses',travel:'Business travel',meals:'Business meals',utilities:'Utilities',wages:'Employee wages',other:'Other business expense'};
const node=(document,tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const money=value=>Number.isSafeInteger(value)?`$${(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Needs review';
const amountText=value=>Number.isSafeInteger(value)?(value/100).toFixed(2):'';
const pdfReady=model=>model?.incomeConfirmed===true&&model?.businessConfirmed===true&&Number.isSafeInteger(model?.totals?.receiptsCents)&&Number.isSafeInteger(model?.totals?.deductionsCents);
const decision=(settings,name,record)=>{const value=settings?.[name]?.[record.id];return value?.fingerprint===record.fingerprint?value:null;};
function amountCents(value){
  if(typeof value!=='string'||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value.trim()))throw new Error('Enter a deductible dollar amount with at most two decimal places, or 0.');
  const [whole,fraction='']=value.trim().split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents))throw new Error('The deductible amount exceeds the supported money limit.');return cents;
}
function labelFor(record){const body=record.body??{};return String(body.merchant||body.description||body.purpose||'Saved record').slice(0,240);}
function recordMoney(record){const value=record.body?.amountCents,currency=record.body?.currency;if(!Number.isSafeInteger(value))return 'Amount needs review';return currency==='USD'?money(value):`${currency||'Currency needs review'} ${amountText(value)}`;}
const vehicleSources=new Set(['vehicle','fuel','ev_charging','repairs','maintenance','tires','cleaning','insurance','registration','rental','lease','interest']);
const expenseHints={fees:'commissions',tolls:'other',parking:'other',amenities:'other',other:'other',phone:'utilities',subscriptions:'office',supplies:'supplies',professional:'professional',lodging:'travel',meals:'meals'};
function suggestedExpense(body={}){
  const category=typeof body.category==='string'?body.category.toLowerCase():'',vehicle=vehicleSources.has(category),hint=vehicle?'vehicle':expenseHints[category]??'';
  const amount=body.amountCents,percent=body.businessUsePercent,validPercent=Number.isInteger(percent)&&percent>=0&&percent<=100;
  let candidate;
  if(vehicle||body.classification==='personal')candidate=0;
  else if(category!=='meals'&&body.classification==='business'&&body.currency==='USD'&&validPercent&&Number.isSafeInteger(amount)&&amount>=0)candidate=Number(BigInt(amount)*BigInt(percent)/100n);
  return {category:hint,candidate,validPercent,vehicle};
}
function recordDate(record){return String(record.body?.date??record.body?.localDate??'Date needs review').slice(0,80);}

export function mountAutoTaxView(document,before,{getClient,getState,onYear,onSettings,onExpenseReview,onIncomeReview,onPdf,onEdit,onReload,onReviewPrior,run=operation=>operation(),isWorking=()=>false,captureScope=()=>0,isCurrentScope=()=>true,onDirty=()=>{}}={}){
  const section=node(document,'section');section.id='auto-tax-view';section.hidden=true;before.before(section);
  const drafts=new Map(),pages={income:0,expense:0};let renderedScope=null,localError='',lastDirty=false,suspended=false;
  const privateClient=()=>{const client=getClient?.();return !!client?.clientOnly&&!!client?.unlocked&&!!client?.canWrite;};
  const scopeId=()=>JSON.stringify(getClient?.()?.scope??null);
  const working=()=>!!isWorking()||['loading','saving'].includes(getState?.()?.phase);
  function dirtyChanged(){
    const note=section.querySelector('#auto-tax-unfinished');if(note){note.hidden=drafts.size===0;const text=note.querySelector('p');if(text)text.textContent=`${drafts.size} unfinished expense review${drafts.size===1?' is':'s are'} kept on this page. Finish or cancel before changing year or refreshing records.`;}
    for(const control of section.querySelectorAll('[data-auto-tax-dirty-guard]'))control.disabled=working()||drafts.size>0||control.dataset.autoTaxDisabled==='true';
    const next=drafts.size>0;if(next!==lastDirty){lastDirty=next;onDirty(next);}
  }
  function clear(){drafts.clear();pages.income=pages.expense=0;renderedScope=null;localError='';section.replaceChildren();section.hidden=true;dirtyChanged();}
  function assertCurrent(context,{record=null,source=true}={}){
    const state=getState?.();
    if(!privateClient()||!isCurrentScope(context.generation)||scopeId()!==context.scope||state?.year!==context.year)throw new Error('The private account or tax year changed. Reopen the current draft.');
    if(record){const current=state.model?.source?.records?.find(item=>item.id===record.id&&item.kind===record.kind);if(current?.fingerprint!==record.fingerprint)throw new Error('This recorded item changed. Review its current amount before saving a choice.');}
    else if(source&&state.model?.source?.digest!==context.digest)throw new Error('The app records changed. Review the current draft before confirming.');
    return state;
  }
  function action(context,operation,options={}){
    if(working()||drafts.size>0&&!options.allowDirty)return;
    const perform=async()=>{assertCurrent(context,options);return operation();};
    const failed=error=>{if(privateClient()&&isCurrentScope(context.generation)&&scopeId()===context.scope){localError=error?.message??'The review could not be saved. Your unfinished input is kept.';render();}};
    try{const result=run(async()=>{try{return await perform();}catch(error){failed(error);throw error;}});if(result?.catch)result.catch(()=>{});}catch(error){failed(error);}
  }
  function button(text,handler,disabled=false){const control=node(document,'button',text);control.type='button';control.disabled=disabled;control.addEventListener('click',handler);return control;}
  function guardedAction(context,title,callback){
    const control=button(title,()=>action(context,()=>callback()),working()||drafts.size>0||typeof callback!=='function');
    control.dataset.autoTaxDirtyGuard='true';control.dataset.autoTaxDisabled=String(typeof callback!=='function');return control;
  }
  function checkbox(title,id,checked,changed,disabled){const label=node(document,'label'),input=node(document,'input');input.type='checkbox';input.id=id;input.checked=checked===true;input.disabled=disabled||drafts.size>0;input.dataset.autoTaxDirtyGuard='true';input.dataset.autoTaxDisabled=String(disabled&&!working());label.htmlFor=id;label.append(input,node(document,'span',title));input.addEventListener('change',()=>changed(input.checked));return label;}
  function render(){
    if(suspended||!privateClient()||getState?.()?.phase==='locked'){clear();return;}
    const currentScope=scopeId();if(renderedScope!==null&&renderedScope!==currentScope){clear();}
    renderedScope=currentScope;section.hidden=false;
    const state=getState?.()??{},model=state.model,settings=state.settings??{},busy=working(),context={scope:currentScope,generation:captureScope(),year:state.year,digest:model?.source?.digest};
    section.replaceChildren();section.append(node(document,'h2','Your tax draft from app records'),node(document,'p','Your draft updates from the records in this private account. Review what counts as gross business receipts and deductible expenses. No return is signed or filed here.'));
    const yearLabel=node(document,'label','Tax year'),year=node(document,'select');year.id='auto-tax-year';yearLabel.htmlFor=year.id;
    for(const value of state.years??[2023,2024,2025,2026,2027]){const option=node(document,'option',String(value));option.value=String(value);year.append(option);}year.value=String(state.year??'');year.dataset.autoTaxDirtyGuard='true';year.dataset.autoTaxDisabled=String(typeof onYear!=='function');year.disabled=busy||drafts.size>0||typeof onYear!=='function';year.addEventListener('change',()=>action(context,()=>onYear(Number(year.value)),{source:false}));section.append(yearLabel,year);
    const status=node(document,'p');status.id='auto-tax-save-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    status.textContent=state.phase==='loading'?'Updating your draft from current app records…':state.phase==='saving'?'Saving this draft encrypted for your client key…':state.phase==='error'?'Your latest draft update needs retry or review.':state.persisted?'Current draft saved encrypted in your private workspace.':'Draft prepared on this device; encrypted save is pending.';section.append(status);
    const error=localError||state.error;if(error){const message=node(document,'p',String(error));message.className='error';message.setAttribute('role','alert');section.append(message);}
    if(state.phase==='error')section.append(guardedAction(context,'Reload saved private draft',onReload));
    if(Number.isSafeInteger(state.archivedCount)&&state.archivedCount>0)section.append(node(document,'p',`${state.archivedCount} earlier encrypted draft ${state.archivedCount===1?'copy is':'copies are'} kept for private review.`),guardedAction(context,'Review earlier saved draft',onReviewPrior));
    const unfinished=node(document,'div');unfinished.id='auto-tax-unfinished';unfinished.hidden=drafts.size===0;unfinished.append(node(document,'p',`${drafts.size} unfinished expense review${drafts.size===1?' is':'s are'} kept on this page. Finish or cancel before changing year or refreshing records.`),button('Cancel unfinished expense inputs',()=>{if(!privateClient()||!isCurrentScope(context.generation)||scopeId()!==context.scope||getState?.()?.year!==context.year)return;drafts.clear();localError='';dirtyChanged();render();},busy));section.append(unfinished);
    if(!model){section.append(node(document,'p','Unlock and refresh this account to prepare its draft. Unavailable income and tax amounts are not assumed to be zero.'));return;}
    const cards=node(document,'div');cards.className='portal-cards';
    for(const [label,value]of [['Income recorded in app',money(model.totals?.recordedIncomeCents)],['Expenses recorded in app',money(model.totals?.recordedExpenseCents)],['Business miles recorded',Number.isFinite(model.totals?.businessDistanceMeters)?(model.totals.businessDistanceMeters/1609.344).toLocaleString('en-US',{maximumFractionDigits:2}):'Needs review']]){const card=node(document,'div');card.className='portal-card';card.append(node(document,'strong',value),node(document,'span',label));cards.append(card);}section.append(cards,node(document,'p','Recorded amounts are not automatically gross receipts or deductions. Trip fares, bank deposits and net payouts are not added to income just because they appear in the app.'));
    const known=node(document,'section');known.append(node(document,'h3','Reviewed Schedule C draft'));
    const totals=node(document,'dl');totals.className='tax-return-totals';for(const [title,value]of [['Gross business receipts',model.totals?.receiptsCents],['Business deductions',model.totals?.deductionsCents],['Schedule C profit or loss',model.totals?.profitCents]])totals.append(node(document,'dt',title),node(document,'dd',money(value)));known.append(totals,node(document,'p','These are preparation figures for the reviewed app activity, not your final income tax, refund or amount owed. Complete identity, other income, credits and annual-form reviews in the return editor.'));section.append(known);
    const review=node(document,'section');review.append(node(document,'h3','What needs your review'));
    const issues=[...(model.issues??[]),...(model.source?.issues??[])],unique=new Map(issues.map(item=>[`${item.code??''}|${item.message??''}`,item]));
    if(unique.size){const list=node(document,'ul');for(const item of unique.values())list.append(node(document,'li',String(item.message??item.code??'Review this source item.')));review.append(list);}else review.append(node(document,'p','Current app-source checks are complete. Other return facts and filing requirements still need review.'));
    review.append(checkbox('I reconciled these income entries to gross business receipts without duplicates; they are not merely bank deposits or net platform payouts.','auto-tax-income-confirmed',model.incomeConfirmed,checked=>action(context,()=>onSettings({incomeConfirmed:checked})),busy||typeof onSettings!=='function'));
    review.append(checkbox('This app activity belongs to my one U.S. sole-proprietor business for Schedule C.','auto-tax-business-confirmed',model.businessConfirmed,checked=>action(context,()=>onSettings({businessConfirmed:checked})),busy||typeof onSettings!=='function'));
    const methodLabel=node(document,'label','Vehicle deduction review'),method=node(document,'select');method.id='auto-tax-vehicle-method';methodLabel.htmlFor=method.id;for(const [value,title]of [['unreviewed','Choose after reviewing vehicle eligibility'],['standard','Use eligible business miles at the annual standard rate'],['none','Do not claim mileage or vehicle operating costs from these records']]){const option=node(document,'option',title);option.value=value;method.append(option);}method.value=settings.vehicleMethod??'unreviewed';method.dataset.autoTaxDirtyGuard='true';method.dataset.autoTaxDisabled=String(typeof onSettings!=='function');method.disabled=busy||drafts.size>0||typeof onSettings!=='function';method.addEventListener('change',()=>action(context,()=>onSettings({vehicleMethod:method.value,mileageEligible:false})));review.append(methodLabel,method,node(document,'p','Actual vehicle costs and depreciation need separate workpapers. This automatic draft does not claim them under any current vehicle choice. Enter 0 to exclude those recorded costs; do not enter a positive Vehicle costs deduction here.'));
    if(settings.vehicleMethod==='standard')review.append(checkbox('I reviewed the vehicle-method requirements and confirm these business miles qualify; commuting and personal miles are excluded.','auto-tax-mileage-eligible',settings.mileageEligible,checked=>action(context,()=>onSettings({mileageEligible:checked})),busy||typeof onSettings!=='function'));
    section.append(review);
    const records=model.source?.records??[];
    for(const kind of ['income','expense']){
      const rows=records.filter(record=>record.kind===kind),area=node(document,'details');area.open=true;area.id=`auto-tax-${kind}-review`;area.append(node(document,'summary',`${kind==='income'?'Income inclusion':'Expense deduction'} review · ${rows.length}`));
      if(!rows.length)area.append(node(document,'p',`No ${kind} entries were recorded for this draft year.`));
      const max=Math.max(0,Math.ceil(rows.length/20)-1);pages[kind]=Math.min(pages[kind],max);
      for(const original of rows.slice(pages[kind]*20,(pages[kind]+1)*20)){
        const record=structuredClone(original); // Detached events retain the displayed fingerprint.
        const row=node(document,'article');row.className='item';row.dataset.recordId=record.id;row.append(node(document,'h4',labelFor(record)),node(document,'p',`${recordDate(record)} · ${recordMoney(record)}`));
        if(kind==='income'){
          const saved=decision(settings,'incomeDecisions',record);row.append(node(document,'p',saved?`Reviewed: ${saved.include?'include in gross business receipts':'exclude from gross business receipts'}.`:'Confirm whether this entry belongs in gross business receipts, particularly if another entry records the same payment.'));
          row.append(button('Include this income',()=>action(context,()=>onIncomeReview(record.id,{fingerprint:record.fingerprint,include:true}),{record}),busy||typeof onIncomeReview!=='function'),button('Exclude this income',()=>action(context,()=>onIncomeReview(record.id,{fingerprint:record.fingerprint,include:false}),{record}),busy||typeof onIncomeReview!=='function'));
        }else{
          const key=`${state.year}|${record.id}|${record.fingerprint}`,saved=decision(settings,'expenseDecisions',record),draft=drafts.get(key),suggested=suggestedExpense(record.body),category=node(document,'select'),amount=node(document,'input'),categoryLabel=node(document,'label','Expense category'),amountLabel=node(document,'label','Deductible business amount (USD)');
          const id=`auto-tax-expense-${encodeURIComponent(record.id)}`;category.id=id+'-category';amount.id=id+'-amount';categoryLabel.htmlFor=category.id;amountLabel.htmlFor=amount.id;
          const empty=node(document,'option','Choose a category after reviewing the record');empty.value='';category.append(empty);for(const [value,title]of Object.entries(categories)){const option=node(document,'option',title);option.value=value;category.append(option);}category.value=draft?.category??saved?.category??suggested.category;
          amount.type='text';amount.inputMode='decimal';amount.value=draft?.amount??amountText(saved?.deductibleCents??suggested.candidate);amount.placeholder='Review amount, or 0 to exclude';category.disabled=amount.disabled=busy;
          const changed=()=>{try{assertCurrent(context,{record});drafts.set(key,{category:category.value,amount:amount.value});localError='';dirtyChanged();}catch(error){localError=error.message;render();}};category.addEventListener('change',changed);amount.addEventListener('input',changed);
          const body=record.body??{},purpose=typeof body.businessPurpose==='string'&&body.businessPurpose.trim()?body.businessPurpose.trim().slice(0,600):'Business purpose needs review';
          row.append(node(document,'p',`App source: ${body.category||'category not recorded'}; ${body.classification||'classification not recorded'}; business use ${suggested.validPercent?body.businessUsePercent+'%':'not explicitly recorded as a valid whole percent'}. ${purpose}.`));
          if(!saved)row.append(node(document,'p',`SUGGESTED tax category: ${categories[suggested.category]??'needs review'}. ${suggested.candidate===undefined?'The deductible amount needs your review.':'Candidate amount: '+money(suggested.candidate)+(suggested.candidate===0?' (exclusion).':' from the recorded business share, rounded down to cents.')} These starting values are UNREVIEWED. Nothing is applied until you explicitly save this expense review.`));
          row.append(node(document,'p','Review business purpose and any mixed-use share. Equipment, depreciation and other special treatments need their own review; a suggested category does not establish current deductibility.'));
          row.append(categoryLabel,category,amountLabel,amount,node(document,'p','Enter only the eligible deductible business share. A recorded expense or a receipt alone does not establish deductibility. Use 0 with a category to exclude it.'));
          row.append(button('Save this expense review',()=>action(context,async()=>{
            if(!Object.hasOwn(categories,category.value))throw new Error('Choose the reviewed expense category.');const value=amountCents(amount.value);
            if(category.value==='vehicle'&&value>0)throw new Error('Actual vehicle costs and depreciation need separate workpapers. Use 0 to exclude this recorded cost from the automatic draft.');
            if(!Number.isSafeInteger(record.body?.amountCents)||value>Math.max(0,record.body.amountCents))throw new Error('The deductible amount cannot exceed this recorded expense. Review refunds or corrections in the return editor.');
            await onExpenseReview(record.id,{fingerprint:record.fingerprint,category:category.value,deductibleCents:value});assertCurrent(context,{record,source:false});drafts.delete(key);localError='';dirtyChanged();render();
          },{record,allowDirty:true}),busy||typeof onExpenseReview!=='function'),button('Cancel this expense input',()=>{try{assertCurrent(context,{record});drafts.delete(key);localError='';dirtyChanged();render();}catch(error){localError=error.message;render();}},busy));
        }
        area.append(row);
      }
      if(rows.length>20){area.append(button('Previous '+kind+' entries',()=>{if(!isCurrentScope(context.generation)||scopeId()!==context.scope)return;pages[kind]--;render();},busy||pages[kind]===0),node(document,'span',` Page ${pages[kind]+1} of ${max+1} `),button('Next '+kind+' entries',()=>{if(!isCurrentScope(context.generation)||scopeId()!==context.scope)return;pages[kind]++;render();},busy||pages[kind]>=max));}section.append(area);
    }
    const actions=node(document,'section');actions.append(node(document,'h3','Continue preparing your return'),node(document,'p','Saved drafts update as app records and reviewed choices change. PDF downloads create a readable copy outside this private workspace. Neither action files a return.'));
    if(!pdfReady(model))actions.append(node(document,'p','Review the app amounts and business eligibility before downloading a draft PDF. You can fill missing details in the full return editor.'));
    for(const [title,callback]of [['Download draft PDF',onPdf],['Open full return editor',onEdit]]){const isPdf=title==='Download draft PDF',unavailable=typeof callback!=='function'||isPdf&&!pdfReady(model);const control=button(title,()=>action(context,()=>{if(isPdf&&!pdfReady(getState?.()?.model))throw new Error('Review app receipts, deductions and business eligibility before downloading a draft PDF.');return callback();}),busy||drafts.size>0||unavailable);control.dataset.autoTaxDirtyGuard='true';control.dataset.autoTaxDisabled=String(unavailable);actions.append(control);}section.append(actions);
  }
  document.addEventListener('visibilitychange',()=>{suspended=document.hidden;if(suspended)clear();});document.defaultView?.addEventListener('pagehide',()=>{suspended=true;clear();});document.defaultView?.addEventListener('pageshow',()=>{suspended=false;});
  return {element:section,render,clear,refresh:render,get dirty(){return drafts.size>0;}};
}
