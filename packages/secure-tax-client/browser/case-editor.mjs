import { returnTypes,requestedTaxYears } from '@shuug/tax-engine';
import { assertCaseCommand,caseBookVersion } from '../case-model.mjs';
import { isTaxReturn } from './return-view.mjs';
import { BOOK_ACTIONS,replayCaseBooks } from '../case-books.mjs';
import { drawCaseBookAction } from './case-books-editor.mjs';
import {officeLedgers} from '../office-model.mjs';
import {drawAuthorizationAction} from './case-authorization-editor.mjs';
const node=(document,tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const parsed=record=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(record.plaintext));}catch{return null;}};
const reference=record=>({objectId:record.objectId,revision:record.revision,envelopeDigest:record.envelopeDigest,domain:record.domain});

/** Ordinary forms create private review kits; they never write case state or
 * confer authority. Every note in the encrypted case is readable by the client. */
export function mountCaseEditor(document,container,{getClient,run,onSave,onDirty=()=>{},captureScope=()=>0,isCurrentScope=()=>true,confirm=globalThis.confirm}={}){
  let enabled=false,dirty=false,caseId='',action='case.create',readInput=()=>({}),evidenceId=()=>null;
  const section=node(document,'section');section.id='case-preparation';section.append(node(document,'h2','Client case work'),node(document,'p','Prepare document requests, exact-revision document decisions and a linked draft for separate firm approval. All case titles, history and notes are encrypted and readable by this client. Staff target dates are not statutory filing deadlines.'));
  const choose=node(document,'select');choose.id='case-choice';const chooseLabel=node(document,'label','Client case');chooseLabel.htmlFor=choose.id;
  const actionChoice=node(document,'select');actionChoice.id='case-action';const actionLabel=node(document,'label','Case action');actionLabel.htmlFor=actionChoice.id;
  const form=node(document,'div'),save=node(document,'button','Save private case review kit'),discard=node(document,'button','Discard case input');save.type='button';discard.type='button';discard.className='secondary';section.append(chooseLabel,choose,actionLabel,actionChoice,form,save,discard);container.append(section);
  const records=()=>getClient()?.records??new Map(),selected=()=>records().get(caseId)?.verifiedCase;
  const modified=()=>{dirty=true;onDirty();};
  function field(label,key,{type='text',maximum=2000,options=null}={}){
    const caption=node(document,'label',label),input=node(document,options?'select':type==='textarea'?'textarea':'input');input.id=`case-${key}`;caption.htmlFor=input.id;
    if(options){for(const [value,text]of options){const option=node(document,'option',text);option.value=value;input.append(option);}}
    else{if(type!=='textarea')input.type=type;input.maxLength=maximum;}form.append(caption,input);return input;
  }
  function draw(){
    form.replaceChildren();actionChoice.replaceChildren();const body=selected();
    if(!caseId)action='case.create';else if(action==='case.create')action='request.add';
    const book=body?replayCaseBooks(body.history,body.year):null;
    if(book&&action==='books.open')action='books.journal.post';
    const shared=body?.history.some(event=>event.type==='books.link'),bookActions=shared?[]:book?[['books.account.add','Add a ledger account'],['books.journal.post','Post a balanced journal'],['books.journal.reverse','Reverse an approved journal'],['books.period.close','Close a ledger period']]:[['books.open','Open this case’s working ledger']];
    if(shared&&BOOK_ACTIONS.includes(action))action='books.link';
    for(const [value,text]of caseId?[['request.add','Add a document request'],['document.review','Review a selected document'],['draft.link','Link a prepared draft'],['books.link','Link shared client books'],['authorization.review','Record reviewed authorization evidence'],...bookActions]:[['case.create','Create a client case']]){const option=node(document,'option',text);option.value=value;actionChoice.append(option);}actionChoice.value=action;
    evidenceId=()=>null;
    if(action==='case.create'){
      const title=field('Case title','title',{maximum:160}),kind=field('Return type','kind',{options:returnTypes.map(type=>[type.id,type.label])}),year=field('Tax year','year',{options:requestedTaxYears.map(year=>[String(year),year===2026?'2026 — case intake and books only':String(year)])});year.value='2025';form.append(node(document,'p','2023–2025 have limited federal draft calculations. 2026 accepts case intake and books; its calculation and form pack is not installed.'));readInput=()=>({title:title.value.trim(),year:Number(year.value),kind:kind.value});
    }else if(action==='request.add'){
      const title=field('Requested document','request-title',{maximum:160}),due=field('Staff target date (optional)','due',{type:'date'}),notes=field('Client-visible request note (encrypted)','request-notes',{type:'textarea'});readInput=()=>({requestId:crypto.randomUUID(),title:title.value.trim(),due:due.value,notes:notes.value});
    }else if(action==='books.link'){
      const choices=[['','Choose matching shared client books']],available=new Map();for(const record of records().values())if(record.verifiedOffice)for(const ledger of officeLedgers(record.verifiedOffice.history))if(ledger.from<=`${body.year}-01-01`&&ledger.through>=`${body.year}-12-31`){available.set(ledger.id,{record,ledger});choices.push([ledger.id,`${ledger.title} · ${ledger.bookId} · ${ledger.from} through ${ledger.through}`]);}
      const choice=field('Shared business ledger','shared-ledger',{options:choices}),notes=field('Client-visible link note','shared-ledger-notes',{type:'textarea'});evidenceId=()=>available.get(choice.value)?.record.objectId??null;readInput=()=>{const selected=available.get(choice.value);if(!selected)throw new Error('Open and select the shared ledger for this case year.');return {document:reference(selected.record),ledgerId:selected.ledger.id,ledgerVersion:selected.ledger.version,notes:notes.value};};form.append(node(document,'p','Linked client books become the source for this case. Historical case postings remain retained; linking does not copy or migrate them. Book changes require a fresh link and draft review.'));
    }else if(action==='authorization.review'){
      ({readInput,evidenceId}=drawAuthorizationAction(document,form,{body,caseId,field,records,getClient}));
    }else if(BOOK_ACTIONS.includes(action)){
      ({readInput,evidenceId}=drawCaseBookAction(document,form,{type:action,body,field,records:records(),onDirty:modified}));
    }else{
      const choices=[['','Choose an opened current item']];
      for(const record of records().values()){
        if(!['tax-document','driver-receipt'].includes(record.domain)||!record.envelopeDigest)continue;const value=parsed(record);
        if(action==='document.review'&&value?.version===1&&value.type==='private-file')choices.push([record.objectId,`${value.filename??'Private file'} · revision ${record.revision}`]);
        if(action==='draft.link'&&isTaxReturn(value)&&value.year===body?.year&&value.kind===body?.kind)choices.push([record.objectId,`${value.year} Form ${value.kind} · ${value.party?.name??'Draft'} · revision ${record.revision}`]);
      }
      const documentChoice=field(action==='document.review'?'Opened file to review':'Opened draft for this case','document',{options:choices});evidenceId=()=>documentChoice.value||null;
      if(choices.length===1)form.append(node(document,'p','No matching opened items are available. Discard this input and refresh current shared records after the client uploads or the firm shares the revision.'));
      const chosenReference=()=>{const record=records().get(documentChoice.value);if(!record)throw new Error('Choose a currently opened file or draft.');return reference(record);};
      if(action==='document.review'){
        const request=field('Document request','request',{options:[['','Choose a request'],...(body?.requests??[]).map(item=>[item.id,item.title])]}),decision=field('Document decision','decision',{options:[['reviewed','Reviewed'],['replacement_requested','Replacement requested']]}),notes=field('Client-visible review note (encrypted)','review-notes',{type:'textarea'});readInput=()=>({requestId:request.value,document:chosenReference(),decision:decision.value,notes:notes.value});
      }else{const notes=field('Client-visible draft note (encrypted)','draft-notes',{type:'textarea'});if(book||shared)form.append(node(document,'p','This link records review against the current approved ledger. Later ledger changes require reviewing and linking the draft again. Ledger amounts are not automatically copied into the return.'));readInput=()=>({document:chosenReference(),notes:notes.value,booksVersion:caseBookVersion(body.history,body.year)});}
    }
    controls();
  }
  function controls(){for(const control of section.querySelectorAll('input,textarea,select,button'))control.disabled=!enabled;}
  function choices(){choose.replaceChildren();const blank=node(document,'option','Create a new client case');blank.value='';choose.append(blank);for(const record of records().values())if(record.verifiedCase){const option=node(document,'option',`${record.verifiedCase.title} · ${record.verifiedCase.year} Form ${record.verifiedCase.kind}`);option.value=record.objectId;choose.append(option);}if(caseId&&!selected())caseId='';choose.value=caseId;}
  function refresh(){if(dirty)return;choices();draw();}
  function discardInput(){dirty=false;draw();onDirty();}
  choose.addEventListener('change',()=>{if(dirty&&!confirm('Discard the unsaved case input and select another case?')){choose.value=caseId;return;}caseId=choose.value;dirty=false;action=caseId?'request.add':'case.create';draw();onDirty();});
  actionChoice.addEventListener('change',()=>{if(dirty&&!confirm('Discard the unsaved case input and choose another action?')){actionChoice.value=action;return;}action=actionChoice.value;dirty=false;draw();onDirty();});
  form.addEventListener('input',modified);form.addEventListener('change',modified);
  discard.addEventListener('click',()=>{if(!dirty||confirm('Discard the unsaved case input? No approved case is changed.'))discardInput();});
  save.addEventListener('click',()=>{if(!enabled)return;return run(async()=>{const generation=captureScope(),command=assertCaseCommand({actionId:crypto.randomUUID(),type:action,input:await readInput()}),id=caseId||null,selectedEvidence=evidenceId();if(!isCurrentScope(generation))throw new Error('The client case scope changed.');await onSave(id,command,selectedEvidence);if(isCurrentScope(generation)){dirty=false;refresh();onDirty();}});});
  draw();choices();controls();return {element:section,get dirty(){return dirty;},get active(){return dirty||!!caseId;},setEnabled(value){enabled=!!value;controls();},refresh,clear(){dirty=false;caseId='';action='case.create';choose.replaceChildren(node(document,'option','No client case selected'));choose.value='';draw();onDirty();}};
}
