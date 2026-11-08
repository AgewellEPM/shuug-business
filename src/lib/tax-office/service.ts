import { checkBook } from "../accounting/client-books";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceUser } from "../auth/identity";
import type { ModuleRecord } from "../sdk/types";
import { listRecords, changeModuleRecords } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { validateValues } from "../features/model";
import { workspaceDatabase } from "../workspace/database";
import { getBranding } from "../branding/store";
import { assertTaxClientAccess, taxModuleRows } from "./access";
import { taxCommand, taxSchemas, type TaxWorkflow } from "./model";
import type { TaxDocument } from "../customer-access/tax-documents";
import { financialReports } from "../accounting/reports";
import type { JournalEntry } from "../accounting/ledger";
import { standardAccounts } from "../accounting/account-model";
function must(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
function prepare() { listRecords("tax-engagements"); if(getBranding().industrySetup?.industryId!=="tax-firm")throw new Error("Enable the Tax & accounting firm workspace in Setup first."); }
function workflow(db:DatabaseSync,engagement:ModuleRecord):TaxWorkflow {
  const row=db.prepare("SELECT body FROM documents WHERE id=? AND kind='tax-workflow'").get(`tax-workflow:${engagement.id}`) as {body:string}|undefined;
  if(!row)return {id:engagement.id,revision:0,clientId:String(engagement.values.client_id),stage:"documents",waived:[],approval:null,authorizationBindings:[],submissions:[],history:[]};
  const flow=JSON.parse(row.body) as TaxWorkflow;
  if(!flow.authorizationBindings){
    // Preserve authorizations from earlier stored approvals, including an approval
    // cleared by a later work-stage change. The audit is part of the same database.
    const approvals=(db.prepare("SELECT snapshot FROM audit WHERE record_id=? AND action='workflow.approve' ORDER BY sequence").all(engagement.id) as {snapshot:string}[])
      .map(row=>(JSON.parse(row.snapshot) as {flow?:TaxWorkflow}).flow?.approval);
    flow.authorizationBindings=[];
    for(const approval of [...approvals,flow.approval])if(approval&&!flow.authorizationBindings.some(binding=>binding.authorizationDocumentId===approval.authorizationDocumentId&&binding.digest===approval.digest)){
      const {authorizationDocumentId,returnDocumentId,digest,reviewer,at}=approval;
      flow.authorizationBindings.push({authorizationDocumentId,authorizationDigest:authorizationDigest(db,authorizationDocumentId),returnDocumentId,digest,reviewer,at});
    }
  }
  for(const binding of flow.authorizationBindings)if(!binding.authorizationDigest)binding.authorizationDigest=authorizationDigest(db,binding.authorizationDocumentId);
  return flow;
}
function authorizationDigest(db:DatabaseSync,id:string) {
  const row=db.prepare("SELECT digest FROM tax_client_documents WHERE id=?").get(id) as {digest:string}|undefined;
  must(row,"Previously approved authorization metadata is unavailable. Restore its retained document history before continuing.");return row.digest;
}
function assertAccountant(db:DatabaseSync,id:string) {
  if(id!=="workspace-owner")must(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='employee_accounts'").get()&&db.prepare("SELECT id FROM employee_accounts WHERE id=? AND status='active'").get(id),"Choose an active accountant account.");
}
function source(db:DatabaseSync,engagement:ModuleRecord,user:WorkspaceUser,edit=false) {
  const clientId=String(engagement.values.client_id),client=assertTaxClientAccess(db,clientId,user,edit);
  const requests=taxModuleRows(db,"tax-document-requests").filter(r=>!r.archived&&r.values.engagement_id===engagement.id&&r.values.client_id===clientId);
  const files=db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='tax_client_documents'").get()
    ?db.prepare("SELECT * FROM tax_client_documents WHERE clientId=? AND engagementId=? ORDER BY createdAt,id").all(clientId,engagement.id) as TaxDocument[]:[];
  const bookRow=db.prepare("SELECT body FROM documents WHERE kind='client-book' AND json_extract(body,'$.clientId')=?").get(clientId) as {body:string}|undefined;
  const book=bookRow?JSON.parse(bookRow.body) as {id:string;name:string}:null;
  const ledger=book?db.prepare("SELECT body FROM documents WHERE id=? AND kind='state'").get(`state:client-journal:${book.id}`) as {body:string}|undefined:null;
  const journal=ledger?JSON.parse(ledger.body):null;
  const books=journal?{bookId:book!.id,name:book!.name,reports:financialReports(journal.entries.map((r:{entry:JournalEntry})=>r.entry),journal.accounts??standardAccounts(),{from:`${engagement.values.tax_year}-01-01`,through:`${engagement.values.tax_year}-12-31`})}:null;
  return {client,requests,files,books};
}
function snapshot(engagement:ModuleRecord,s:ReturnType<typeof source>,flow:TaxWorkflow) {
  const requests=s.requests.filter(r=>r.values.purpose!=="Filing acknowledgment").sort((a,b)=>a.id.localeCompare(b.id));
  const snapshot={engagement:{id:engagement.id,name:engagement.values.name,clientId:flow.clientId,taxYear:engagement.values.tax_year},requests:requests.map(r=>({id:r.id,name:r.values.name,purpose:r.values.purpose||"Client records",updatedAt:r.updatedAt})),documents:s.files.filter(f=>requests.some(r=>r.id===f.requestId)).map(f=>({id:f.id,requestId:f.requestId,name:f.name,size:f.size,digest:f.digest,status:f.status,reviewedAt:f.reviewedAt,reviewedBy:f.reviewedBy})).sort((a,b)=>a.id.localeCompare(b.id)),waivers:flow.waived,books:s.books};
  return {...snapshot,digest:hash(snapshot)};
}
function readiness(s:ReturnType<typeof source>,flow:TaxWorkflow) {
  return s.requests.filter(r=>(r.values.purpose||"Client records")==="Client records").map(request=>{
    const files=s.files.filter(f=>f.requestId===request.id),waiver=flow.waived.find(w=>w.requestId===request.id);
    return {id:request.id,name:String(request.values.name),ready:!!waiver||(files.some(f=>f.status==="reviewed")&&!files.some(f=>f.status==="received")),reason:waiver?`Not applicable: ${waiver.reason}`:!files.length?"Awaiting upload":files.some(f=>f.status==="received")?"Staff review required":!files.some(f=>f.status==="reviewed")?"Replacement needed":"Reviewed"};
  });
}
export function taxOfficeEngagement(id:string,user:WorkspaceUser,edit=false) {
  prepare();return workspaceDatabase(db=>{const engagement=taxModuleRows(db,"tax-engagements").find(r=>r.id===id&&!r.archived);must(engagement,"Engagement unavailable.");return {engagement,...source(db,engagement,user,edit)};});
}
export function taxOfficeView(user:WorkspaceUser) {
  prepare();return workspaceDatabase(db=>taxModuleRows(db,"tax-engagements").filter(r=>!r.archived).flatMap(engagement=>{
    try {const s=source(db,engagement,user),flow=workflow(db,engagement),current=snapshot(engagement,s,flow);return[{editable:(()=>{try{assertTaxClientAccess(db,String(engagement.values.client_id),user,true);return true;}catch{return false;}})(),engagement,client:s.client,requests:s.requests.map(r=>({...r,files:s.files.filter(f=>f.requestId===r.id)})),workflow:flow,readiness:readiness(s,flow),approvalCurrent:flow.approval?.digest===current.digest,book:s.books?{id:s.books.bookId,name:s.books.name}:null}];}
    catch{
      if(!user.isOwner)return[];
      // A denied encrypted-client boundary also protects legacy names and history.
      // Keep only an opaque locator so the owner can resolve access separately.
      const unavailable:ModuleRecord={id:engagement.id,values:{name:"Tax work unavailable"},archived:false,createdAt:"",updatedAt:""};
      const hidden:TaxWorkflow={id:engagement.id,revision:0,clientId:"",stage:"documents",waived:[],approval:null,authorizationBindings:[],submissions:[],history:[]};
      return[{editable:false,engagement:unavailable,client:{id:"",title:"Protected or unavailable client"},requests:[],workflow:hidden,readiness:[],approvalCurrent:false,book:null,error:"Review this client's secure access and workspace settings before opening the case."}];
    }
  }));
}
export function taxPackageManifest(id:string,user:WorkspaceUser) {
  prepare();return workspaceDatabase(db=>{
    const row=taxModuleRows(db,"tax-engagements").find(r=>r.id===id&&!r.archived);must(row,"Engagement unavailable.");
    const s=source(db,row,user),flow=workflow(db,row),current=snapshot(row,s,flow);
    must(flow.approval&&flow.approval.digest===current.digest,"The package changed or has not been approved. Complete a fresh review before exporting.");
    return {format:"shuug-reviewed-tax-package-v1",...current,approval:flow.approval,filingCapability:"Reviewed handoff package only. Not an IRS transmission or acceptance receipt."};
  });
}
export function executeTaxOfficeCommand(raw:unknown,user:WorkspaceUser) {
  const cmd=taxCommand.parse(raw),v=taxSchemas[cmd.action].parse(cmd.input);prepare();
  return changeModuleRecords("tax-engagements",(rows,db)=>{
    const request=JSON.stringify({action:cmd.action,input:v,actor:user.id});
    const receipt=db.prepare("SELECT request,result FROM commands WHERE id=?").get(cmd.requestId) as {request:string;result:string}|undefined;
    if(receipt){must(receipt.request===request,"Request ID belongs to another tax-office action.");const previous=JSON.parse(receipt.result);const existing=rows.find(r=>r.id===previous.id);must(existing,"Engagement unavailable.");source(db,existing,user,true);return previous as {id:string};}
    let engagement:ModuleRecord|undefined,flow:TaxWorkflow;
    const at=new Date().toISOString();
    if(cmd.action==="engagement.create") {
      const input=taxSchemas["engagement.create"].parse(v);must(user.isOwner,"The owner creates tax engagements and assigns clients.");assertTaxClientAccess(db,input.clientId,user,true);
      assertAccountant(db,input.accountantId);
      const values=validateValues(moduleById("tax-engagements")!.fields,{name:input.name,client_id:input.clientId,tax_year:input.taxYear,stage:"Awaiting documents",accountant:input.accountantId,due:input.due,client_visible:input.shareWithClient});
      engagement={id:randomUUID(),values,archived:false,createdAt:at,updatedAt:at};rows.push(engagement);flow=workflow(db,engagement);flow.assignedAccountId=input.accountantId;
    } else {
      const input=v as {id:string;revision:number};engagement=rows.find(r=>r.id===input.id&&!r.archived);must(engagement,"Engagement unavailable.");
      flow=workflow(db,engagement);must(flow.clientId===engagement.values.client_id,"The client reference changed. Resolve it before continuing.");
      const s=source(db,engagement,user,true);must(flow.revision===input.revision,"Tax work changed. Reload before saving.");
      if(cmd.action==="engagement.assign") {
        const input=taxSchemas["engagement.assign"].parse(v);must(user.isOwner,"Only the owner can change the assigned accountant.");assertAccountant(db,input.accountantId);
        flow.assignedAccountId=input.accountantId;engagement.values.accountant=input.accountantId;flow.approval=null;flow.stage="documents";
      } else if(cmd.action==="request.create") {
        const input=taxSchemas["request.create"].parse(v);
        changeModuleRecords("tax-document-requests",records=>{records.push({id:randomUUID(),values:validateValues(moduleById("tax-document-requests")!.fields,{name:input.name,engagement_id:engagement!.id,client_id:flow.clientId,status:"Requested",purpose:input.purpose,due:input.due,client_visible:input.shareWithClient}),archived:false,createdAt:at,updatedAt:at});});
        if(input.purpose!=="Filing acknowledgment"){flow.approval=null;flow.stage="documents";}
      } else if(cmd.action==="request.waive") {
        const input=taxSchemas["request.waive"].parse(v),r=s.requests.find(r=>r.id===input.requestId);must(r&&(r.values.purpose||"Client records")==="Client records","Only a linked source-record request can be waived.");
        flow.waived=[...flow.waived.filter(w=>w.requestId!==r.id),{requestId:r.id,reason:input.reason,actor:user.id,at}];flow.approval=null;flow.stage="documents";
      } else if(cmd.action==="workflow.stage") {
        const input=taxSchemas["workflow.stage"].parse(v);if(input.stage==="review")must(readiness(s,flow).every(r=>r.ready),"Resolve missing, unreviewed and replacement documents before accountant review.");
        flow.stage=input.stage;flow.approval=null;
      } else if(cmd.action==="workflow.approve") {
        const input=taxSchemas["workflow.approve"].parse(v);if(s.books)checkBook(db,s.books.bookId,user);must(flow.stage==="review","Move the engagement to accountant review first.");must(readiness(s,flow).every(r=>r.ready),"Resolve outstanding document requests before approval.");
        const match=(id:string,purpose:string)=>s.files.find(f=>f.id===id&&f.status==="reviewed"&&s.requests.some(r=>r.id===f.requestId&&r.values.purpose===purpose));
        must(match(input.returnDocumentId,"Prepared return"),"Select a staff-reviewed prepared return for this engagement.");const authorization=match(input.authorizationDocumentId,"Client authorization");must(authorization,"Select staff-reviewed client authorization evidence for this engagement.");
        const current=snapshot(engagement,s,flow),bindings=flow.authorizationBindings.filter(binding=>binding.authorizationDocumentId===input.authorizationDocumentId||binding.authorizationDigest===authorization.digest);
        must(bindings.every(binding=>binding.digest===current.digest&&binding.returnDocumentId===input.returnDocumentId),"This authorization belongs to an earlier return or package. Obtain and review new client authorization evidence for the changed package.");
        if(!bindings.length)flow.authorizationBindings.push({authorizationDocumentId:input.authorizationDocumentId,authorizationDigest:authorization.digest,returnDocumentId:input.returnDocumentId,digest:current.digest,reviewer:user.id,at});
        flow.approval={digest:current.digest,returnDocumentId:input.returnDocumentId,authorizationDocumentId:input.authorizationDocumentId,reviewer:user.id,at,notes:input.notes};flow.stage="approved";
      } else {
        const input=taxSchemas["submission.record"].parse(v),current=snapshot(engagement,s,flow);
        must(flow.approval?.digest===current.digest,"The approved package changed. Complete a fresh review before recording a submission.");
        if(input.outcome==="sent"){
          must(!input.attemptId,"A new submission creates its own attempt reference.");
          must(!flow.submissions.some(s=>s.outcome==="sent"&&s.channel===input.channel&&s.reference===input.reference),"This external submission channel and reference are already recorded.");
        }else{
          const attempt=flow.submissions.find(s=>s.id===input.attemptId&&s.outcome==="sent");
          must(attempt&&attempt.digest===current.digest&&attempt.channel===input.channel&&attempt.reference===input.reference,"Choose the sent submission attempt for this exact package, channel and reference.");
          must(!flow.submissions.some(s=>s.outcome!=="sent"&&(s.attemptId===attempt.id||(!s.attemptId&&s.digest===attempt.digest&&s.channel===attempt.channel&&s.reference===attempt.reference))),"This submission attempt already has an acceptance or rejection. Preserve its outcome and record a new submission attempt for a correction.");
        }
        const evidence=s.files.find(f=>f.id===input.evidenceDocumentId&&f.status==="reviewed"&&s.requests.some(r=>r.id===f.requestId&&r.values.purpose==="Filing acknowledgment"));must(evidence,"Upload and review the actual external submission or acknowledgment evidence first.");
        flow.submissions.push({id:randomUUID(),...(input.attemptId?{attemptId:input.attemptId}:{}),digest:current.digest,channel:input.channel,reference:input.reference,evidenceDocumentId:evidence.id,outcome:input.outcome,actor:user.id,at,notes:input.notes,verification:"staff_recorded_external_evidence"});flow.stage="external_submission";
      }
    }
    flow.revision++;const notes="notes" in v?String(v.notes):"reason" in v?String(v.reason):cmd.action;
    flow.history.push({action:cmd.action,actor:user.id,at,notes});
    const stages={documents:"Awaiting documents",preparation:"Preparation",review:"Accountant review",approved:"Client review",external_submission:"External filing"};
    engagement.values.stage=stages[flow.stage];engagement.updatedAt=at;
    db.prepare("INSERT INTO documents VALUES(?,'tax-workflow',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(`tax-workflow:${engagement.id}`,JSON.stringify(flow));
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(engagement.id,user.id,cmd.action,at,JSON.stringify({engagement,flow}));
    const result={id:engagement.id};db.prepare("INSERT INTO commands VALUES(?,?,?)").run(cmd.requestId,request,JSON.stringify(result));return result;
  });
}
