import { newAutoTaxSettings, prepareAutoTaxDraft } from './auto-tax-model.mjs';
import { calculateReturn, calculationYears } from '@shuug/tax-engine';
import { encodeJson } from './client.mjs';

export const AUTO_TAX_TYPE='client-auto-tax-draft';
const PROFILE='client-only-v1',clone=value=>structuredClone(value);
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const identity=scope=>({workspaceId:scope.workspaceId,accountId:scope.accountId,clientId:scope.clientId});
const sameIdentity=(a,b)=>canonical(a)===canonical(b);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const settingsFields=['version','baseInput','incomeConfirmed','reviewedSourceDigest','businessConfirmed','vehicleMethod','mileageEligible','incomeDecisions','expenseDecisions'];
export async function autoTaxObjectId(scope,year){
  if(scope?.profile!==PROFILE||!calculationYears.includes(year)||!['workspaceId','accountId','clientId'].every(key=>typeof scope[key]==='string'&&scope[key].length>0&&scope[key].length<=128))throw new Error('Automatic preparation requires the unlocked client-only account and an installed tax year.');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical([1,'gigtax/client-auto-tax-draft',PROFILE,identity(scope),year]))));
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes.subarray(0,16)].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function checkedPacket(value,scope,year){
  if(!exact(value,['version','type','profile','scope','year','settings','sourceDigest','input'])||value.version!==1||value.type!==AUTO_TAX_TYPE||value.profile!==PROFILE||!sameIdentity(value.scope,identity(scope))||value.year!==year||!exact(value.settings,settingsFields)||value.settings.version!==1||typeof value.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceDigest))throw new Error('This saved automatic draft has another account, year or unsupported format. Its original was kept.');
  for(const input of [value.input,value.settings.baseInput]){
    const result=calculateReturn(input);
    if(input?.year!==year||input.kind!=='1040'||!result.calculationAvailable||result.status==='invalid-input')throw new Error('The original tax inputs need review before automatic preparation can continue.');
  }
  return value;
}
function decode(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
export async function isManagedAutoTaxPrepared(client,prepared,value){
  if(!client?.clientOnly||prepared?.domain!=='tax-document'||value?.type!==AUTO_TAX_TYPE)return false;
  try{checkedPacket(value,client.scope,value.year);return prepared.objectId===await autoTaxObjectId(client.scope,value.year);}catch{return false;}
}

/** Records and tax calculations stay in memory. The sole persistent output is
 * a client-encrypted object, using the existing durable exact-ciphertext retry. */
export class AutoTaxController {
  #getClient;#onChange;#eligible;#generation=0;#busy=false;#scope=null;#synced=false;#selected=false;#settings=null;#packet=null;#dirty=false;
  state={phase:'locked',year:null,years:[...calculationYears],model:null,settings:null,persisted:false,error:null,archivedCount:0};
  constructor({getClient,onChange=()=>{},eligible=()=>true,defaultYear=new Date().getUTCFullYear()}={}){
    this.#getClient=getClient;this.#onChange=onChange;this.#eligible=eligible;
    this.state.year=calculationYears.includes(defaultYear)?defaultYear:calculationYears.at(-1);
  }
  get busy(){return this.#busy;}
  #emit(){this.#onChange(this.state);}
  #session(){
    const client=this.#getClient(),scope=client?.scope;
    if(!client?.clientOnly||!client.canWrite||scope?.profile!==PROFILE)throw new Error('Unlock your own client-only account before preparing its tax draft.');
    return {client,scope,stamp:canonical(scope),generation:this.#generation};
  }
  #check(session){
    if(session.generation!==this.#generation||this.#getClient()!==session.client||!session.client.canWrite||canonical(session.client.scope)!==session.stamp)throw new Error('The private account changed. Its previous tax view was cleared.');
  }
  async synchronized(){
    const session=this.#session();
    if(this.#scope!==session.stamp){this.#scope=session.stamp;this.#settings=null;this.#packet=null;this.#selected=false;this.#dirty=false;this.state={...this.state,phase:'loading',model:null,settings:null,persisted:false,error:null,archivedCount:0};this.#emit();}
    this.#synced=true;return this.refresh();
  }
  async #pending(session,id,year){
    const pending=(await session.client.pendingUploads()).filter(row=>row.objectId===id);this.#check(session);
    if(pending.length>1)throw new Error('More than one encrypted retry exists for this draft. Keep the originals for review.');
    for(const prepared of pending){
      if(prepared.domain!=='tax-document')throw new Error('The reserved draft ID contains a different encrypted item. Its original was kept.');
      const bytes=await session.client.previewPrepared(prepared);let packet;
      try{this.#check(session);packet=checkedPacket(decode(bytes),session.scope,year);}finally{bytes.fill(0);}
      // Reuse the original mutation even when its earlier acknowledgment was lost.
      try{await session.client.savePrepared(prepared);this.#check(session);}
      catch(error){
        this.#check(session);
        // A full authenticated read distinguishes a durable competing revision
        // from a lost acknowledgment. Preserve the losing request encrypted
        // before removing it from the active retry lane.
        await session.client.sync();this.#check(session);
        const remote=session.client.records.get(id);
        if(!remote||remote.domain!=='tax-document'||remote.revision<prepared.expectedRevision+1)throw error;
        const latest=checkedPacket(decode(remote.plaintext),session.scope,year);
        await session.client.archivePendingUpload(prepared);this.#check(session);
        await session.client.forgetPendingUpload(prepared.mutationId);this.#check(session);
        this.#packet=clone(latest);
        if(this.#dirty)throw new Error('A newer private draft was found. The earlier save is kept encrypted; reload the saved draft before applying your current edits.');
        this.#settings=clone(latest.settings);continue;
      }
      await session.client.forgetPendingUpload(prepared.mutationId);this.#check(session);
      this.#packet=clone(packet);if(!this.#dirty)this.#settings=clone(packet.settings);
    }
    const archived=await session.client.archivedPendingUploads();this.#check(session);
    this.state.archivedCount=archived.filter(row=>row.objectId===id).length;
  }
  async #load(session,year){
    const id=await autoTaxObjectId(session.scope,year);this.#check(session);
    await this.#pending(session,id,year);this.#check(session);
    const item=session.client.records.get(id);
    if(item){
      if(item.domain!=='tax-document')throw new Error('A different private item uses this draft ID. Its original was kept.');
      const packet=checkedPacket(decode(item.plaintext),session.scope,year);
      this.#packet=clone(packet);this.#settings=clone(packet.settings);
    }else{this.#packet=null;this.#settings=newAutoTaxSettings(year);}
    return id;
  }
  async refresh({explicit=false}={}){
    if(this.#busy||!this.#synced||!explicit&&!this.#eligible())return false;
    const session=this.#session();if(session.stamp!==this.#scope)return false;
    this.#busy=true;this.state={...this.state,phase:'loading',error:null};this.#emit();
    try{
      let year=this.state.year,id;
      if(!this.#settings)id=await this.#load(session,year);
      else{
        id=await autoTaxObjectId(session.scope,year);this.#check(session);await this.#pending(session,id,year);
        const item=session.client.records.get(id);
        if(!item&&this.#packet)throw new Error('This automatic draft was deleted. It will not be recreated over its retained deletion history.');
        if(item){
          if(item.domain!=='tax-document')throw new Error('A different private item uses this draft ID. Its original was kept.');
          const remote=checkedPacket(decode(item.plaintext),session.scope,year);
          if(canonical(remote)!==canonical(this.#packet)){
            if(this.#dirty)throw new Error('Another private session changed this draft. Your current edits are kept on this device; reopen the latest draft before saving them.');
            this.#packet=clone(remote);this.#settings=clone(remote.settings);
          }
        }
      }
      let model=await prepareAutoTaxDraft(session.client.records,{scope:session.scope,year,settings:clone(this.#settings)});this.#check(session);
      if(!this.#selected&&!this.#packet&&model.source.years.length&&!model.source.years.includes(year)){
        const latest=[...model.source.years].filter(value=>calculationYears.includes(value)).sort((a,b)=>b-a)[0];
        if(latest!==undefined&&latest!==year){year=latest;this.state.year=year;id=await this.#load(session,year);model=await prepareAutoTaxDraft(session.client.records,{scope:session.scope,year,settings:clone(this.#settings)});this.#check(session);}
      }
      const packet={version:1,type:AUTO_TAX_TYPE,profile:PROFILE,scope:identity(session.scope),year,settings:clone(this.#settings),sourceDigest:model.source.digest,input:clone(model.input)};
      this.state={...this.state,phase:'ready',model,settings:clone(this.#settings),persisted:!!this.#packet,error:null};this.#emit();
      // An empty account does not become a zero-income return or create a draft
      // merely because its owner opened the page.
      if(!model.source.records.length&&!this.#packet&&!this.#selected)return true;
      if(!this.#packet||canonical(packet)!==canonical(this.#packet)){
        this.state.phase='saving';this.state.persisted=false;this.#emit();
        const bytes=encodeJson(packet);let prepared;
        try{prepared=await session.client.prepareSave('tax-document',bytes,id);}finally{bytes.fill(0);}
        this.#check(session);await session.client.keepPendingUpload(prepared);this.#check(session);
        await session.client.savePrepared(prepared);this.#check(session);
        await session.client.forgetPendingUpload(prepared.mutationId);this.#check(session);
        this.#packet=clone(packet);
      }
      this.#dirty=false;
      this.state.phase='ready';this.state.persisted=!!this.#packet;this.#emit();return true;
    }catch(error){
      if(session.generation===this.#generation){
        if(!session.client.canWrite||canonical(session.client.scope)!==session.stamp)this.clear();
        else{this.state={...this.state,phase:'error',persisted:false,error:error instanceof Error?error.message:'Private preparation could not finish. Its encrypted retry is kept.'};this.#emit();}
      }
      throw error;
    }finally{this.#busy=false;}
  }
  async selectYear(year){
    if(!calculationYears.includes(year)||this.#busy)throw new Error('Wait for the current private draft and choose an installed year.');
    this.#session();if(this.#dirty)throw new Error('Save or review the pending changes before choosing another tax year.');this.#selected=true;this.state={...this.state,year,model:null,settings:null,persisted:false,error:null};this.#settings=null;this.#packet=null;
    return this.refresh();
  }
  async updateSettings(patch){
    this.#session();
    if(this.#busy||!this.#settings||!this.state.model)throw new Error('Wait for the current app records before confirming this draft.');
    const allowed=['incomeConfirmed','businessConfirmed','vehicleMethod','mileageEligible'];
    if(!patch||Object.keys(patch).some(key=>!allowed.includes(key)))throw new Error('Use the private preparation controls to change these settings.');
    const next={...this.#settings,...clone(patch)};
    if(Object.hasOwn(patch,'incomeConfirmed'))next.reviewedSourceDigest=patch.incomeConfirmed?this.state.model.source.digest:null;
    this.#settings=next;this.#dirty=true;this.#selected=true;return this.refresh({explicit:true});
  }
  async reviewRecord(kind,id,decision){
    this.#session();
    if(this.#busy||!this.#settings||!['income','expense'].includes(kind))throw new Error('Wait for the current private draft.');
    const row=this.state.model?.source.records.find(value=>value.id===id&&value.kind===kind);
    if(!row||row.fingerprint!==decision?.fingerprint)throw new Error('This app record changed. Review its current amount before confirming it.');
    const key=kind==='income'?'incomeDecisions':'expenseDecisions';
    this.#settings={...this.#settings,[key]:{...this.#settings[key],[id]:clone(decision)},incomeConfirmed:false,reviewedSourceDigest:null};
    this.#dirty=true;this.#selected=true;return this.refresh({explicit:true});
  }
  assertManagedInput(input){
    this.#session();
    if(!this.#settings||!this.state.model||input?.kind!=='1040'||input.year!==this.state.year||calculateReturn(input).status==='invalid-input')throw new Error('Keep this draft’s year and correct its return details first.');
    const businessId=`auto-gig-business-${this.state.year}`,current=this.state.model.input.individual.businesses.find(row=>row.id===businessId),changed=input.individual.businesses.find(row=>row.id===businessId);
    const managed=value=>value&&Object.fromEntries(['receiptsCents','returnsCents','costOfGoodsCents','otherIncomeCents','expenses'].map(key=>[key,value[key]]));
    if(!current||!changed||canonical(managed(current))!==canonical(managed(changed)))throw new Error('This Schedule C receives its income and deductions from app records. Keep those amounts here and review them in the app-record tax panel; other return details can be edited separately.');
  }
  async saveDetails(input){
    if(this.#busy)throw new Error('Wait for the current private save.');this.assertManagedInput(input);
    this.#settings={...this.#settings,baseInput:clone(input)};this.#dirty=true;this.#selected=true;return this.refresh({explicit:true});
  }
  async reloadLatest(){
    if(this.#busy)throw new Error('Wait for the current private save.');this.#session();
    this.#dirty=false;this.#settings=null;this.#packet=null;this.state={...this.state,model:null,settings:null,persisted:false,error:null};return this.refresh({explicit:true});
  }
  async priorInput(){
    const session=this.#session(),year=this.state.year,id=await autoTaxObjectId(session.scope,year);this.#check(session);
    const entries=(await session.client.archivedPendingUploads()).filter(row=>row.objectId===id);this.#check(session);
    if(!entries.length)throw new Error('No earlier encrypted draft is saved in this browser for this year.');
    const bytes=await session.client.previewPrepared(entries.at(-1));
    try{this.#check(session);return clone(checkedPacket(decode(bytes),session.scope,year).input);}finally{bytes.fill(0);}
  }
  clear(){
    this.#generation++;this.#scope=null;this.#synced=false;this.#selected=false;this.#settings=null;this.#packet=null;this.#dirty=false;
    this.state={phase:'locked',year:this.state.year,years:[...calculationYears],model:null,settings:null,persisted:false,error:null,archivedCount:0};this.#emit();
  }
}
