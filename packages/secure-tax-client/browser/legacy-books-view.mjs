import {legacyBookSnapshot} from '../legacy-books.mjs';
const money=value=>value===null?'Unknown':`${value<0?'-':''}$${Math.floor(Math.abs(value)/100).toLocaleString('en-US')}.${String(Math.abs(value)%100).padStart(2,'0')}`;
const node=(document,tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
function table(document,head,rows){const element=node(document,'table'),thead=node(document,'thead'),tr=node(document,'tr'),body=node(document,'tbody');head.forEach(text=>tr.append(node(document,'th',text)));thead.append(tr);for(const values of rows){const row=node(document,'tr');values.forEach(text=>row.append(node(document,'td',String(text))));body.append(row);}element.append(thead,body);return element;}
function paged(document,title,values,render){
  const section=node(document,'details'),summary=node(document,'summary',`${title} · ${values.length}`),content=node(document,'div'),next=node(document,'button','Show next 50');next.type='button';let shown=0;
  function append(){for(const value of values.slice(shown,shown+50))content.append(render(value));shown=Math.min(shown+50,values.length);next.hidden=shown>=values.length;next.textContent=`Show next 50 (${values.length-shown} remaining)`;}
  next.addEventListener('click',append);section.append(summary,content,next);append();return section;
}
function journal(document,row){
  const section=node(document,'article'),entry=row.entry??row;section.append(node(document,'h4',`${entry.date} · ${entry.memo}`),node(document,'p',`Source ${entry.source} · entry ${entry.id}`));
  if(row.actor)section.append(node(document,'p',`Recorded by ${row.actor} at ${row.recordedAt}`));if(row.reversesId)section.append(node(document,'p',`Reverses ${row.reversesId} · ${row.reason??'No recorded reason'}`));
  section.append(table(document,['Account','Debit','Credit'],entry.lines.map(line=>[line.accountNumber,money(line.debitCents),money(line.creditCents)])));return section;
}
/** Only openedRecordMetadata's authenticated source enters the readable view. */
export function renderLegacyBooks(document,record,{download=()=>{},run=operation=>operation()}={}){
  const section=node(document,'section');section.className='legacy-business-books';
  if(!record?.verifiedLegacyBooks){section.append(node(document,'p','The source signature for this accounting archive could not be verified.'));return section;}
  const source=record.verifiedLegacyBooks,view=legacyBookSnapshot(source);
  section.append(node(document,'h3',source.book.name),node(document,'p','Imported client business accounting history. The firm-signed preparation and original period seals were verified. These are historical source records; they have not been posted into the current client ledger or charged as firm fees.'));
  section.append(node(document,'p',`Book revision ${source.book.revision} · ${view.counts.clientBookJournalEntries} journal entries · ${view.counts.clientBookBillingDocuments} business invoices/bills · ${view.counts.clientBookPeriodEvents} period events.`));
  for(const issue of view.issues)section.append(node(document,'p',issue));
  section.append(node(document,'h4','Retained journal trial balance'),table(document,['Account','Name','Debit','Credit'],view.rows.map(row=>[row.number,row.name,money(row.debitCents),money(row.creditCents)])),node(document,'p',`Total debits ${money(view.debitCents)} · total credits ${money(view.creditCents)}. All retained journal dates; no bank reconciliation, cash-basis or tax treatment is inferred.`));
  section.append(paged(document,'Journal history',view.entries,row=>journal(document,row)));
  section.append(paged(document,'Client business invoices and bills',view.billing,({document:doc,balance})=>{
    const article=node(document,'article');article.append(node(document,'h4',`${doc.kind} ${doc.number} · ${doc.status}`),node(document,'p',`${doc.party.name} · ${doc.date} · due ${doc.due}`),node(document,'p',`Original total ${money(balance.totalCents)} · credits ${money(balance.creditedCents)} · net paid ${money(balance.paidCents)} · historical outstanding ${money(balance.outstandingCents)}`));
    article.append(table(document,['Description','Quantity','Unit price','Discount','Tax'],doc.lines.map(line=>[line.description,line.quantity,money(line.unitCents),money(line.discountCents),money(line.taxCents)])));
    for(const event of doc.settlements)article.append(node(document,'p',`${event.date} ${event.direction} ${money(event.amountCents)} · ${event.method} · ${event.reference} · journal ${event.journalId}`));
    for(const event of doc.credits)article.append(node(document,'p',`${event.date} credit ${money(event.amountCents)} · ${event.reason} · journal ${event.journalId}`));
    for(const [label,value]of [['Notes',doc.notes],['Private source notes',doc.privateNotes],['Terms',doc.terms]])if(value)article.append(node(document,'p',`${label}: ${value}`));return article;
  }));
  const active=source.periods?.active;section.append(node(document,'p',active?`Source period seal through ${active.through} · ${active.entries.length} sealed entries · recorded by ${active.actor} at ${active.at}. Sealed entries are retained separately from the journal above.`:source.periods===null?'Period record absent from the copied backup.':'No active source period seal; retained history follows.'));
  section.append(paged(document,'Period close/reopen history',source.periods?.history??[],event=>node(document,'p',`${event.action} through ${event.through} · ${event.actor} at ${event.at} · ${event.reason} · digest ${event.digest}`)));
  if(active)section.append(paged(document,'Original sealed journal entries',active.entries,row=>journal(document,row)));
  section.append(node(document,'p',`${source.state?.accountAudit?.length??0} account changes, ${source.state?.audit.length??0} journal audit events and ${Object.keys(source.state?.commands??{}).length} historical command receipts are preserved in the full source export. Historical access grants do not authorize access in this account.`));
  const save=node(document,'button','Download retained accounting source (readable JSON)');save.type='button';save.addEventListener('click',()=>run(async()=>{const bytes=new TextEncoder().encode(JSON.stringify(source,null,2));try{await download('legacy-client-business-books.json',bytes,'application/json');}finally{bytes.fill(0);}}));section.append(save,node(document,'p','Downloading creates a readable copy outside the encrypted workspace. Bank-statement reconciliation records, payment connections, invoice delivery and sharing links require separate migration review.'));
  return section;
}
