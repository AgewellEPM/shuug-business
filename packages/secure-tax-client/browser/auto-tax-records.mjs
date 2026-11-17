// Local adapters over the current vault's already decrypted/authenticated feed.
// This module never fetches, decrypts, stores, logs or sends taxpayer content.
export const AUTO_TAX_PROFILE='client-only-v1';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]===value;
const fail=message=>{throw new Error(message);};
export function autoTaxCanonical(value){
  return JSON.stringify(value,(key,item)=>{
    if(typeof item==='number'&&!Number.isFinite(item))fail('The app source contains a nonfinite number.');
    return object(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item;
  });
}
export async function autoTaxDigest(value){
  const bytes=encoder.encode(autoTaxCanonical(value));
  try{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
  finally{bytes.fill(0);}
}
export function assertAutoTaxScope(scope){
  if(!object(scope)||scope.profile!==AUTO_TAX_PROFILE||!['workspaceId','accountId','clientId'].every(key=>identifier(scope[key])))fail('Automatic private drafts require the current client-only account scope.');
  return {profile:AUTO_TAX_PROFILE,workspaceId:scope.workspaceId,accountId:scope.accountId,clientId:scope.clientId};
}
const fields={
  income:['date','platform','description','amountCents','currency','notes','bankReference'],
  expense:['date','merchant','category','amountCents','currency','classification','notes','receiptId','bankReference','businessPurpose','businessUsePercent','mealContext','vehicle','odometerMiles','paymentMethod','place'],
  trip:['startedAt','endedAt','distanceMeters','classification','purpose','notes','source','hasGaps','sampleCount','localDate','timeZoneId','earningsCents','platformFeesCents','rideRole','automaticallyDetected','platform','workArea'],
};
const classifications=['business','personal','unclassified'];
const money=value=>Number.isSafeInteger(value)&&value>=0&&value<=100_000_000;
export const autoTaxDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function autoTaxRecordYear(record){
  const day=record.kind==='trip'?record.body.localDate:record.body.date;
  return autoTaxDay(day)?Number(day.slice(0,4)):null;
}
function normalizeRecord(raw,issue){
  if(!object(raw)||!identifier(raw.id)||!Number.isInteger(raw.revision)||raw.revision<0||raw.revision>1e9||typeof raw.deleted!=='boolean'||!Object.hasOwn(fields,raw.kind)||!object(raw.body)){
    issue('APP_RECORD_INVALID','An app record has an unsupported identity, revision, deletion state or body. Preserve and correct its original source.');return null;
  }
  const record={id:raw.id.toLowerCase(),kind:raw.kind,deleted:raw.deleted,body:structuredClone(raw.body)};
  if(Object.keys(raw).some(key=>!['id','revision','deleted','kind','body'].includes(key))||Object.keys(record.body).some(key=>!fields[raw.kind].includes(key)))issue('APP_RECORD_FIELDS','An app record contains additional unsupported fields. Review its original details before treating the source as complete.');
  const body=record.body;
  // Normalize native millisecond/ISO representations of the same instant, without
  // deriving the local tax date or choosing a winner between differing records.
  if(record.kind==='trip'){
    for(const key of ['startedAt','endedAt']){
      if(body[key]===undefined||body[key]===null){if(key==='endedAt')body[key]=null;continue;}
      const time=typeof body[key]==='number'?body[key]:typeof body[key]==='string'?Date.parse(body[key]):NaN;
      if(Number.isFinite(time)&&Number.isFinite(new Date(time).getTime()))body[key]=new Date(time).toISOString();
      else issue('APP_TRIP_TIME','A trip has an invalid recorded start or end time.');
    }
    if(!classifications.includes(body.classification)||typeof body.distanceMeters!=='number'||!Number.isFinite(body.distanceMeters)||body.distanceMeters<0||body.distanceMeters>10_000_000)issue('APP_TRIP_INVALID','Review an app trip with an unsupported classification or recorded distance.');
  }else{
    if(!money(body.amountCents)||body.amountCents===0||body.currency!=='USD')issue('APP_AMOUNT_UNSUPPORTED','App income and expense sources require positive, bounded, exact USD cents. No currency conversion or missing amount was inferred.');
    if(record.kind==='expense'){
      if(!classifications.includes(body.classification))issue('APP_EXPENSE_CLASSIFICATION','Review an expense whose business/personal classification is unknown.');
      if(body.businessUsePercent!==undefined&&(!Number.isInteger(body.businessUsePercent)||body.businessUsePercent<0||body.businessUsePercent>100))issue('APP_BUSINESS_SHARE_INVALID','An expense has an invalid recorded business-use percentage.');
    }
    if(body.bankReference!==undefined&&(!object(body.bankReference)||typeof body.bankReference.transactionId!=='string'||!body.bankReference.transactionId||!['statement','plaid'].includes(body.bankReference.provider)))issue('APP_BANK_REFERENCE','Review an app record with an incomplete original bank transaction reference.');
  }
  if(autoTaxRecordYear(record)===null)issue('APP_RECORD_DATE','An app record has no valid original local tax date. A UTC date or current tax year was not substituted.');
  return record;
}

/** Records must be the current scope-bound opened vault map, not API JSON or an
 * unauthenticated file. The envelope digest is evidence supplied by that caller;
 * cryptographic verification remains the vault's responsibility. */
export async function extractAutoTaxRecords(records,{scope}={}){
  const binding=assertAutoTaxScope(scope),items=records instanceof Map?[...records.values()]:Array.isArray(records)?records:fail('Use the current opened private record map.');
  if(items.length>10000)fail('The automatic draft source exceeds the current opened-record limit.');
  const issues=[],issueKeys=new Set(),issue=(code,message)=>{const key=code+'|'+message;if(!issueKeys.has(key)){issueKeys.add(key);issues.push({code,message});}};
  const groups=new Map(),semantic=new Set(),refs=[],intakes=[],profileNames=new Set();let totalBytes=0,invalidProfileName=false;
  const addSemantic=value=>semantic.add(autoTaxCanonical(value));
  function put(raw,item,{pending=false,conflict=null}={}){
    const record=normalizeRecord(raw,issue);
    if(!record){addSemantic(['invalid-record',raw??null]);return;}
    const variant=autoTaxCanonical([record.kind,record.deleted,record.body]);
    const group=groups.get(record.id)??{id:record.id,variants:new Map(),origins:[],conflict:false};
    group.variants.set(variant,record);group.origins.push({objectId:item.objectId,revision:item.revision});
    if(conflict!==null){group.conflict=true;issue('APP_NATIVE_CONFLICT','A native app record has an unresolved saved conflict. Its competing versions were not counted.');}
    groups.set(record.id,group);addSemantic(['record',record.id,variant,Boolean(pending),conflict]);
  }
  for(const item of items){
    if(!object(item)||!identifier(item.objectId)||!Number.isInteger(item.revision)||item.revision<1||item.revision>1e9)fail('An opened item has an invalid authenticated object identity or revision.');
    if(item.scope&&['profile','workspaceId','accountId','clientId'].some(key=>item.scope[key]!==undefined&&item.scope[key]!==binding[key]))fail('An opened app source belongs to another private account.');
    if(item.context&&['workspaceId','accountId'].some(key=>item.context[key]!==binding[key]))fail('An opened app source has a different authenticated workspace or account.');
    if(!['driver-state','driver-record','tax-identity'].includes(item.domain))continue;
    const profileItem=item.domain==='tax-identity';
    if(!profileItem)refs.push({objectId:item.objectId,revision:item.revision,domain:item.domain});
    if(item.deleted===true){if(!profileItem)addSemantic(['object-tombstone',item.objectId,item.domain]);continue;}
    if(typeof item.envelopeDigest!=='string'||!item.envelopeDigest||item.envelopeDigest.length>128)fail('Open and authenticate the current app source before preparing its private draft.');
    if(!(item.plaintext instanceof Uint8Array))fail('The opened app source has no decrypted bytes.');
    totalBytes+=item.plaintext.length;if(totalBytes>64*1024*1024)fail('The automatic draft source exceeds the opened-content limit.');
    let value;try{value=JSON.parse(decoder.decode(item.plaintext));}catch{if(profileItem)continue;issue('APP_SOURCE_FORMAT','An authenticated app source cannot be decoded as a supported structured record.');addSemantic(['invalid-source',await autoTaxDigest([...item.plaintext])]);continue;}
    if(profileItem){
      if(value?.version!==1||value.type!=='client-profile')continue;
      refs.push({objectId:item.objectId,revision:item.revision,domain:item.domain});
      const name=value.legalName;
      if(name===undefined||name===null||typeof name==='string'&&!name.trim())continue;
      if(typeof name!=='string'||name.length>200||/[\u0000-\u001f\u007f]/.test(name)){
        invalidProfileName=true;issue('APP_PROFILE_NAME_INVALID','Review the encrypted client profile’s missing or invalid bounded legal name before using its identity.');addSemantic(['invalid-profile-name',await autoTaxDigest(name)]);continue;
      }
      // Preserve the exact legal name. Contact fields, name parts and IDs are not
      // tax identity evidence and never enter this adapter's output or digest.
      profileNames.add(name);addSemantic(['profile-name',name]);continue;
    }
    if(item.domain==='driver-record'&&value?.version===1&&value.type==='driver-record'){
      if(value.binding&&['workspaceId','accountId','clientId'].some(key=>value.binding[key]!==binding[key]))fail('The individual driver record claims another private account.');
      put(value.record,item);continue;
    }
    if(item.domain!=='driver-state'||value?.version!==1||value.type!=='driver-journal'||value.journal?.version!==1||!Array.isArray(value.journal.entries)){
      issue('APP_SOURCE_FORMAT','An authenticated driver source uses an unsupported record or Journal format.');addSemantic(['unsupported-source',value]);continue;
    }
    const expected={workspaceId:binding.workspaceId,accountId:binding.accountId,clientId:binding.clientId,objectId:item.objectId};
    if(!object(item.journalBinding)||!object(value.binding)||Object.keys(expected).some(key=>item.journalBinding[key]!==expected[key]||value.binding[key]!==expected[key]))fail('The app Journal does not match its authenticated private account and object binding.');
    if(!Number.isFinite(value.capturedAt)||value.capturedAt<0||value.journal.entries.length>100000)fail('The app Journal capture time or source count is invalid.');
    const intake=value.journal.coachIntake;
    if(intake!==undefined&&intake!==null){
      if(!object(intake)||intake.taxYear!==undefined&&intake.taxYear!==null&&!Number.isInteger(intake.taxYear)||intake.businessType!==undefined&&intake.businessType!==null&&typeof intake.businessType!=='string')issue('APP_INTAKE_INVALID','The saved app business arrangement or tax-year intake needs source review.');
      const relevant={taxYear:intake?.taxYear??null,businessType:intake?.businessType??null};intakes.push(relevant);addSemantic(['intake',relevant]);
    }
    for(const entry of value.journal.entries)put(entry?.record,item,{pending:entry?.pendingMutationId!==undefined&&entry.pendingMutationId!==null,conflict:entry?.conflict??null});
  }
  if(profileNames.size>1)issue('APP_PROFILE_NAME_CONFLICT','Encrypted client profiles contain different legal names. Reconcile the original profiles before using this identity.');
  const profileName=!invalidProfileName&&profileNames.size===1?[...profileNames][0]:null,normalized=[];
  for(const group of [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id))){
    if(group.variants.size!==1||group.conflict){issue('APP_RECORD_CONFLICT','Differing copies or saved conflicts share an app record ID. Reconcile the original versions before counting it.');continue;}
    const record=[...group.variants.values()][0];if(record.deleted)continue;
    const origins=[...new Map(group.origins.map(origin=>[autoTaxCanonical(origin),origin])).values()].sort((a,b)=>a.objectId.localeCompare(b.objectId)||a.revision-b.revision);
    const fingerprint=await autoTaxDigest([1,'gigtax/auto-tax-record',binding,record.id,record.kind,record.body]);
    normalized.push({id:record.id,kind:record.kind,body:record.body,fingerprint,origins});
  }
  const years=[...new Set(normalized.map(autoTaxRecordYear).filter(Number.isInteger))].sort((a,b)=>a-b);
  const uniqueIntakes=[...new Map(intakes.map(value=>[autoTaxCanonical(value),value])).values()].sort((a,b)=>autoTaxCanonical(a).localeCompare(autoTaxCanonical(b)));
  const digest=await autoTaxDigest([1,'gigtax/auto-tax-source',binding,[...semantic].sort(),issues.map(issue=>issue.code).sort()]);
  return {digest,records:normalized,years,issues,intakes:uniqueIntakes,profileName,refs:refs.sort((a,b)=>a.objectId.localeCompare(b.objectId)||a.revision-b.revision)};
}
