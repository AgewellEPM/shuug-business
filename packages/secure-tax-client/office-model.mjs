import {BOOK_ACTIONS,assertBookInput,replayCaseBooks,caseBookReport} from './case-books.mjs';
import {FEE_ACTIONS,assertFeeInput,replayFees} from './office-billing.mjs';
import {reject,exact,identifier,text,instant,reference,sameReference,sourceStatus} from './office-validation.mjs';
import {LEGACY_CONVERSION_ACTION,assertLegacyConversion,deriveLegacyLedger,sameLegacySource} from './legacy-book-conversion.mjs';
export const OFFICE_MAX_BYTES=1024*1024,OFFICE_MAX_ACTIONS=2000;
export const LEDGER_ACTIONS=BOOK_ACTIONS.map(type=>type.replace('books.','ledger.'));
export const OFFICE_ACTIONS=['office.create',...LEDGER_ACTIONS,LEGACY_CONVERSION_ACTION,...FEE_ACTIONS];
export const isOfficeBody=body=>body?.version===1&&body?.type==='client-office';
export async function officeObjectId({workspaceId,accountId,clientId}){
  for(const value of [workspaceId,accountId,clientId])identifier(value);
  // Derive a canonical routing ID only from already-public opaque scope IDs.
  // Never use names, tax IDs, account numbers or any private financial fields.
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['shuug/client-office/v1',workspaceId,accountId,clientId]))));
  return 'shuug-case:'+Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
export function assertOfficeCommand(command){
  exact(command,['actionId','type','input']);identifier(command.actionId);const {type,input}=command;if(!OFFICE_ACTIONS.includes(type))reject();
  if(type==='office.create'){exact(input,['title','notes']);text(input.title,160);text(input.notes,2000,false);}
  if(type===LEGACY_CONVERSION_ACTION)assertLegacyConversion(input);
  if(LEDGER_ACTIONS.includes(type)){if(!input||typeof input!=='object')reject();identifier(input.ledgerId);const {ledgerId,...fields}=input;if(type==='ledger.open'&&Object.hasOwn(fields,'bookId')){identifier(fields.bookId);delete fields.bookId;}assertBookInput(type.replace('ledger.','books.'),fields);if(type==='ledger.journal.post'&&fields.document!==null)reference(fields.document);}
  if(FEE_ACTIONS.includes(type))assertFeeInput(type,input);return command;
}
export function officeLedgers(history){
  const groups=new Map(),converted=new Set();
  for(const event of history){if(!LEDGER_ACTIONS.includes(event.type)&&event.type!==LEGACY_CONVERSION_ACTION)continue;const {ledgerId,...input}=event.input;let group=groups.get(ledgerId);if(!group){group={events:[],initial:null,bookId:'default'};groups.set(ledgerId,group);}
    if(event.type===LEGACY_CONVERSION_ACTION){if(group.events.length||group.initial||converted.has(input.source.book.id))reject('This legacy business book was already converted. Reconcile revisions without importing its journals again.');group.initial=deriveLegacyLedger(event.input,event);group.bookId=input.bookId;converted.add(input.source.book.id);}
    else{if(event.type==='ledger.open'){group.bookId=input.bookId??'default';if(group.bookId.startsWith('legacy:')&&!converted.has(group.bookId.slice(7)))reject('Legacy book identities must start with reviewed source conversion.');delete input.bookId;}group.events.push({...event,type:event.type.replace('ledger.','books.'),input});}
  }
  if(groups.size>100)reject('This client finance record supports at most 100 ledger periods.');
  const ledgers=[...groups].map(([id,group])=>({id,bookId:group.bookId,...replayCaseBooks(group.events,null,group.initial)}));
  for(const ledger of ledgers){if(!ledger.conversion&&Date.parse(ledger.through)-Date.parse(ledger.from)>365*86400000)reject('A ledger period cannot exceed 366 days.');}
  const sorted=[...ledgers].sort((a,b)=>a.bookId.localeCompare(b.bookId)||a.from.localeCompare(b.from));for(let i=1;i<sorted.length;i++)if(sorted[i].bookId===sorted[i-1].bookId&&sorted[i].from<=sorted[i-1].through)reject('Canonical periods for the same business book cannot overlap.');return ledgers;
}
export function assertOfficeBody(body){
  exact(body,['version','type','title','history']);if(!isOfficeBody(body))reject();text(body.title,160);
  if(!Array.isArray(body.history)||body.history.length<1||body.history.length>OFFICE_MAX_ACTIONS)reject('The finance history is at its supported capacity; no history was removed.');
  const ids=new Set();let previous='';
  for(const [index,event]of body.history.entries()){
    exact(event,['actionId','type','input','actor','at','notes']);assertOfficeCommand({actionId:event.actionId,type:event.type,input:event.input});identifier(event.actor);instant(event.at);text(event.notes,2000,false);
    if(ids.has(event.actionId)||event.at<previous||event.notes!==event.input.notes||(index===0?event.type!=='office.create':event.type==='office.create'))reject();ids.add(event.actionId);previous=event.at;
  }
  if(body.title!==body.history[0].input.title)reject();officeLedgers(body.history);replayFees(body.history);
  if(new TextEncoder().encode(JSON.stringify(body)).length>OFFICE_MAX_BYTES)reject('The encrypted client finance record is at its supported capacity.');return body;
}
export function applyOfficeTransition(before,command,{actor,at,evidence=null}={}){
  identifier(actor);instant(at);assertOfficeCommand(command);if(before!==null)assertOfficeBody(before);
  if((command.type==='office.create')!==(before===null))reject('Open the client finance record once before posting.');
  const selected=Object.hasOwn(command.input,'document')?command.input.document:null;
  if(selected!==null){if(!sameReference(selected,evidence?.reference))reject('The selected financial evidence does not match this posting.');if(command.type===LEGACY_CONVERSION_ACTION){if(evidence.payload?.type!=='legacy-accounting'||!sameLegacySource(command.input.source,evidence.payload.source))reject('Derive conversion from the exact authenticated business source.');}else if(evidence?.payload?.type!=='private-file')reject('The selected financial evidence does not match this posting.');}
  else if(evidence!==null)reject();
  const after=before===null?{version:1,type:'client-office',title:command.input.title,history:[]}:structuredClone(before);
  after.history.push({...structuredClone(command),actor,at,notes:command.input.notes});return assertOfficeBody(after);
}
export function officeSnapshot(body,records){
  assertOfficeBody(body);const ledgers=officeLedgers(body.history).map(ledger=>{
    const sources=ledger.entries.filter(entry=>entry.document&&!entry.reverses).map(entry=>({entryId:entry.id,reference:entry.document,active:!ledger.entries.some(other=>other.reverses===entry.id),freshness:sourceStatus(entry.document,records)}));
    const conversionFreshness=ledger.conversion?sourceStatus(ledger.conversion.reference,records):null;
    return {...ledger,report:caseBookReport(ledger),sources,conversionFreshness,sourcesCurrent:sources.every(source=>!source.active||source.freshness==='current')&&(!ledger.conversion||conversionFreshness==='current')};
  }),fees=replayFees(body.history);
  for(const invoice of fees.invoices)invoice.sources=invoice.events.filter(event=>event.input.document).map(event=>({actionId:event.actionId,reference:event.input.document,freshness:sourceStatus(event.input.document,records)}));
  return {title:body.title,ledgers,fees,revision:body.history.length,filingReady:false};
}
