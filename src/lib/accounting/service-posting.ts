import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import type { BusinessRecord } from "../workspace/model";
import { numberField, textField } from "../workspace/model";
import { validateEntry, type JournalEntry, type JournalLine } from "./ledger";
import { assertPeriodOpen } from "./periods";
import { markAccountUsed, transactionAccounts } from "./account-usage";
interface Capture { entry: JournalEntry; recordId: string; actor: string; at: string }
const dr=(accountNumber:number,debitCents:number):JournalLine=>({accountNumber,debitCents,creditCents:0});
const cr=(accountNumber:number,creditCents:number):JournalLine=>({accountNumber,debitCents:0,creditCents});
/** Runs inside the workflow's transaction, so a failed posting cannot issue an invoice. */
export function postServiceRecord(db:DatabaseSync, record:BusinessRecord, actor:string) {
  if(!["invoice","service_payment"].includes(record.kind)||record.computed?.live===false)return;
  const stage=record.kind==="invoice"?record.status:["confirmed","reconciled"].includes(record.status)?"confirmed":"draft";
  if(!["issued","void","confirmed"].includes(stage))return;
  const id=`service-journal:${record.id}:${stage}`;
  if(db.prepare("SELECT id FROM documents WHERE id=? AND kind='service-journal'").get(id))return;
  // Foreign amounts never enter USD books without a reviewed conversion.
  if(record.currency!=="USD")return;
  let lines:JournalLine[]=[],date=record.updatedAt.slice(0,10);
  const amount=numberField(record,"amount");
  if(record.kind==="invoice"&&stage==="issued") {
    date=textField(record,"issuedOn")||date;
    const deposit=textField(record,"method")==="deposit",applied=Number(record.computed?.depositApplied??0);
    if(!Number.isSafeInteger(applied)||applied<0)throw new Error("Invalid invoice deposit allocation.");
    lines=[dr(1200,amount),...(applied?[dr(2100,applied)]:[]),cr(deposit?2100:4000,amount+applied)];
  }else if(record.kind==="invoice"&&stage==="void") {
    const original=db.prepare("SELECT body FROM documents WHERE id=? AND kind='service-journal'").get(`service-journal:${record.id}:issued`) as {body:string}|undefined;
    if(!original)return;
    lines=(JSON.parse(original.body) as Capture).entry.lines.map(l=>({accountNumber:l.accountNumber,debitCents:l.creditCents,creditCents:l.debitCents}));
  }else {
    date=textField(record,"paidOn");const direction=textField(record,"direction");
    const cash=record.computed?.provider==="stripe"?1010:numberField(record,"accountNumber")||1000;
    const invoice=db.prepare("SELECT body FROM records WHERE id=? AND kind='invoice'").get(textField(record,"invoice")) as {body:string}|undefined;
    if(!invoice)throw new Error("The source invoice is unavailable for accounting.");
    const deposit=textField(JSON.parse(invoice.body),"method")==="deposit";
    if(direction==="receipt")lines=[dr(cash,amount),cr(1200,amount)];
    else if(direction==="refund")lines=[dr(1200,amount),cr(cash,amount)];
    else lines=[dr(deposit?2100:4000,amount),cr(1200,amount)];
    if(direction!=="credit") {
      const account=transactionAccounts(db).find(a=>a.number===cash);
      if(!account?.active || (record.computed?.provider!=="stripe"&&account.classification!=="bank"))throw new Error("Choose the active bank account that received or refunded the payment.");
    }
  }
  lines=lines.filter(l=>l.debitCents||l.creditCents);
  if(!lines.length)return;
  const entry:JournalEntry={id,source:id,date,memo:`${record.title} · ${stage}`,lines};
  const error=validateEntry(entry,transactionAccounts(db));if(error)throw new Error(error);
  assertPeriodOpen(db,date);
  const captured:Capture={entry,recordId:record.id,actor,at:new Date().toISOString()};
  db.prepare("INSERT INTO documents VALUES(?,'service-journal',?)").run(id,JSON.stringify(captured));
  for(const line of lines)markAccountUsed(db,line.accountNumber,id);
}
export function serviceLedgerData() {
  return workspaceDatabase(db=>{
    const captures=(db.prepare("SELECT body FROM documents WHERE kind='service-journal'").all() as {body:string}[]).map(r=>JSON.parse(r.body) as Capture);
    const ids=new Set(captures.map(c=>c.recordId));
    const records=(db.prepare("SELECT body FROM records WHERE kind IN ('invoice','service_payment')").all() as {body:string}[]).map(r=>JSON.parse(r.body) as BusinessRecord);
    return {entries:captures.map(c=>c.entry),issues:records.filter(r=>!ids.has(r.id)&&r.computed?.live!==false&&Number(r.fields.amount)>0&&["issued","confirmed","reconciled"].includes(r.status)).map(r=>`${r.title}: ${r.currency!=="USD"?"foreign-currency conversion":"historical posting"} needs review before it can enter the office ledger.`)};
  });
}
