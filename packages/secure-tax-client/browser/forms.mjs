import { encode64 } from '../envelope.mjs';

export const FORM_TYPES=Object.freeze({document:'Tax document',note:'Business information / note',identity:'Tax identity',intake:'Tax-prep details',income:'Income',expense:'Expense',trip:'Trip / completed work',goals:'Goals',reserves:'Planning reserves','work-settings':'Delivery & shopping settings'});
const classifications=['unclassified','business','personal'];
const rideRoles=['ride','delivery','shopping','reposition','other'];
const businessTypes=['unsure','sole-proprietor','single-member-llc','partnership','corporation'];
const categories=['fuel','repairs','maintenance','tires','insurance','registration','ev_charging','cleaning','rental','lease','interest','tolls','parking','meals','lodging','amenities','supplies','phone','fees','subscriptions','training','professional','other'];
const today=()=>new Date().toISOString().slice(0,10);
const amount=value=>Number.isFinite(value)?String(value/100):'';
const label=value=>String(value).replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,char=>char.toUpperCase());
export function formType(data){
  if(data?.version!==1)return null;
  if(data.type==='tax-identity')return 'identity';
  if(data.type==='business-note')return 'note';
  if(data.type==='coach-intake')return 'intake';if(data.type==='universal-gig-settings')return 'work-settings';
  if(data.type==='driver-record'&&['income','expense','trip'].includes(data.record?.kind))return data.record.kind;
  if(data.type==='driver-goals')return 'goals';if(data.type==='planning-reserves')return 'reserves';return null;
}
export function maskedDisplay(value,depth=0){
  if(depth>12)return '[Nested private detail]';
  if(Array.isArray(value))return value.map(item=>maskedDisplay(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/ssn|social.?security|taxpayer.?id/i.test(key)?typeof item==='string'?`•••-••-${item.replace(/\D/g,'').slice(-4)}`:'[Private ID hidden]':maskedDisplay(item,depth+1)]));
  return value;
}
const number=(value,name,min,max,optional=false)=>{
  if(optional&&String(value).trim()==='')return null;
  if(String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new Error(`${name} must be between ${min} and ${max}.`);
  return Number(value);
};
const money=(value,name,optional=false)=>{const valueNumber=number(value,name,0,1000000,optional);return valueNumber===null?null:Math.round(valueNumber*100);};
const text=(value,name,max=1000)=>{if(typeof value!=='string'||value.length>max)throw new Error(`${name} is too long.`);return value.trim();};
const date=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Choose a valid recorded date.');return value;};
export function validatedWorkURL(input){
  const value=text(input,'Work app link',2048);if(!value)return null;
  let url;try{url=new URL(value);}catch{throw new Error('Use a public HTTPS work link without credentials, or leave it blank.');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!host.includes('.')||host.includes(':')||/^[0-9.]+$/.test(host)||['.local','.internal','.localhost'].some(suffix=>host.endsWith(suffix)))throw new Error('Use a public HTTPS work link without credentials, or leave it blank.');
  return url.href;
}
export function buildFormPayload(kind,values,original=null){
  const base=original?structuredClone(original):{version:1},body={...(original?.record?.body??{})};
  if(kind==='note'){
    const title=text(values.title,'Business information title',200);if(!title)throw new Error('Enter a title for this business information.');
    return {domain:'driver-state',payload:{...base,type:'business-note',title,date:date(values.date),notes:text(values.notes,'Business information',10000)}};
  }
  if(kind==='intake'){
    const coachIntake={...(original?.coachIntake??{})},year=number(values.taxYear,'Tax year',1900,9999,true),jurisdiction=text(values.jurisdiction,'Jurisdiction',80);
    if(year!==null&&!Number.isInteger(year))throw new Error('Tax year must be a whole year.');
    if(jurisdiction&&([...jurisdiction].length<2||!/^[\p{L} .,'-]+$/u.test(jurisdiction)))throw new Error('Use a state or country name without account or taxpayer numbers.');
    if(!businessTypes.includes(values.businessType))throw new Error('Choose a business arrangement.');
    if(year===null)delete coachIntake.taxYear;else coachIntake.taxYear=year;
    if(!jurisdiction)delete coachIntake.jurisdiction;else coachIntake.jurisdiction=jurisdiction;
    coachIntake.businessType=values.businessType;
    return {domain:'driver-state',payload:{...base,type:'coach-intake',coachIntake}};
  }
  if(kind==='work-settings'){
    const settings={...(original?.universalGigSettings??{})};
    for(const workType of ['delivery','shopping']){
      const workLabel=text(values[`${workType}Label`],`${label(workType)} work label`,80);if(!workLabel)throw new Error('Enter a work or app name between 1 and 80 characters.');
      const profile={...(settings[workType]??{}),workLabel},url=validatedWorkURL(values[`${workType}URL`]);if(url)profile.appURL=url;else delete profile.appURL;settings[workType]=profile;
    }
    return {domain:'driver-state',payload:{...base,type:'universal-gig-settings',universalGigSettings:settings}};
  }
  if(kind==='identity'){
    const legalName=text(values.legalName,'Legal name',200);if(!legalName)throw new Error('Enter the legal name.');
    const result={...base,type:'tax-identity',legalName,taxYear:number(values.taxYear,'Tax year',2000,2100,true)};
    if(result.taxYear===null)delete result.taxYear;else if(!Number.isInteger(result.taxYear))throw new Error('Tax year must be a whole year.');
    if(values.ssn){const digits=values.ssn.replaceAll('-','').replaceAll(' ','');if(!/^\d{9}$/.test(digits))throw new Error('Enter all nine SSN digits, or leave the existing SSN unchanged.');result.ssn=digits;}
    return {domain:'tax-identity',payload:result};
  }
  if(kind==='goals'){
    const goals={...(original?.goals??{})};for(const key of ['dailyNetCents','weeklyNetCents','targetHourlyCents','vehicleCostCentsPerMile']){const value=money(values[key],label(key),true);if(value===null)delete goals[key];else goals[key]=value;}
    return {domain:'driver-state',payload:{...base,type:'driver-goals',goals}};
  }
  if(kind==='reserves')return {domain:'driver-state',payload:{...base,type:'planning-reserves',reserveSettings:{...(original?.reserveSettings??{}),taxPercent:number(values.taxPercent,'Tax planning percent',0,100),vehiclePercent:number(values.vehiclePercent,'Vehicle planning percent',0,100)}}};
  if(!['income','expense','trip'].includes(kind))throw new Error('Choose a supported private item.');
  if(kind==='trip'){
    const started=new Date(values.startedAt),ended=values.endedAt?new Date(values.endedAt):null;
    if(!Number.isFinite(started.getTime())||(ended&&(!Number.isFinite(ended.getTime())||ended<started)))throw new Error('Choose a valid start time and an end time after it.');
    Object.assign(body,{startedAt:started.toISOString(),distanceMeters:number(values.miles,'Miles',0,100000)*1609.344,purpose:text(values.purpose,'Purpose'),notes:text(values.notes,'Notes',10000),classification:values.classification,source:body.source??'manual-web',hasGaps:body.hasGaps??false,sampleCount:body.sampleCount??0,localDate:values.startedAt.slice(0,10),timeZoneId:Intl.DateTimeFormat().resolvedOptions().timeZone});
    if(ended)body.endedAt=ended.toISOString();else delete body.endedAt;
    for(const [key,input] of [['earningsCents','fare'],['platformFeesCents','fees']]){const value=money(values[input],label(input),true);if(value===null)delete body[key];else body[key]=value;}
    body.platform=text(values.platform,'Platform',100);
    if(values.rideRole){if(!rideRoles.includes(values.rideRole))throw new Error('Choose the type of completed work.');body.rideRole=values.rideRole;}
  }else{
    Object.assign(body,{date:date(values.date),amountCents:money(values.amount,'Amount'),currency:body.currency??'USD',notes:text(values.notes,'Notes',10000)});
    if(kind==='income')Object.assign(body,{platform:text(values.platform,'Platform',100),description:text(values.description,'Description')});
    else{
      if(!categories.includes(values.category))throw new Error('Choose an expense category.');
      Object.assign(body,{merchant:text(values.merchant,'Merchant',200),category:values.category,classification:values.classification,businessPurpose:text(values.businessPurpose,'Business purpose'),businessUsePercent:number(values.businessUsePercent,'Business use percent',0,100,true)});
      if(body.businessUsePercent===null)delete body.businessUsePercent;else if(!Number.isInteger(body.businessUsePercent))throw new Error('Business use percent must be a whole number.');
    }
  }
  if(kind!=='income'&&!classifications.includes(body.classification))throw new Error('Choose a classification.');
  return {domain:'driver-record',payload:{...base,type:'driver-record',record:{...(original?.record??{id:crypto.randomUUID(),revision:0,deleted:false}),kind,body}}};
}
export async function documentPayload(file){
  if(!file||file.size<1||file.size>10*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw new Error('Choose a PDF, JPEG or PNG file of at most 10 MiB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  try{return {domain:'tax-document',payload:{version:1,type:'private-file',filename:file.name,mime:file.type,data:encode64(bytes)}};}finally{bytes.fill(0);}
}
export function mountForms(document,container,{onSave,onDelete,run,captureScope=()=>null,isCurrentScope=()=>true,onDirty=()=>{}}){
  let original=null,editingId=null,enabled=false,dirty=false;const fields=new Map(),choice=document.createElement('select'),body=document.createElement('div'),notice=document.createElement('p');
  choice.id='private-item-type';for(const [value,name] of Object.entries(FORM_TYPES)){const option=document.createElement('option');option.value=value;option.textContent=name;choice.append(option);}
  const choiceLabel=document.createElement('label');choiceLabel.htmlFor=choice.id;choiceLabel.textContent='What would you like to save?';
  const save=document.createElement('button');save.type='button';save.textContent='Encrypt and save';const clear=document.createElement('button');clear.type='button';clear.className='secondary';clear.textContent='New item';
  container.append(choiceLabel,choice,body,notice,save,clear);
  function field(key,name,value='',type='text',options){
    const wrapper=document.createElement('div'),labelElement=document.createElement('label'),input=document.createElement(options?'select':type==='textarea'?'textarea':'input');
    input.id=`private-${key}`;labelElement.htmlFor=input.id;labelElement.textContent=name;
    if(options)for(const value of options){const option=document.createElement('option');option.value=value;option.textContent=label(value);input.append(option);}
    else if(type!=='textarea')input.type=type;
    if(type==='number'){input.step='any';input.min='0';input.max='1000000';}
    if(type==='password')input.autocomplete='off';if(type==='text')input.maxLength=1000;if(type==='textarea')input.maxLength=10000;
    input.value=value??'';input.disabled=!enabled;wrapper.append(labelElement,input);body.append(wrapper);fields.set(key,input);return input;
  }
  const localDateTime=value=>{if(!value)return '';const instant=new Date(value);return Number.isFinite(instant.getTime())?new Date(instant.getTime()-instant.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
  function draw(){
    fields.clear();body.replaceChildren();const kind=choice.value,record=original?.record?.body??{};notice.textContent='Saved as a separate encrypted object. Native Journal snapshots stay read-only; automatic merge/reconciliation is not implemented.';
    if(kind==='document'){const input=field('file','Private tax document','','file');input.accept='application/pdf,image/jpeg,image/png';notice.textContent='The whole file, filename and type are encrypted before upload. This saves a private document; it does not complete a staff request or filing.';}
    if(kind==='note'){field('title','Business information title',original?.title);field('date','Recorded date',original?.date??today(),'date');field('notes','Details for your business records',original?.notes,'textarea');notice.textContent+=' A saved note does not mark a staff request reviewed or authorize a filing.';}
    if(kind==='identity'){
      field('legalName','Legal name',original?.legalName);field('taxYear','Tax year (optional)',original?.taxYear,'number');
      const input=field('ssn','SSN (leave blank to keep the saved value)','','password');input.maxLength=11;
      if(original?.ssn)input.placeholder=`Saved: •••-••-${String(original.ssn).replace(/\D/g,'').slice(-4)}`;
      const reveal=document.createElement('button');reveal.type='button';reveal.className='secondary';reveal.textContent='Show SSN';reveal.disabled=!enabled;reveal.addEventListener('click',()=>{if(input.type==='password'){if(!input.value&&original?.ssn)input.value=original.ssn;input.type='text';reveal.textContent='Hide SSN';}else{input.type='password';reveal.textContent='Show SSN';}});body.append(reveal);
      if(editingId&&original?.ssn){const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Remove SSN and delete this identity item';remove.disabled=!enabled;remove.addEventListener('click',()=>run(async()=>{if(!confirm('Delete this entire encrypted tax identity item, including its SSN? Backups and recipient copies may retain older ciphertext or readable copies.'))return;await onDelete(editingId);api.clear();}));body.append(remove);}
      notice.textContent='SSN is hidden by default. Removing a saved SSN deletes the whole live identity object and its retry records. Backups, filesystem history and recipient copies are not erased.';
    }
    if(kind==='intake'){
      const year=field('taxYear','Confirmed tax year (optional)',original?.coachIntake?.taxYear,'number');year.min='1900';year.max='9999';year.step='1';field('jurisdiction','Federal / state / local jurisdiction (optional)',original?.coachIntake?.jurisdiction).maxLength=80;field('businessType','Confirmed business arrangement',original?.coachIntake?.businessType??'unsure','text',businessTypes);
      notice.textContent+=' These are answers you confirm for preparation. No coach inference, silent intake change, queued question dispatch or filing action is performed. Keep passwords, verification codes, full SSNs and bank credentials out of chat.';
    }
    if(kind==='work-settings'){
      for(const [key,name,defaultLabel] of [['delivery','Universal delivery','Universal delivery'],['shopping','In-store shopping','In-store shopping']]){field(`${key}Label`,`${name} work / app name`,original?.universalGigSettings?.[key]?.workLabel??defaultLabel).maxLength=80;field(`${key}URL`,`${name} public HTTPS app link (optional)`,original?.universalGigSettings?.[key]?.appURL).maxLength=2048;}
      notice.textContent+=' These labels and optional links do not authorize a provider, connect an account, read offers or open an app automatically.';
    }
    if(kind==='income'||kind==='expense'){
      field('date','Recorded date',record.date??today(),'date');field('amount',`Amount (${record.currency??'USD'})`,amount(record.amountCents),'number');
      if(kind==='income'){field('platform','Platform',record.platform);field('description','Description',record.description);}
      else{field('merchant','Merchant',record.merchant);field('category','Category',record.category??'other','text',categories);field('classification','Classification',record.classification??'unclassified','text',classifications);field('businessPurpose','Business purpose',record.businessPurpose);field('businessUsePercent','Business use percent (optional)',record.businessUsePercent,'number');}
      field('notes','Notes',record.notes,'textarea');notice.textContent+=' Income, trip fares, bank deposits and provider payouts are kept separate.';
    }
    if(kind==='trip'){
      field('rideRole','Type of completed work',record.rideRole??'other','text',rideRoles);
      field('startedAt','Start (your local time)',localDateTime(record.startedAt),'datetime-local');field('endedAt','End (optional)',localDateTime(record.endedAt),'datetime-local');field('miles','Recorded miles',Number.isFinite(record.distanceMeters)?(record.distanceMeters/1609.344).toFixed(3):'','number');field('purpose','Purpose',record.purpose);field('classification','Classification',record.classification??'unclassified','text',classifications);field('platform','Platform',record.platform);field('fare','Recorded fare (USD, optional)',amount(record.earningsCents),'number');field('fees','Platform fees (USD, optional)',amount(record.platformFeesCents),'number');field('notes','Notes',record.notes,'textarea');
    }
    if(kind==='goals')for(const [key,name] of [['dailyNetCents','Daily net goal (USD)'],['weeklyNetCents','Weekly net goal (USD)'],['targetHourlyCents','Hourly target (USD)'],['vehicleCostCentsPerMile','Estimated vehicle cost per mile (USD)']])field(key,`${name} — optional`,amount(original?.goals?.[key]),'number');
    if(kind==='reserves'){field('taxPercent','Tax planning reserve (%)',original?.reserveSettings?.taxPercent??'','number');field('vehiclePercent','Vehicle planning reserve (%)',original?.reserveSettings?.vehiclePercent??'','number');notice.textContent+=' Planning reserves are estimates, not liabilities, balances or actual transfers.';}
  }
  const api={
    get dirty(){return dirty||!!editingId;},
    clear(){original=null;editingId=null;dirty=false;choice.disabled=!enabled;draw();onDirty();},
    setEnabled(value){enabled=value;choice.disabled=!value||!!editingId;save.disabled=!value;clear.disabled=!value;for(const control of body.querySelectorAll('input,select,textarea,button'))control.disabled=!value;},
    edit(data,id){const kind=formType(data);if(!kind)return false;original=structuredClone(data);editingId=id;dirty=false;choice.value=kind;choice.disabled=true;draw();onDirty();container.scrollIntoView?.({behavior:'smooth',block:'start'});return true;}
  };
  for(const event of ['input','change'])body.addEventListener(event,()=>{dirty=true;onDirty();});
  choice.addEventListener('change',()=>{original=null;editingId=null;dirty=false;draw();onDirty();});clear.addEventListener('click',()=>api.clear());
  save.addEventListener('click',()=>run(async()=>{const scope=captureScope(),id=editingId;const result=choice.value==='document'?await documentPayload(fields.get('file').files?.[0]):buildFormPayload(choice.value,Object.fromEntries([...fields].map(([key,input])=>[key,input.value])),original);if(!isCurrentScope(scope))throw new Error('The account view changed while preparing this private item. Select the current account key again.');await onSave(result,id);api.clear();}));
  draw();api.setEnabled(false);return api;
}
