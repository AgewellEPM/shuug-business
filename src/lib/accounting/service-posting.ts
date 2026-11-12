import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import type { BusinessRecord } from "../workspace/model";
import { numberField, textField } from "../workspace/model";
import { validateEntry, type JournalEntry, type JournalLine } from "./ledger";
import { assertPeriodOpen } from "./periods";
import { markAccountUsed, transactionAccounts } from "./account-usage";
import { z } from "zod";
import { creditedTax, reviewedRepairTax, transactionRecords, type ServiceTaxSnapshot } from "../shop-invoicing/tax-snapshot";
interface Capture { entry: JournalEntry; recordId: string; actor: string; at: string; taxSnapshot?: ServiceTaxSnapshot }
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
  let taxSnapshot:ServiceTaxSnapshot|undefined;
  const amount=numberField(record,"amount");
  if(record.kind==="invoice"&&stage==="issued") {
    date=textField(record,"issuedOn")||date;
    const deposit=textField(record,"method")==="deposit",applied=Number(record.computed?.depositApplied??0);
    if(!Number.isSafeInteger(applied)||applied<0)throw new Error("Invalid invoice deposit allocation.");
    taxSnapshot=reviewedRepairTax(record,transactionRecords(db))??undefined;
    if(taxSnapshot)record.computed={...record.computed,reviewedTaxSnapshot:taxSnapshot};
    lines=[dr(1200,amount),...(applied?[dr(2100,applied)]:[]),
      ...(taxSnapshot?[cr(4000,taxSnapshot.subtotal),cr(2200,taxSnapshot.tax)]:[cr(deposit?2100:4000,amount+applied)])];
  }else if(record.kind==="invoice"&&stage==="void") {
    const original=db.prepare("SELECT body FROM documents WHERE id=? AND kind='service-journal'").get(`service-journal:${record.id}:issued`) as {body:string}|undefined;
    if(!original)return;
    lines=(JSON.parse(original.body) as Capture).entry.lines.map(l=>({accountNumber:l.accountNumber,debitCents:l.creditCents,creditCents:l.debitCents}));
  }else {
    date=textField(record,"paidOn");const direction=textField(record,"direction");
    const cash=record.computed?.provider==="stripe"?1010:numberField(record,"accountNumber")||1000;
    const invoice=db.prepare("SELECT body FROM records WHERE id=? AND kind='invoice'").get(textField(record,"invoice")) as {body:string}|undefined;
    if(!invoice)throw new Error("The source invoice is unavailable for accounting.");
    const source=JSON.parse(invoice.body) as BusinessRecord,deposit=textField(source,"method")==="deposit";
    if(textField(source,"issuedOn")&&date<textField(source,"issuedOn"))throw new Error("A payment or credit cannot precede the invoice accounting date.");
    if(direction==="receipt")lines=[dr(cash,amount),cr(1200,amount)];
    else if(direction==="refund")lines=[dr(1200,amount),cr(cash,amount)];
    else {
      if(deposit&&transactionRecords(db).some(r=>r.kind==="invoice"&&r.fields.job===source.fields.job&&r.status==="issued"&&Number(r.computed?.depositApplied)>0))throw new Error("This deposit was applied to a final invoice. Its credit requires an accountant-reviewed correction.");
      const original=db.prepare("SELECT body FROM documents WHERE id=? AND kind='service-journal'").get(`service-journal:${source.id}:issued`) as {body:string}|undefined;
      const snapshot=original?(JSON.parse(original.body) as Capture).taxSnapshot:undefined;
      if(snapshot) {
        const prior=transactionRecords(db).filter(r=>r.kind==="service_payment"&&r.id!==record.id&&r.fields.invoice===source.id&&["confirmed","reconciled"].includes(r.status)&&r.fields.direction==="credit").reduce((n,r)=>n+numberField(r,"amount"),0);
        const tax=creditedTax(snapshot,prior,amount);lines=[dr(4000,amount-tax),dr(2200,tax),cr(1200,amount)];
      }else lines=[dr(deposit?2100:4000,amount),cr(1200,amount)];
    }
    if(direction!=="credit") {
      const account=transactionAccounts(db).find(a=>a.number===cash);
      if(!account?.active || (record.computed?.provider!=="stripe"&&account.classification!=="bank"))throw new Error("Choose the active bank account that received or refunded the payment.");
    }
  }
  lines=lines.filter(l=>l.debitCents||l.creditCents);
  if(!lines.length)return;
  z.iso.date().parse(date);
  if(date>new Date().toISOString().slice(0,10))throw new Error("A posted accounting event cannot be in the future.");
  const entry:JournalEntry={id,source:id,date,memo:`${record.title} · ${stage}`,lines};
  const accounts=transactionAccounts(db),error=validateEntry(entry,accounts);if(error)throw new Error(error);
  if(lines.some(l=>!accounts.find(a=>a.number===l.accountNumber)?.active))throw new Error("A required service posting account is inactive. Review the chart of accounts before posting.");
  assertPeriodOpen(db,date);
  const captured:Capture={entry,recordId:record.id,actor,at:new Date().toISOString(),...(taxSnapshot?{taxSnapshot}:{})};
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
