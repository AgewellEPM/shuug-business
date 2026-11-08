import { encode64 } from '../envelope.mjs';

export const UPLOAD_PURPOSES=Object.freeze({'bank-statement':'Bank statement',receipt:'Receipt',invoice:'Invoice','tax-document':'Tax document','business-record':'Other business information'});
export const UPLOAD_CATEGORIES=Object.freeze({banking:'Banking',sales:'Sales',purchases:'Purchases',payroll:'Payroll',tax:'Tax',general:'General business'});
const encoder=new TextEncoder(),scopeOf=client=>JSON.stringify(client.scope);
const metadata=value=>{
  if(!Object.hasOwn(UPLOAD_PURPOSES,value?.purpose)||!Object.hasOwn(UPLOAD_CATEGORIES,value?.category)||typeof(value.notes??'')!=='string'||(value.notes??'').length>2000)throw new Error('Choose a file purpose, category and notes of at most 2,000 characters.');
  return {purpose:value.purpose,category:value.category,notes:value.notes??''};
};
function fileKind(file){
  if(!file||typeof file.name!=='string'||!file.name||file.name.length>240||!Number.isSafeInteger(file.size)||file.size<1||file.size>10*1024*1024)throw new Error('Choose a named file between one byte and 10 MiB.');
  const extension=file.name.split('.').at(-1).toLowerCase();
  if(extension==='csv'&&['','text/csv','text/plain','application/csv','application/vnd.ms-excel'].includes(file.type??'')){if(file.size>2*1024*1024)throw new Error('CSV statements are limited to 2 MiB.');return 'text/csv';}
  const type={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'}[extension];
  if(!type||file.type&&file.type!==type)throw new Error('Use PDF, JPEG, PNG or a bank CSV file. Other documents can be saved as a PDF.');
  return type;
}
export async function portalFilePayload(file,details){
  const mime=fileKind(file),selected=metadata(details),bytes=new Uint8Array(await file.arrayBuffer());
  try{
    if(bytes.length!==file.size)throw new Error('The selected file changed while it was being read. Select the original again.');
    const matches=mime==='application/pdf'?new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-':mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes.subarray(0,8).every((value,index)=>value===[137,80,78,71,13,10,26,10][index])&&bytes.length>=8:true;
    if(!matches)throw new Error('The file contents do not match the selected PDF or image format.');
    if(mime==='text/csv'){let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Use a UTF-8 CSV statement, or save the statement as a PDF.');}if(text.includes('\0'))throw new Error('This CSV contains binary data. Choose a text statement or PDF.');}
    return {domain:selected.purpose==='receipt'?'driver-receipt':'tax-document',payload:{version:1,type:'private-file',filename:file.name,mime,data:encode64(bytes),byteLength:bytes.length,...selected,savedAt:new Date().toISOString()}};
  }finally{bytes.fill(0);}
}

/** Raw selections are transient. Before the first PUT, the exact encrypted
 * mutation is durably stored; retries and reload recovery reuse it unchanged. */
export class PortalUploadQueue {
  #client;#rows=[];#generation=0;#running=false;#scope=null;#changed;
  constructor(client,{onChange=()=>{}}={}){this.#client=client;this.#changed=onChange;}
  get running(){return this.#running;}
  get hasUnprepared(){return this.#rows.some(row=>!!row.file);}
  get rows(){return this.#rows.map(({id,name,size,purpose,category,notes,status,error,receipt,file,prepared})=>({id,name,size,purpose,category,notes,status,error,receipt,editable:!!file&&!prepared}));}
  #emit(){this.#changed(this.rows);}
  #check(generation){if(generation!==this.#generation||!this.#client.canWrite||scopeOf(this.#client)!==this.#scope)throw new Error('The account or unlocked view changed. Encrypted pending uploads are kept for that account.');}
  add(files,details){
    if(this.#running||!this.#client.canWrite)throw new Error('Unlock an enrolled account before adding files.');
    const list=Array.from(files),selected=metadata(details);
    if(!list.length||list.length+this.#rows.length>20)throw new Error('Keep at most 20 files in this queue. Remove completed rows before selecting more.');
    if(list.reduce((sum,file)=>sum+(file.size||0),0)+this.#rows.filter(row=>row.file).reduce((sum,row)=>sum+row.size,0)>25*1024*1024)throw new Error('Select at most 25 MiB at a time. Your current selection was not added.');
    const scope=scopeOf(this.#client);if(this.#scope&&this.#scope!==scope)throw new Error('Clear the previous account view before selecting files.');this.#scope=scope;
    for(const file of list){let error='';try{fileKind(file);}catch(failure){error=failure.message;}this.#rows.push({id:crypto.randomUUID(),file,name:file.name,size:file.size,...selected,status:error?'failed':'selected',error,prepared:null});}
    this.#emit();return this.rows;
  }
  update(id,details){const row=this.#rows.find(row=>row.id===id);if(!row||row.prepared||this.#running)throw new Error('Already encrypted files keep their original purpose and category.');Object.assign(row,metadata(details));row.status='selected';row.error='';this.#emit();}
  async restore(){
    if(this.#running)throw new Error('Wait for the previous upload request to finish.');
    const generation=this.#generation;this.#scope=scopeOf(this.#client);
    const entries=await this.#client.pendingUploads();this.#check(generation);
    if(entries.filter(entry=>!this.#rows.some(row=>row.prepared?.mutationId===entry.mutationId)).length+this.#rows.length>20)throw new Error('Remove completed or unencrypted queue rows before recovering more pending uploads. Saved encrypted retries are kept.');
    for(const prepared of entries){
      if(this.#rows.some(row=>row.prepared?.mutationId===prepared.mutationId))continue;
      let value=null,error='';
      try{const bytes=await this.#client.previewPrepared(prepared);try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}finally{bytes.fill(0);}this.#check(generation);if(value?.version!==1||value.type!=='private-file')throw new Error('This encrypted pending item needs separate review.');metadata(value);}
      catch(failure){this.#check(generation);error=failure.message;}
      this.#rows.push({id:prepared.mutationId,file:null,prepared,name:value?.filename??'Encrypted pending file',size:value?.byteLength??0,purpose:value?.purpose??'business-record',category:value?.category??'general',notes:value?.notes??'',status:error?'failed':'pending',error});
    }
    this.#emit();return this.rows;
  }
  async flush(){
    if(this.#running)throw new Error('Wait for the current upload queue.');
    const generation=this.#generation;this.#check(generation);this.#running=true;this.#emit();
    try{
      for(const row of this.#rows){
        this.#check(generation);if(row.status==='complete')continue;
        try{
          if(!row.prepared){
            row.status='encrypting';row.error='';this.#emit();
            const result=await portalFilePayload(row.file,row);this.#check(generation);
            const bytes=encoder.encode(JSON.stringify(result.payload));
            try{row.prepared=await this.#client.prepareSave(result.domain,bytes);}finally{bytes.fill(0);}
            this.#check(generation);await this.#client.keepPendingUpload(row.prepared);this.#check(generation);row.file=null;
          }else await this.#client.keepPendingUpload(row.prepared);
          this.#check(generation);row.file=null;row.status='uploading';row.error='';this.#emit();
          const receipt=await this.#client.savePrepared(row.prepared);this.#check(generation);
          await this.#client.forgetPendingUpload(row.prepared.mutationId);this.#check(generation);
          row.receipt=receipt;row.status='complete';row.prepared=null;this.#emit();
        }catch(error){this.#check(generation);row.status='failed';row.error=error instanceof Error?error.message:'The upload did not complete. Its encrypted retry is kept.';this.#emit();}
      }
      return this.rows;
    }finally{this.#running=false;this.#emit();}
  }
  async discard(id){
    if(this.#running)throw new Error('Wait for the current upload queue.');const generation=this.#generation,row=this.#rows.find(value=>value.id===id);if(!row)return;
    this.#check(generation);if(row.prepared)await this.#client.forgetPendingUpload(row.prepared.mutationId);this.#check(generation);row.file=null;this.#rows=this.#rows.filter(value=>value!==row);this.#emit();
  }
  clearCompleted(){if(this.#running)return;this.#rows=this.#rows.filter(row=>row.status!=='complete');this.#emit();}
  clear(){const unprepared=this.#rows.filter(row=>row.file).length;this.#generation++;for(const row of this.#rows){row.file=null;row.name='';row.notes='';}this.#rows=[];this.#scope=null;this.#emit();return {unpreparedDiscarded:unprepared};}
}

/** Polling is deliberately visible and bounded. It does not imply push delivery
 * or accountant review; stale asynchronous completions never update a new view. */
export class PortalRefresh {
  #eligible;#refresh;#changed;#error;#set;#clear;#now;#timer=null;#generation=0;#busy=false;
  state={checking:false,lastUpdated:null,updatesPending:true};
  constructor({eligible,refresh,onChange=()=>{},onError=()=>{},interval=15000,setTimer=setInterval,clearTimer=clearInterval,now=Date.now}){
    if(!Number.isInteger(interval)||interval<10000||interval>300000)throw new Error('Use a refresh interval between 10 seconds and five minutes.');
    this.interval=interval;this.#eligible=eligible;this.#refresh=refresh;this.#changed=onChange;this.#error=onError;this.#set=setTimer;this.#clear=clearTimer;this.#now=now;
  }
  #emit(){this.#changed({...this.state});}
  start(){if(this.#timer!==null)return;this.#generation++;this.#timer=this.#set(()=>{void this.tick();},this.interval);}
  stop({clear=false}={}){this.#generation++;if(this.#timer!==null)this.#clear(this.#timer);this.#timer=null;this.state={checking:false,lastUpdated:clear?null:this.state.lastUpdated,updatesPending:true};this.#emit();}
  pending(){this.state.updatesPending=true;this.#emit();}
  updated(){this.state={checking:false,lastUpdated:this.#now(),updatesPending:false};this.#emit();}
  async tick(){
    if(this.#timer===null||this.#busy||!this.#eligible())return false;
    const generation=this.#generation;this.#busy=true;this.state.checking=true;this.#emit();
    try{const result=await this.#refresh();if(generation!==this.#generation)return false;if(result===false){this.state.updatesPending=true;return false;}this.updated();return true;}
    catch(error){if(generation===this.#generation){this.state.updatesPending=true;this.#error(error);}return false;}
    finally{this.#busy=false;if(generation===this.#generation){this.state.checking=false;this.#emit();}}
  }
}

export function portalSnapshot(records){
  const counts={statements:0,receipts:0,invoices:0,documents:0,income:0,expenses:0,trips:0,notes:0,other:0},files=[],entries=[],currencies=new Map();
  for(const item of records.values()){
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(item.plaintext));}catch{counts.other++;continue;}
    if(value?.version===1&&value.type==='private-file'){
      const kind=value.purpose==='bank-statement'?'statements':value.purpose==='receipt'||item.domain==='driver-receipt'?'receipts':value.purpose==='invoice'?'invoices':'documents';counts[kind]++;
      files.push({objectId:item.objectId,revision:item.revision,name:value.filename,purpose:UPLOAD_PURPOSES[value.purpose]??'Document',category:UPLOAD_CATEGORIES[value.category]??'General business',byteLength:value.byteLength,savedAt:value.savedAt,notes:value.notes??''});
    }else if(value?.type==='driver-record'&&['income','expense','trip'].includes(value.record?.kind)){
      const kind=value.record.kind,body=value.record.body??{};counts[kind==='expense'?'expenses':kind==='trip'?'trips':'income']++;
      entries.push({objectId:item.objectId,kind,date:body.date??body.localDate??'',description:body.description??body.merchant??body.purpose??'',amountCents:body.amountCents,currency:typeof body.currency==='string'?body.currency.slice(0,12):null});
      if(kind!=='trip'&&Number.isSafeInteger(body.amountCents)&&typeof body.currency==='string'&&/^[A-Z]{3}$/.test(body.currency)){
        const totals=currencies.get(body.currency)??{currency:body.currency,incomeCents:0,expenseCents:0,known:true},key=kind==='income'?'incomeCents':'expenseCents';
        if(totals.known){const next=totals[key]+body.amountCents;if(Number.isSafeInteger(next))totals[key]=next;else{totals.known=false;totals.incomeCents=null;totals.expenseCents=null;}}
        currencies.set(body.currency,totals);
      }
    }else if(value?.type==='business-note'){counts.notes++;entries.push({objectId:item.objectId,kind:'Business note',date:value.date??'',description:value.title??''});}
    else counts.other++;
  }
  return {counts,files,entries,totals:[...currencies.values()]};
}
export function formatPortalMoney(cents){
  if(!Number.isSafeInteger(cents))return 'Amount not recorded';
  const value=BigInt(cents),negative=value<0n,absolute=negative?-value:value;
  return `${negative?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}
