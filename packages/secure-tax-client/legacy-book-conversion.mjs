// Deterministic derivation only. Authenticating source proof belongs to
// selectedCaseEvidence on BOTH proposal preparation and offhost firm approval.
import {assertLegacyBookSource,legacyBookSnapshot,legacyBillingBalance} from './legacy-books.mjs';
import {canonicalCaseJson} from './case-json.mjs';
import {exact,identifier,text,date,reference,reject,add} from './office-validation.mjs';
export const LEGACY_CONVERSION_ACTION='ledger.legacy.convert';
export const legacyCanonicalBookId=source=>`legacy:${source.book.id}`;
export function assertLegacyConversion(input){
  exact(input,['ledgerId','bookId','from','through','document','source','reviewed','notes']);identifier(input.ledgerId);identifier(input.bookId);date(input.from);date(input.through);reference(input.document);text(input.notes,2000);
  if(input.reviewed!==true||input.document.domain!=='tax-document')reject('Explicitly review the business book, posting range and source history before conversion.');
  assertLegacyBookSource(input.source);if(input.bookId!==legacyCanonicalBookId(input.source))reject('The conversion must retain the stable source business book identity.');
  return input;
}
export function sameLegacySource(first,second){return canonicalCaseJson(first)===canonicalCaseJson(second);}
function normalizedLines(lines){
  const byAccount=new Map();
  for(const line of lines){const row=byAccount.get(line.accountNumber)??{accountNumber:line.accountNumber,debitCents:0,creditCents:0};row.debitCents=add(row.debitCents,line.debitCents);row.creditCents=add(row.creditCents,line.creditCents);byAccount.set(line.accountNumber,row);}
  const rows=[...byAccount.values()];
  // Do not silently net away original debit/credit activity on one account.
  if(rows.length<2||rows.length>100||rows.some(row=>row.debitCents&&row.creditCents||row.debitCents>99999999999||row.creditCents>99999999999))reject('This legacy journal needs explicit account-line reconciliation before canonical conversion; no lines were discarded or netted.');
  return rows;
}
export function deriveLegacyLedger(input,{actionId,actor,at}){
  assertLegacyConversion(input);const {source}=input,state=source.state;
  if(state===null||source.periods===null||!state.accounts?.length)reject('Conversion needs retained journal state, explicit account metadata and period history. Missing source records cannot be treated as zero or open.');
  if(state.accounts.length>100||state.entries.length>2000)reject('This business book exceeds the current 100-account / 2,000-journal conversion capacity. No history was removed.');
  if(Object.keys(state.commands).length>100||[state.audit,state.accountAudit??[],state.billing??[],source.periods.history].some(rows=>rows.length>5000))reject('This source exceeds the current private-review metadata capacity (100 command receipts and 5,000 rows per audit array). No retained metadata was omitted.');
  const snapshot=legacyBookSnapshot(source);if(snapshot.issues.length)reject(`Reconcile the retained business history before conversion: ${snapshot.issues.join(' ')}`);
  let closed=null,previous='';for(const event of source.periods.history){if(event.at<previous||event.through>event.at.slice(0,10))reject('Reconcile the original period-event chronology before conversion.');previous=event.at;if(event.action==='close'){if(closed&&event.through<=closed.through)reject('A source closing date must advance.');closed=event;}else{if(closed?.through!==event.through||closed.digest!==event.digest)reject('A source reopening must identify the original active seal.');closed=null;}}
  if(Boolean(closed)!==Boolean(source.periods.active)||closed&&['through','digest','actor','at'].some(key=>closed[key]!==source.periods.active[key]))reject('The retained active period seal must match the complete close/reopen history.');
  const dates=[...state.entries.map(row=>row.entry.date),...source.periods.history.map(row=>row.through),...(source.periods.active?[source.periods.active.through]:[])];
  if(input.from>input.through||input.through>at.slice(0,4)+'-12-31'||dates.some(day=>day<input.from||day>input.through)||state.entries.some(row=>row.entry.date>at.slice(0,10)))reject('The reviewed range must contain the entire retained history and period dates; future source postings cannot be converted.');
  const accounts=state.accounts.map(row=>({number:row.number,name:row.name,classification:row.classification,active:row.active})),numbers=new Set(accounts.map(row=>row.number)),ids=new Map(state.entries.map((row,index)=>[row.entry.id,`${input.bookId}:${index+1}`])),reversed=new Set();
  const entries=state.entries.map(row=>{
    const lines=normalizedLines(row.entry.lines);if(lines.some(line=>!numbers.has(line.accountNumber)))reject('Every imported posting must use a retained account.');
    if(row.reversesId){if(!ids.has(row.reversesId)||reversed.has(row.reversesId))reject('Reconcile missing or multiply reversed source journals before conversion.');reversed.add(row.reversesId);}
    return {id:ids.get(row.entry.id),date:row.entry.date,memo:row.entry.memo,lines,document:structuredClone(input.document),reverses:row.reversesId?ids.get(row.reversesId):null,actor,at,legacy:{entryId:row.entry.id,source:row.entry.source,actor:row.actor,recordedAt:row.recordedAt,reason:row.reason,imported:row.imported}};
  });
  // Reject reversal cycles even when every individual journal balances.
  const byId=new Map(entries.map(row=>[row.id,row]));for(const row of entries){const visited=new Set([row.id]);let cursor=row;while(cursor.reverses){if(visited.has(cursor.reverses))reject('A cyclic reversal chain cannot be converted.');visited.add(cursor.reverses);cursor=byId.get(cursor.reverses);}}
  const billing=(state.billing??[]).map(doc=>({document:structuredClone(doc),balance:legacyBillingBalance(doc),journalLinks:[doc.journalId,...doc.credits.map(row=>row.journalId),...doc.settlements.map(row=>row.journalId)].filter(Boolean).map(sourceId=>({sourceId,entryId:ids.get(sourceId)}))}));
  for(const item of billing)if(item.document.status!=='draft'&&(!item.document.journalId||accounts.find(account=>account.number===item.document.controlAccount)?.classification!==(item.document.kind==='invoice'?'receivable':'payable')))reject('A posted business invoice/bill needs its original journal and correctly classified control account.');
  const subledger=accounts.filter(account=>['receivable','payable'].includes(account.classification)).map(account=>{const row=snapshot.rows.find(row=>row.number===account.number),ledgerBalanceCents=account.classification==='receivable'?add(row?.debitCents??0,-(row?.creditCents??0)):add(row?.creditCents??0,-(row?.debitCents??0)),documentOutstandingCents=billing.filter(item=>item.document.controlAccount===account.number).reduce((n,item)=>add(n,item.balance.outstandingCents),0);return {accountNumber:account.number,name:account.name,classification:account.classification,ledgerBalanceCents,documentOutstandingCents,differenceCents:add(ledgerBalanceCents,-documentOutstandingCents)};});
  return {title:source.book.name,currency:'USD',from:input.from,through:input.through,accounts,entries,closedThrough:source.periods.active?.through??null,version:actionId,bookId:input.bookId,
    conversion:{actionId,actor,at,sourceBookId:source.book.id,sourceBookRevision:source.book.revision,reference:structuredClone(input.document),periods:structuredClone(source.periods),accountAudit:structuredClone(state.accountAudit??[]),billing,subledger,sourceJournalCount:state.entries.length}};
}
