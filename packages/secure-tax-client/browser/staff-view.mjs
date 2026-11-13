import { decode64, DOMAINS } from '../envelope.mjs';
import { maskedDisplay } from './forms.mjs';
import { journalSections, renderJournal } from './journal-view.mjs';
import { renderPortalDashboard } from './client-portal-view.mjs';
import { isTaxReturn,renderReturn } from './return-view.mjs';
import { renderCase } from './case-view.mjs';
import { renderOffice } from './office-view.mjs';

export const STAFF_LABELS=Object.freeze({'tax-document':'Tax documents','tax-identity':'Tax identity','driver-record':'Trips, income & expenses','driver-receipt':'Receipts','driver-state':'Journal, goals & preferences','driver-route':'Routes','provider-record':'Provider records'});
const parse=item=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(item.plaintext));}catch{return null;}};
const filename=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,180)||'private-file':'private-file';

/** Read-only DOM. Data is rendered with textContent; a readable copy leaves this
 * view only after its explicit download button invokes the trusted callback. */
export function renderStaffRecords(document,records,binding,{download=()=>{},run=operation=>operation(),onReturnEdit=null}={}){
  const container=document.createElement('div');
  if(records.size){const summary=document.createElement('section'),heading=document.createElement('h2');summary.className='staff-business-summary';heading.textContent='Shared business records';summary.append(heading,renderPortalDashboard(document,records,{staff:true}));container.append(summary);}
  for(const domain of DOMAINS){
    const items=[...records.values()].filter(item=>item.domain===domain);if(!items.length)continue;
    const section=document.createElement('details'),heading=document.createElement('summary');section.className='area';heading.textContent=`${STAFF_LABELS[domain]} · ${items.length}`;section.append(heading);
    for(const item of items){
      const data=parse(item),row=document.createElement('article'),title=document.createElement('h3'),meta=document.createElement('small');row.className='item';
      title.textContent=typeof data?.title==='string'?data.title.slice(0,200):typeof data?.filename==='string'?data.filename.slice(0,200):STAFF_LABELS[domain];meta.textContent=`Item ${item.objectId} · revision ${item.revision}`;row.append(title,meta);
      const journal=journalSections(maskedDisplay(data),{...binding,objectId:item.objectId,domain:item.domain});
      const button=(text,action)=>{const node=document.createElement('button');node.type='button';node.className='secondary';node.textContent=text;node.addEventListener('click',()=>run(action));row.append(node);};
      if(item.verifiedOffice||data?.type==='client-office'){title.textContent='Client books and firm billing';row.append(renderOffice(document,item,records));}
      else if(item.verifiedCase||data?.type==='tax-case'){title.textContent='Client case';row.append(renderCase(document,item,records));}
      else if(item.domain==='tax-document'&&isTaxReturn(data)){title.textContent=`${data.year} Form ${data.kind} draft`;row.append(renderReturn(document,data,{download,run,isCurrent:()=>container.isConnected&&!document.hidden}));if(onReturnEdit)button('Propose return correction',()=>onReturnEdit(data,item.objectId));}
      else if(journal){title.textContent='Device Journal snapshot';row.append(renderJournal(document,journal));button('Download readable snapshot',()=>download(`${item.objectId}.journal.json`,item.plaintext,'application/json'));}
      else if(data?.version===1&&data.type==='private-file'&&typeof data.data==='string'){
        const note=document.createElement('p');note.textContent='Reviewed access to an encrypted attachment. Downloading creates a readable copy outside this vault.';row.append(note);
        button('Download readable file',async()=>{const bytes=decode64(data.data,1,10*1024*1024);try{await download(filename(data.filename),bytes,['application/pdf','image/jpeg','image/png'].includes(data.mime)?data.mime:'application/octet-stream');}finally{bytes.fill(0);}});
      }else{const pre=document.createElement('pre');pre.textContent=data?JSON.stringify(maskedDisplay(data),null,2).slice(0,20000):'This encrypted item has no supported readable view.';row.append(pre);if(data)button('Download readable JSON',()=>download(`${item.objectId}.json`,item.plaintext,'application/json'));}
      section.append(row);
    }
    container.append(section);
  }
  if(!container.childElementCount){const empty=document.createElement('p');empty.textContent='No shared encrypted items were returned for the selected client and allowed domains.';container.append(empty);}
  return container;
}
