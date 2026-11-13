// Pure private office state. This module neither stores data nor grants access.
import {decode64} from './envelope.mjs';
import {checkedReturnDraft} from './return-proposals.mjs';
import {BOOK_ACTIONS,assertBookInput,replayCaseBooks,caseBookReport} from './case-books.mjs';
import {OFFICE_ACTIONS,isOfficeBody,assertOfficeBody,assertOfficeCommand,applyOfficeTransition,officeLedgers,officeSnapshot} from './office-model.mjs';

import {canonicalCaseJson} from './case-json.mjs';
import {AUTHORIZATION_ACTION,assertAuthorizationInput,assertAuthorizationHistory,caseContentVersion} from './case-authorization.mjs';
export {canonicalCaseJson,CASE_PRIVATE_JSON_MAX_BYTES} from './case-json.mjs';
export const CASE_BODY_MAX_BYTES=128*1024;
const MAX_FILE_BYTES=10*1024*1024,utf8=new TextEncoder();
const kinds=['1040','1065','1120S','1120'],actions=['case.create','request.add','document.review','draft.link','books.link',AUTHORIZATION_ACTION,...BOOK_ACTIONS];
const fail=()=>{throw new Error('The private tax case, transition or selected evidence is invalid.');};
export function exactCaseObject(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();
}
function identifier(value){if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();}
function text(value,maximum,required=false){if(typeof value!=='string'||value.length>maximum||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail();}
export function assertCaseTime(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();return value;}
function due(value){if(value==='')return;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00.000Z'))||new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value)fail();}

export function assertCaseReference(reference,{draft=false}={}){
  exactCaseObject(reference,['objectId','revision','envelopeDigest','domain']);identifier(reference.objectId);
  if(!Number.isSafeInteger(reference.revision)||reference.revision<1||reference.revision>1e9||!['tax-document','driver-receipt'].includes(reference.domain)||draft&&reference.domain!=='tax-document')fail();
  decode64(reference.envelopeDigest,32);return reference;
}
export function sameCaseReference(first,second){try{assertCaseReference(first);assertCaseReference(second);return ['objectId','revision','envelopeDigest','domain'].every(key=>first[key]===second[key]);}catch{return false;}}
export function caseBookVersion(history,year){const link=history.findLast(event=>event.type==='books.link');return link?'linked:'+link.actionId:replayCaseBooks(history,year)?.version??null;}
function review(value,history){
  if(value===null)return;
  exactCaseObject(value,['document','decision','notes','actor','at']);assertCaseReference(value.document);if(!['reviewed','replacement_requested'].includes(value.decision))fail();text(value.notes,2000);identifier(value.actor);assertCaseTime(value.at);
  if(!history.some(event=>event.type==='document.review'&&event.actor===value.actor&&event.at===value.at))fail();
}
export function assertCaseBody(body){
  if(isOfficeBody(body))return assertOfficeBody(body);
  exactCaseObject(body,['title','year','kind','requests','draft','history']);text(body.title,160,true);if(![2023,2024,2025,2026].includes(body.year)||!kinds.includes(body.kind))fail();
  if(!Array.isArray(body.requests)||body.requests.length>100||!Array.isArray(body.history)||!body.history.length||body.history.length>256)fail();
  const actionIds=new Set();let previous=-Infinity;
  for(const [index,event]of body.history.entries()){
    exactCaseObject(event,['actionId','type','input','actor','at','notes']);assertCaseCommand({actionId:event.actionId,type:event.type,input:event.input});identifier(event.actor);assertCaseTime(event.at);text(event.notes,2000);
    if(!actions.includes(event.type)||(index===0?event.type!=='case.create':event.type==='case.create')||actionIds.has(event.actionId)||Date.parse(event.at)<previous)fail();actionIds.add(event.actionId);previous=Date.parse(event.at);
    if(event.notes!==(event.type==='case.create'?'':event.input.notes))fail();
  }
  const requestIds=new Set();for(const request of body.requests){exactCaseObject(request,['id','title','due','notes','review']);identifier(request.id);text(request.title,160,true);due(request.due);text(request.notes,2000);if(requestIds.has(request.id))fail();requestIds.add(request.id);review(request.review,body.history);}
  if(body.requests.length!==body.history.filter(event=>event.type==='request.add').length)fail();
  if(body.draft!==null)assertCaseReference(body.draft,{draft:true});
  if((body.draft!==null)!==body.history.some(event=>event.type==='draft.link'))fail();
  replayCaseBooks(body.history,body.year);assertAuthorizationHistory(body.history);
  let shared=false;for(const event of body.history){if(event.type==='books.link')shared=true;else if(shared&&BOOK_ACTIONS.includes(event.type))fail();}
  // A draft link explicitly records the exact book state reviewed at that time.
  // Existing document-only cases keep their original body/certificate format.
  for(const [index,event]of body.history.entries())if(event.type==='draft.link'){
    const version=caseBookVersion(body.history.slice(0,index),body.year);
    if((event.input.booksVersion??null)!==version)fail();
  }
  // Replay private command facts without file contents. Actual evidence was
  // authenticated by the firm before certification; history retains its exact
  // references/decisions so replacing a review never erases the prior fact.
  const initial=body.history[0].input,derived={title:initial.title,year:initial.year,kind:initial.kind,requests:[],draft:null};
  for(const event of body.history.slice(1)){
    const input=event.input;
    if(event.type==='request.add'){if(derived.requests.some(request=>request.id===input.requestId))fail();derived.requests.push({id:input.requestId,title:input.title,due:input.due,notes:input.notes,review:null});}
    if(event.type==='document.review'){const request=derived.requests.find(request=>request.id===input.requestId);if(!request)fail();request.review={document:input.document,decision:input.decision,notes:input.notes,actor:event.actor,at:event.at};}
    if(event.type==='draft.link')derived.draft=input.document;
  }
  if(canonicalCaseJson(derived)!==canonicalCaseJson({title:body.title,year:body.year,kind:body.kind,requests:body.requests,draft:body.draft}))fail();
  if(utf8.encode(canonicalCaseJson(body)).length>CASE_BODY_MAX_BYTES)fail();return body;
}
export function assertCaseCommand(command){
  if(OFFICE_ACTIONS.includes(command?.type))return assertOfficeCommand(command);
  exactCaseObject(command,['actionId','type','input']);identifier(command.actionId);if(!actions.includes(command.type))fail();const input=command.input;
  if(command.type==='case.create'){exactCaseObject(input,['title','year','kind']);text(input.title,160,true);if(![2023,2024,2025,2026].includes(input.year)||!kinds.includes(input.kind))fail();}
  if(command.type==='request.add'){exactCaseObject(input,['requestId','title','due','notes']);identifier(input.requestId);text(input.title,160,true);due(input.due);text(input.notes,2000);}
  if(command.type==='document.review'){exactCaseObject(input,['requestId','document','decision','notes']);identifier(input.requestId);assertCaseReference(input.document);if(!['reviewed','replacement_requested'].includes(input.decision))fail();text(input.notes,2000);}
  if(command.type==='draft.link'){exactCaseObject(input,['document','notes',...Object.hasOwn(input??{},'booksVersion')?['booksVersion']:[]]);assertCaseReference(input.document,{draft:true});text(input.notes,2000);if(input.booksVersion!==undefined&&input.booksVersion!==null)identifier(input.booksVersion);}
  if(command.type==='books.link'){exactCaseObject(input,['document','ledgerId','ledgerVersion','notes']);assertCaseReference(input.document,{draft:true});identifier(input.ledgerId);identifier(input.ledgerVersion);text(input.notes,2000);}
  if(command.type===AUTHORIZATION_ACTION)assertAuthorizationInput(input);
  if(BOOK_ACTIONS.includes(command.type)){assertBookInput(command.type,input);if(command.type==='books.journal.post'&&input.document!==null)assertCaseReference(input.document);}
  return command;
}
function validatePrivateFile(payload,reference){
  exactCaseObject(payload,['version','type','filename','mime','data','byteLength','purpose','category','notes','savedAt']);
  if(payload.version!==1||payload.type!=='private-file'||!Number.isSafeInteger(payload.byteLength)||payload.byteLength<1||payload.byteLength>MAX_FILE_BYTES)fail();
  text(payload.filename,240,true);text(payload.notes,2000);assertCaseTime(payload.savedAt);
  if(!['bank-statement','receipt','invoice','tax-document','business-record'].includes(payload.purpose)||!['banking','sales','purchases','payroll','tax','general'].includes(payload.category)||reference.domain==='driver-receipt'&&payload.purpose!=='receipt')fail();
  const extension=payload.filename.split('.').at(-1).toLowerCase(),expected={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',csv:'text/csv'}[extension];if(!expected||payload.mime!==expected||payload.mime==='text/csv'&&payload.byteLength>2*1024*1024)fail();
  const bytes=decode64(payload.data,1,MAX_FILE_BYTES);
  try{
    if(bytes.length!==payload.byteLength)fail();
    if(payload.mime==='application/pdf'&&new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')fail();
    if(payload.mime==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255))fail();
    if(payload.mime==='image/png'&&(bytes.length<8||![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)))fail();
    if(payload.mime==='text/csv'){const contents=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(contents.includes('\0'))fail();}
  }finally{bytes.fill(0);}
}
export function validateCaseEvidence(evidence){
  exactCaseObject(evidence,['reference','payload']);assertCaseReference(evidence.reference);
  if(evidence.payload?.type==='private-file')validatePrivateFile(evidence.payload,evidence.reference);
  else if(evidence.payload?.type==='tax-return'){
    assertCaseReference(evidence.reference,{draft:true});checkedReturnDraft(evidence.payload);
  }else if(evidence.payload?.type==='client-office'){
    assertCaseReference(evidence.reference,{draft:true});assertOfficeBody(evidence.payload.body);
  }else fail();
  canonicalCaseJson(evidence);return evidence;
}
export function applyCaseTransition(before,command,{actor,at,evidence=null}={}){
  if(OFFICE_ACTIONS.includes(command?.type)||isOfficeBody(before)){if(evidence!==null)validateCaseEvidence(evidence);return applyOfficeTransition(before,command,{actor,at,evidence});}
  identifier(actor);assertCaseTime(at);assertCaseCommand(command);if(before!==null)assertCaseBody(before);
  if(command.type==='case.create'?before!==null:before===null)fail();
  if(before&&(before.history.some(event=>event.actionId===command.actionId)||Date.parse(at)<Date.parse(before.history.at(-1).at)))fail();
  const input=command.input,after=before===null?{title:input.title,year:input.year,kind:input.kind,requests:[],draft:null,history:[]}:structuredClone(before);
  if(['case.create','request.add'].includes(command.type)||BOOK_ACTIONS.includes(command.type)&&(command.type!=='books.journal.post'||input.document===null)){if(evidence!==null)fail();}
  else{validateCaseEvidence(evidence);if(!sameCaseReference(input.document,evidence.reference))fail();}
  if(command.type==='request.add'){
    if(after.requests.some(request=>request.id===input.requestId))fail();after.requests.push({id:input.requestId,title:input.title,due:input.due,notes:input.notes,review:null});
  }
  if(command.type==='document.review'){
    const request=after.requests.find(request=>request.id===input.requestId);if(!request||evidence.payload.type!=='private-file')fail();
    request.review={document:structuredClone(input.document),decision:input.decision,notes:input.notes,actor,at};
  }
  if(command.type==='draft.link'){
    if(evidence.payload.type!=='tax-return'||evidence.payload.year!==after.year||evidence.payload.kind!==after.kind)fail();after.draft=structuredClone(input.document);
  }
  if((command.type===AUTHORIZATION_ACTION||command.type==='books.journal.post'&&input.document!==null)&&evidence.payload.type!=='private-file')fail();
  if(command.type==='books.link'){
    if(evidence.payload.type!=='client-office')fail();const ledger=officeLedgers(evidence.payload.body.history).find(item=>item.id===input.ledgerId);
    if(!ledger||ledger.version!==input.ledgerVersion||ledger.from!==`${after.year}-01-01`||ledger.through!==`${after.year}-12-31`)fail();
  }
  after.history.push({actionId:command.actionId,type:command.type,input:structuredClone(input),actor,at,notes:command.type==='case.create'?'':input.notes});return assertCaseBody(after);
}
function freshness(reference,records){const record=records.get(reference.objectId);if(!record||record.deleted)return 'unavailable';return sameCaseReference(reference,{objectId:record.objectId,revision:record.revision,envelopeDigest:record.envelopeDigest,domain:record.domain})?'current':'stale';}
/** The caller verifies the private firm certificate first. This computes only
 * known source-review freshness; no projection is a filing authorization. */
export function caseSnapshot(body,records){
  assertCaseBody(body);if(!records||typeof records.get!=='function')fail();
  const requests=body.requests.map(request=>{const state=request.review?freshness(request.review.document,records):'unreviewed';return {...structuredClone(request),freshness:state,ready:state==='current'&&request.review.decision==='reviewed'};});
  const draft=body.draft?{reference:structuredClone(body.draft),freshness:freshness(body.draft,records)}:null;
  const book=replayCaseBooks(body.history,body.year),bookSources=book?.entries.filter(entry=>entry.document!==null&&!entry.reverses).map(entry=>({entryId:entry.id,reference:entry.document,active:!book.entries.some(other=>other.reverses===entry.id),freshness:freshness(entry.document,records)}))??[];
  let books=book?{...book,report:caseBookReport(book),sources:bookSources,sourcesCurrent:bookSources.every(source=>!source.active||source.freshness==='current')}:null,bookLink=null;
  const event=body.history.findLast(event=>event.type==='books.link');
  if(event){const {document,ledgerId,ledgerVersion}=event.input,office=records.get(document.objectId)?.verifiedOffice;books=office?officeSnapshot(office,records).ledgers.find(item=>item.id===ledgerId)??null:null;bookLink={reference:document,ledgerId,ledgerVersion,freshness:!books?'unavailable':books.version===ledgerVersion?'current':'stale'};}
  if(draft){const linked=body.history.findLast(event=>event.type==='draft.link');draft.booksFreshness=(linked.input.booksVersion??null)===caseBookVersion(body.history,body.year)&&(!bookLink||bookLink.freshness==='current')?'current':'stale';}
  const ready=requests.length>0&&requests.every(request=>request.ready)&&draft?.freshness==='current'&&draft.booksFreshness==='current'&&(!bookLink||bookLink.freshness==='current')&&(!books||books.sourcesCurrent);
  const signed=body.history.findLast(event=>event.type===AUTHORIZATION_ACTION);let authorization=null;
  if(signed){const source=freshness(signed.input.document,records);authorization={...structuredClone(signed.input),actor:signed.actor,at:signed.at,freshness:source==='unavailable'?'unavailable':source==='current'&&ready&&signed.input.contentVersion===caseContentVersion(body)?'current':'stale',verification:'staff-reviewed-signed-evidence',filingReady:false};}
  return {requests,draft,books,bookLink,authorization,ready,filingReady:false};
}
