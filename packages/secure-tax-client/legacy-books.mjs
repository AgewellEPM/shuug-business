// Read-only accounting evidence. This module never posts journals or invoices.
import {legacySha256,verifyLegacyImportReport} from './legacy-import.mjs';
const fail=()=>{throw new Error('The selected legacy business book has unsupported or inconsistent source framing. No accounting history was replaced.');};
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function keys(value,required,optional=[]){if(!object(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))fail();}
const string=(value,max=1000)=>{if(typeof value!=='string'||value.length>max)fail();};
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail();};
const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))fail();};
const id=value=>{string(value,150);if(!value.length)fail();};
const bool=value=>{if(typeof value!=='boolean')fail();};
const list=(value,max=100000)=>{if(!Array.isArray(value)||value.length>max)fail();return value;};
const unique=(values)=>{if(new Set(values).size!==values.length)fail();};
const digest=value=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();};
const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail();};
const instant=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();};
const nullable=(value,check)=>{if(value!==null)check(value);};
const oneOf=(value,values)=>{if(!values.includes(value))fail();};
const add=(a,b)=>{const value=a+b;if(!Number.isSafeInteger(value))fail();return value;};
const accountClasses={bank:'asset',receivable:'asset',current_asset:'asset',fixed_asset:'asset',other_asset:'asset',payable:'liability',credit_card:'liability',current_liability:'liability',long_term_liability:'liability',equity:'equity',income:'income',other_income:'income',cogs:'cogs',expense:'expense',other_expense:'expense'};
function account(value){
  keys(value,['number','name','type','statement','classification','parentNumber','active','revision','system']);integer(value.number,1,999999999);string(value.name,150);if(accountClasses[value.classification]!==value.type||value.statement!==(['asset','liability','equity'].includes(value.type)?'balance-sheet':'profit-and-loss'))fail();nullable(value.parentNumber,n=>integer(n,1,999999999));bool(value.active);bool(value.system);integer(value.revision,1);
}
function manual(value){keys(value,['revision','actor','recordedAt','reversesId','reversedById','reason','imported']);if(value.revision!==1)fail();string(value.actor);instant(value.recordedAt);nullable(value.reversesId,id);nullable(value.reversedById,id);nullable(value.reason,v=>string(v));bool(value.imported);}
function entry(value){
  keys(value,['id','date','memo','source','lines'],['manual']);id(value.id);date(value.date);string(value.memo);string(value.source,200);if(value.manual!==undefined)manual(value.manual);
  let debit=0,credit=0;if(list(value.lines,1000).length<2)fail();
  for(const line of value.lines){keys(line,['accountNumber','debitCents','creditCents']);integer(line.accountNumber,1,999999999);integer(line.debitCents);integer(line.creditCents);if((line.debitCents>0)===(line.creditCents>0))fail();debit=add(debit,line.debitCents);credit=add(credit,line.creditCents);}
  if(debit!==credit||debit===0)fail();
}
function billingLine(value){
  keys(value,['description','quantity','unit','unitCents','discountCents','taxCents','accountNumber','taxAccountNumber']);string(value.description,500);string(value.unit,40);if(typeof value.quantity!=='string'||!/^\d{1,7}(\.\d{1,4})?$/.test(value.quantity))fail();for(const key of ['unitCents','discountCents','taxCents'])integer(value[key],0,99999999999);for(const key of ['accountNumber','taxAccountNumber'])integer(value[key],1,999999999);lineAmount(value);
}
function lineAmount(value){const [whole,fraction='']=value.quantity.split('.'),quantity=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));if(quantity<=0n)fail();const gross=(quantity*BigInt(value.unitCents)+5000n)/10000n;if(gross>99999999999n||BigInt(value.discountCents)>gross)fail();return add(Number(gross)-value.discountCents,value.taxCents);}
function billing(value){
  keys(value,['kind','number','heading','date','due','currency','party','issuer','terms','notes','privateNotes','controlAccount','lines','custom','id','revision','status','createdAt','updatedAt','journalId','settlements','credits']);uuid(value.id);integer(value.revision,1);oneOf(value.kind,['invoice','bill']);oneOf(value.status,['draft','posted','void']);if(value.currency!=='USD')fail();date(value.date);date(value.due);instant(value.createdAt);instant(value.updatedAt);nullable(value.journalId,id);integer(value.controlAccount,1,999999999);
  for(const key of ['number','heading','issuer','terms','notes','privateNotes'])string(value[key],5000);keys(value.party,['name','email','address']);for(const key of ['name','email','address'])string(value.party[key],2000);
  if(!list(value.lines,100).length)fail();value.lines.forEach(billingLine);for(const row of list(value.custom,30)){keys(row,['label','value']);string(row.label,80);string(row.value,500);}
  for(const row of list(value.settlements)){keys(row,['id','date','amountCents','accountNumber','method','reference','evidence','direction','journalId','actor','at'],['providerPaymentId']);uuid(row.id);date(row.date);integer(row.amountCents,1,99999999999);integer(row.accountNumber,1,999999999);oneOf(row.direction,['payment','refund']);id(row.journalId);instant(row.at);for(const key of ['method','reference','evidence','actor'])string(row[key],2000);if(row.providerPaymentId!==undefined)string(row.providerPaymentId,200);}
  for(const row of list(value.credits)){keys(row,['id','date','reason','lines','amountCents','journalId','actor','at']);uuid(row.id);date(row.date);string(row.reason);string(row.actor);instant(row.at);id(row.journalId);integer(row.amountCents,0,99999999999);list(row.lines,100).forEach(billingLine);if(row.lines.reduce((n,line)=>add(n,lineAmount(line)),0)!==row.amountCents)fail();}
  unique(value.credits.map(row=>row.id));unique(value.settlements.map(row=>row.id));legacyBillingBalance(value);
}
export function legacyBillingBalance(value){
  const total=value.lines.reduce((n,line)=>add(n,lineAmount(line)),0),credited=value.credits.reduce((n,row)=>add(n,row.amountCents),0),paid=value.settlements.reduce((n,row)=>add(n,row.direction==='payment'?row.amountCents:-row.amountCents),0);
  return {totalCents:total,creditedCents:credited,paidCents:paid,outstandingCents:value.status==='posted'?add(add(total,-credited),-paid):0};
}
export function assertLegacyBookSource(value){
  keys(value,['version','kind','book','state','periods','legacy']);if(value.version!==1||value.kind!=='legacy-client-book')fail();
  const book=value.book;keys(book,['id','clientId','name','revision','currency','grants','createdAt']);uuid(book.id);uuid(book.clientId);string(book.name,140);integer(book.revision,1);if(book.currency!=='USD')fail();instant(book.createdAt);
  for(const grant of list(book.grants,100)){keys(grant,['accountId','level']);uuid(grant.accountId);oneOf(grant.level,['view','edit']);}unique(book.grants.map(row=>row.accountId));
  keys(value.legacy,['accountId','clientId','bookId','bookDocumentId','stateDocumentId','periodDocumentId']);uuid(value.legacy.accountId);if(value.legacy.clientId!==book.clientId||value.legacy.bookId!==book.id||value.legacy.bookDocumentId!==`client-book:${book.id}`||value.legacy.stateDocumentId!==`state:client-journal:${book.id}`||value.legacy.periodDocumentId!==`accounting-periods:${book.id}`)fail();
  const state=value.state;
  if(state!==null){
    keys(state,['entries','commands','audit'],['accounts','accountAudit','billing']);
    for(const row of list(state.entries)){keys(row,['entry','actor','recordedAt','reversesId','reason','imported']);entry(row.entry);string(row.actor);instant(row.recordedAt);nullable(row.reversesId,id);nullable(row.reason,v=>string(v));bool(row.imported);}unique(state.entries.map(row=>row.entry.id));
    if(!object(state.commands)||Object.keys(state.commands).length>100000)fail();for(const [key,row]of Object.entries(state.commands)){id(key);keys(row,['hash','id']);digest(row.hash);id(row.id);}
    for(const row of list(state.audit)){keys(row,['id','action','entryId','actor','at','relatedId']);id(row.id);string(row.action,200);id(row.entryId);string(row.actor);instant(row.at);nullable(row.relatedId,id);}
    if(state.accounts!==undefined){list(state.accounts,50000).forEach(account);unique(state.accounts.map(row=>row.number));}
    if(state.accountAudit!==undefined)for(const row of list(state.accountAudit)){keys(row,['id','number','actor','at','before','after']);id(row.id);integer(row.number,1,999999999);string(row.actor);instant(row.at);nullable(row.before,account);account(row.after);}
    if(state.billing!==undefined){list(state.billing).forEach(billing);unique(state.billing.map(row=>row.id));}
  }
  if(value.periods!==null){
    keys(value.periods,['active','history']);const active=value.periods.active;if(active!==null){keys(active,['through','entries','digest','actor','at']);date(active.through);list(active.entries).forEach(entry);unique(active.entries.map(row=>row.id));digest(active.digest);string(active.actor);instant(active.at);if(active.entries.some(row=>row.date>active.through))fail();}
    for(const row of list(value.periods.history)){keys(row,['action','through','actor','at','reason','digest'],['reviewed']);oneOf(row.action,['close','reopen']);date(row.through);string(row.actor);instant(row.at);string(row.reason);digest(row.digest);if(row.reviewed!==undefined&&row.reviewed!==true)fail();}
  }
  return value;
}
export const legacyBookCounts=value=>({clientBusinessBooks:1,clientBookJournalEntries:value.state?.entries.length??0,clientBookBillingDocuments:value.state?.billing?.length??0,clientBookPeriodEvents:value.periods?.history.length??0,clientBooksMissingState:value.state===null?1:0});
export const isLegacyBooks=value=>value?.version===1&&value?.type==='legacy-accounting';
const entrySnapshot=entries=>JSON.stringify(entries.map(({id,date,source,memo,lines})=>({id,date,source,memo,lines})).sort((a,b)=>a.id.localeCompare(b.id)));
export async function legacyEntryDigest(entries){return legacySha256(new TextEncoder().encode(entrySnapshot(entries)));}
export async function verifyLegacyBooks(value,context,pins){
  keys(value,['version','type','source','migration','preparation']);if(!isLegacyBooks(value)||context.domain!=='tax-document')fail();assertLegacyBookSource(value.source);keys(value.migration,['version','backupManifestSha256']);if(value.migration.version!==1)fail();keys(value.preparation,['reportBytes','signature']);
  // Preserve exact signed bytes; parsing and reserializing a report changes its signature.
  const bytes=new TextEncoder().encode(value.preparation.reportBytes);if(bytes.length>8*1024**2)fail();const preliminary=JSON.parse(value.preparation.reportBytes);
  const report=await verifyLegacyImportReport(bytes,value.preparation.signature,pins,{...context,keyId:preliminary.recipientManifest?.client?.keyId});
  const selected=report.entries.find(row=>row.objectId===context.objectId&&row.sourceType==='client-book');
  if(!selected||report.backupManifestSha256!==value.migration.backupManifestSha256||selected.sourceSha256!==await legacySha256(new TextEncoder().encode(JSON.stringify(value.source))))fail();
  const active=value.source.periods?.active;if(active&&await legacyEntryDigest(active.entries)!==active.digest)fail();
  return value.source;
}
export function legacyBookSnapshot(source){
  assertLegacyBookSource(source);const entries=source.state?.entries??[],accounts=new Map((source.state?.accounts??[]).map(row=>[row.number,row])),balances=new Map(),issues=[];
  if(source.state===null)issues.push('The copied backup contains no stored journal state for this book. Its balance is unknown.');
  if(source.state?.accounts===undefined)issues.push('The source used the legacy default account catalog; stored account metadata is absent. Account numbers are retained without guessed classifications.');
  if(source.periods===null)issues.push('No stored period record was present. Closure history is unknown.');
  if(source.state&&source.periods?.active&&entrySnapshot(entries.filter(row=>row.entry.date<=source.periods.active.through).map(row=>row.entry))!==entrySnapshot(source.periods.active.entries))issues.push('Retained journal history differs from the original closed-period snapshot. Both versions are preserved below and require accounting review.');
  const ids=new Map(entries.map(row=>[row.entry.id,row]));
  const netLines=entry=>{const rows=new Map();for(const line of entry.lines)rows.set(line.accountNumber,add(rows.get(line.accountNumber)??0,line.debitCents-line.creditCents));return rows;};
  for(const row of entries){
    for(const line of row.entry.lines){const prior=balances.get(line.accountNumber)??0;balances.set(line.accountNumber,add(prior,add(line.debitCents,-line.creditCents)));}
    if(row.reversesId){const original=ids.get(row.reversesId),originalLines=original?netLines(original.entry):new Map(),reversedLines=netLines(row.entry);if(!original||row.entry.date<original.entry.date||[...new Set([...originalLines.keys(),...reversedLines.keys()])].some(number=>(originalLines.get(number)??0)!==-(reversedLines.get(number)??0)))issues.push(`Reversal ${row.entry.id} needs source-link review.`);}
  }
  for(const doc of source.state?.billing??[])if([doc.journalId,...doc.credits.map(row=>row.journalId),...doc.settlements.map(row=>row.journalId)].filter(Boolean).some(id=>!ids.has(id)))issues.push(`Business ${doc.kind} ${doc.number} has journal references missing from the retained state.`);
  const rows=[...balances].sort(([a],[b])=>a-b).map(([number,net])=>({number,name:accounts.get(number)?.name??`Account ${number}`,debitCents:Math.max(0,net),creditCents:Math.max(0,-net)}));
  const debitCents=rows.reduce((n,row)=>add(n,row.debitCents),0),creditCents=rows.reduce((n,row)=>add(n,row.creditCents),0);
  return {counts:legacyBookCounts(source),entries,rows,debitCents:source.state===null?null:debitCents,creditCents:source.state===null?null:creditCents,billing:(source.state?.billing??[]).map(doc=>({document:doc,balance:legacyBillingBalance(doc)})),issues,canonicalLedgerPosted:false};
}
