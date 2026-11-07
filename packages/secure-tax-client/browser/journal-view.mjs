// Projections of DriverCore/Journal.swift. Missing device/file/provider data is
// stated explicitly; this module adds no accounting or device control actions.
const list=value=>Array.isArray(value)?value:[];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
const cents=(value,currency='USD')=>Number.isSafeInteger(value)?`${currency} ${(value/100).toFixed(2)}`:'Not recorded';
const row=(heading,details,summary='')=>({heading,details,summary});
const section=(id,label,rows,note='')=>({id,label,rows,note});
export function fieldLabel(key){return String(key).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());}
export function journalSections(payload,expected){
  if(payload?.version!==1||payload?.type!=='driver-journal'||!object(payload.journal))return null;
  if(expected.domain!=='driver-state'||!object(payload.binding)||['workspaceId','accountId','clientId','objectId'].some(key=>payload.binding[key]!==expected[key]))throw new Error('The decrypted Journal snapshot is bound to a different account or item.');
  if(!Number.isFinite(payload.capturedAt)||payload.capturedAt<0)throw new Error('The Journal snapshot has an invalid capture time.');
  const journal=payload.journal,entries=list(journal.entries),visible=entries.filter(entry=>entry?.record?.deleted===false),records=kind=>visible.filter(entry=>entry.record.kind===kind);
  const trips=records('trip'),expenses=records('expense'),incomes=records('income');
  const recordRows=(items,kind)=>items.map(entry=>{
    const body=entry.record.body??{},name=kind==='trip'?body.purpose:kind==='expense'?body.merchant:body.description;
    return row(typeof name==='string'&&name?name.slice(0,200):fieldLabel(kind),entry,kind==='trip'?
      `${body.localDate??'Date in details'} · ${body.classification??'Unclassified'} · ${Number.isFinite(body.distanceMeters)?(body.distanceMeters/1609.344).toFixed(2)+' mi':'Distance not recorded'} · fare ${cents(body.earningsCents)}`:
      `${body.date??'Date not recorded'} · ${cents(body.amountCents,body.currency??'USD')} · ${kind==='expense'?body.classification??'Unclassified':body.platform??'Platform not recorded'}`);
  });
  const incomeTotals=new Map();for(const {record} of incomes){const body=record.body??{};if(Number.isSafeInteger(body.amountCents)&&typeof body.currency==='string')incomeTotals.set(body.currency,(incomeTotals.get(body.currency)??0)+body.amountCents);}
  const earnings=[row('Recorded journal counts',{trips:trips.length,expenses:expenses.length,incomeEntries:incomes.length,deletedEntries:entries.filter(entry=>entry?.record?.deleted).length,conflicts:entries.filter(entry=>entry?.conflict).length,pendingEntries:entries.filter(entry=>entry?.pendingMutationId).length})];
  for(const [currency,total] of incomeTotals)earnings.push(row(`Entered income · ${currency}`,{currency,amountCents:total},cents(total,currency)));
  const arrayRows=(key,names)=>list(journal[key]).map((item,index)=>row(names.map(name=>item?.[name]).find(value=>typeof value==='string'&&value)||`${fieldLabel(key)} ${index+1}`,item));
  const settingRows=keys=>keys.filter(key=>journal[key]!=null).map(key=>row(fieldLabel(key),journal[key]));
  return [
    section('account','Account & snapshot',[row('Encrypted account binding',payload.binding),row('Captured on device',{capturedAt:payload.capturedAt,lastSyncAt:journal.lastSyncAt,version:journal.version,cursor:journal.cursor})],'Read-only snapshot. Profile changes and device controls are not restored or replayed.'),
    section('trips','Trips',recordRows(trips,'trip'),'Classification, timezone, gaps, platform and source remain in each detail. Recorded fares stay separate from entered income.'),
    section('routes','Historical routes',[],'Journal Codable excludes route points. Route file bytes need a separate encrypted driver-route object.'),
    section('expenses','Expenses',recordRows(expenses,'expense'),'Full recorded amounts, not business-use deductions or tax calculations. Receipt bytes are separate encrypted objects.'),
    section('receipts','Receipt inventory',list(journal.receipts).map(receipt=>row(`Receipt ${receipt?.id??'without ID'}`,receipt)),'Metadata only. A legacy uploaded flag does not prove encrypted receipt bytes are present.'),
    section('income','Entered income',recordRows(incomes,'income'),'May duplicate platform payouts, deposits or trip fares. These figures are not combined.'),
    section('review','Earnings & review',earnings,'Recorded counts and entered-income totals only. Native profitability, charts and review actions still need equivalent browser workflows.'),
    section('goals','Goals',settingRows(['goals']),'Vehicle cost per mile is a user planning estimate, not a tax mileage rate.'),
    section('reserves','Planning reserves',settingRows(['reserveSettings']),'Planning percentages, not liabilities, balances or actual transfers.'),
    section('mission','Go Home mission & pickup waits',[...settingRows(['mission','activeTripId','tracker']),...arrayRows('pickupWaits',['name'])],'No tracking or mission action starts from this view.'),
    section('positioning','Positioning & route evidence',[],'In-memory searches and offerRouteEvidence are not in Journal Codable. This view does not provide a synchronized route optimizer or map.'),
    section('offers','Offer inbox',arrayRows('gigOffers',['providerOfferId','platform']),'Uncertainty, provenance, missing fields and verification remain in details. Offers are not earnings or accepted provider work.'),
    section('work','Decisions & accepted work',[...arrayRows('gigDecisions',['platform','action']),...arrayRows('gigCommitments',['platform','status'])],'History only. No provider acceptance, cancellation or device action is dispatched.'),
    section('comparisons','Reviewed offer comparisons',[...arrayRows('observedOffers',['platform']),...arrayRows('missionOffers',['label'])],'Legacy comparisons remain distinct from universal offers and income.'),
    section('capture','Capture & ingestion history',arrayRows('gigOfferLogs',['message','reason']),'Durable normalized Journal logs only. Transient frames, native permissions and capture sessions are absent.'),
    section('assistance','Alerts & assistance',[...settingRows(['assistance']),...arrayRows('driverAlerts',['title','message']),...arrayRows('placePrompts',['merchant','name'])],'Device permissions, notification schedules and historical actions are not replayed.'),
    section('bank-review','Bank statement review',[...arrayRows('bankTransactions',['merchant','name','description']),...settingRows(['bankCursor','bankUpdatedAt'])],'Review links remain distinct from journal income/expenses; no automatic reconciliation.'),
    section('bank-connection','Bank connection',[],'Tokens and live connection authority are absent. Host-held tokens require separate revocation/removal and trusted connector migration.'),
    section('providers','Gig provider facts',[],'Server-only profile, trips and payments need separate encrypted provider-record objects. They are not inferred from offers.'),
    section('tax','Tax work & documents',[],'Requests, progress and document bytes need separate encrypted tax objects and authorized staff views. No filing completion claim.'),
    section('rewards','Referrals, rewards & exports',[],'Server-only referrals/rewards need separate encrypted payloads. Explicit readable snapshot exports leave the vault.')
  ];
}
function readableValue(document,value,key='',depth=0){
  if(value==null){const span=document.createElement('span');span.textContent='Not recorded';return span;}
  if(typeof value!=='object'){
    const span=document.createElement('span');
    if(typeof value==='number'&&/(At|Until|deadline|date)$/i.test(key)&&value>1e11&&value<1e14)span.textContent=new Date(value).toISOString();
    else if(typeof value==='number'&&/Cents$/.test(key))span.textContent=cents(value);
    else span.textContent=String(value).slice(0,4000);return span;
  }
  if(depth>8){const span=document.createElement('span');span.textContent='Nested detail continues in the explicit snapshot export.';return span;}
  const array=Array.isArray(value),container=document.createElement(array?'ol':'dl');
  for(const [childKey,child] of Object.entries(value).slice(0,100)){
    if(array){const li=document.createElement('li');li.append(readableValue(document,child,key,depth+1));container.append(li);}
    else{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=fieldLabel(childKey);dd.append(readableValue(document,child,childKey,depth+1));container.append(dt,dd);}
  }
  if(Object.keys(value).length>100){const note=document.createElement('p');note.textContent='First 100 nested fields shown; explicit export retains the complete snapshot.';container.append(note);}
  return container;
}
export function renderJournal(document,sections){
  const container=document.createElement('div');container.className='journal';
  for(const group of sections){
    const area=document.createElement('details'),summary=document.createElement('summary'),note=document.createElement('p'),rows=document.createElement('div'),pager=document.createElement('div');
    area.className='area';summary.textContent=`${group.label} · ${group.rows.length}`;note.textContent=group.note;area.append(summary,note,rows,pager);let page=0;
    const draw=()=>{
      rows.replaceChildren();pager.replaceChildren();
      if(!group.rows.length){const empty=document.createElement('p');empty.textContent='No saved data in this snapshot for this section.';rows.append(empty);}
      for(const item of group.rows.slice(page*20,(page+1)*20)){
        const detail=document.createElement('details'),heading=document.createElement('summary'),description=document.createElement('p');detail.className='journal-row';heading.textContent=item.heading;description.textContent=item.summary;detail.append(heading,description,readableValue(document,item.details));rows.append(detail);
      }
      if(group.rows.length>20){
        for(const [label,delta,disabled] of [['Previous',-1,page===0],['Next',1,(page+1)*20>=group.rows.length]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled;button.addEventListener('click',()=>{page+=delta;draw();});pager.append(button);}
        const range=document.createElement('small');range.textContent=` ${page*20+1}–${Math.min((page+1)*20,group.rows.length)} of ${group.rows.length}`;pager.append(range);
      }
    };draw();container.append(area);
  }
  return container;
}
