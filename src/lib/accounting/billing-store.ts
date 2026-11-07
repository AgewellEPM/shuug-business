import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { billingSchemas, billingTotals, billingBalance, lineAmounts, type BillingDocument, type BillingLine } from "./billing-model";
import { journalState, type JournalState } from "./journal-store";
import { checkBook } from "./client-books";
import type { WorkspaceUser } from "../auth/identity";
import { standardAccounts, type WorkspaceAccount } from "./account-model";
import { validateEntry, type JournalEntry, type JournalLine } from "./ledger";
import { assertPeriodOpen } from "./periods";
import { assertNoInvoiceCheckout } from "../website-payments/state";
export interface BillingState extends JournalState { billing?: BillingDocument[] }
export function billingDocuments(bookId: string) { return journalState(bookId).change(s => (s as BillingState).billing ?? []); }
function must(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const debit = (accountNumber: number, debitCents: number): JournalLine => ({ accountNumber, debitCents, creditCents: 0 });
const credit = (accountNumber: number, creditCents: number): JournalLine => ({ accountNumber, debitCents: 0, creditCents });
function currentAccount(accounts: WorkspaceAccount[], number: number) { const a = accounts.find(a => a.number === number); must(a?.active, `Account ${number} is unavailable. Choose an active account.`); return a; }
export function billingAudit(db: DatabaseSync, doc: BillingDocument, actor: string, action: string) {
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(doc.id, actor, action, new Date().toISOString(), JSON.stringify(doc));
}
function linesFor(doc: BillingDocument, items: BillingLine[], accounts: WorkspaceAccount[]) {
  const ar = doc.kind === "invoice", control = currentAccount(accounts, doc.controlAccount);
  must(control.classification === (ar ? "receivable" : "payable"), "Choose the document's receivable or payable control account.");
  const lines: JournalLine[] = [];
  for (const item of items) {
    const a = currentAccount(accounts, item.accountNumber), amounts = lineAmounts(item);
    must(a.number !== control.number && (ar ? ["income", "current_liability", "other_income"].includes(a.classification) : ["expense", "cogs", "other_expense", "fixed_asset", "current_asset", "other_asset"].includes(a.classification)), "Choose an income/deposit account for an invoice or a cost/asset account for a bill.");
    if (amounts.net) lines.push((ar ? credit : debit)(a.number, amounts.net));
    if (amounts.tax) {
      const tax = currentAccount(accounts, item.taxAccountNumber);
      must(ar ? tax.classification === "current_liability" : ["current_asset", "expense", "cogs", "other_expense"].includes(tax.classification), "Choose an appropriate tax liability, recoverable tax or cost account.");
      lines.push((ar ? credit : debit)(tax.number, amounts.tax));
    }
  }
  const total = billingTotals(items).total;
  must(total > 0, "The total must be greater than zero.");
  lines.push((ar ? debit : credit)(control.number, total));
  return lines;
}
export function postBillingEntry(s: BillingState, db: DatabaseSync, bookId: string, actor: string, date: string, memo: string, lines: JournalLine[]) {
  must(date <= new Date().toISOString().slice(0,10), "A posted accounting event cannot be in the future.");
  const entry: JournalEntry = { id: `billing:${randomUUID()}`, source: "native-billing", date, memo, lines };
  const error = validateEntry(entry, s.accounts ?? standardAccounts()); if (error) throw new Error(error);
  assertPeriodOpen(db, date, bookId);
  s.entries.push({ entry, actor, recordedAt: new Date().toISOString(), reversesId: null, reason: null, imported: false });
  s.audit.push({ id: randomUUID(), action: "billing.posting", entryId: entry.id, actor, at: new Date().toISOString(), relatedId: null });
  return entry.id;
}
export function applyBillingSettlement(s: BillingState, db: DatabaseSync, bookId: string, doc: BillingDocument,
  input: z.infer<typeof billingSchemas["billing.settle"]>, actor: string, providerPaymentId?: string) {
  must(doc.status === "posted", "Post the invoice or bill before recording a payment.");
  must(input.date >= doc.date && input.date >= [...doc.credits, ...doc.settlements].reduce((d,e) => e.date > d ? e.date : d, doc.date), "Payment date must be on or after the latest document event.");
  const balance = billingBalance(doc), refund = input.direction === "refund";
  must(input.amountCents <= (refund ? -balance.outstanding : balance.outstanding), refund ? "Record a credit first. The refund cannot exceed the credit balance owed." : "Payment exceeds the remaining balance.");
  const a = currentAccount(s.accounts ?? standardAccounts(), input.accountNumber);
  must(providerPaymentId ? a.number === 1010 : a.classification === "bank" || (doc.kind === "bill" && a.classification === "credit_card"), "Choose the actual bank, cash or bill-payment card account.");
  must(!(s.billing ?? []).some(d => d.settlements.some(p => p.accountNumber === input.accountNumber && p.reference.toLowerCase() === input.reference.toLowerCase())), "This payment reference is already recorded in this book.");
  const incoming = (doc.kind === "invoice") !== refund;
  const journalId = postBillingEntry(s, db, bookId, actor, input.date, `${refund ? "Refund" : "Payment"} · ${doc.number} · ${input.reference}`,
    [debit(incoming ? a.number : doc.controlAccount, input.amountCents), credit(incoming ? doc.controlAccount : a.number, input.amountCents)]);
  const id = randomUUID();
  doc.settlements.push({ id, date: input.date, direction: input.direction, amountCents: input.amountCents, accountNumber: input.accountNumber,
    method: input.method, reference: input.reference, evidence: input.evidence, journalId, actor, at: new Date().toISOString(), ...(providerPaymentId ? { providerPaymentId } : {}) });
  doc.revision++; doc.updatedAt = new Date().toISOString(); billingAudit(db, doc, actor, "billing.settle");
  return id;
}
export function executeBillingCommand(bookId: string, raw: unknown, user: WorkspaceUser) {
  const cmd = z.object({ requestId: z.uuid(), action: z.enum(Object.keys(billingSchemas) as [keyof typeof billingSchemas, ...(keyof typeof billingSchemas)[]]), input: z.record(z.string(), z.unknown()) }).strict().parse(raw);
  const input = billingSchemas[cmd.action].parse(cmd.input), actor = `${user.name} (${user.id})`;
  return journalState(bookId).change((base, db) => {
    checkBook(db, bookId, user, true);
    const s = base as BillingState, docs = s.billing ??= [], accounts = s.accounts ?? standardAccounts();
    const request = JSON.stringify({ bookId, action: cmd.action, input, actor });
    const prior = db.prepare("SELECT request,result FROM commands WHERE id=?").get(cmd.requestId) as { request: string; result: string } | undefined;
    if (prior) { must(prior.request === request, "Request ID belongs to different billing details."); return JSON.parse(prior.result) as { id: string }; }
    let doc = input.id ? docs.find(d => d.id === input.id) : undefined;
    if (input.id) must(doc, "Document unavailable in this book.");
    must((doc?.revision ?? 0) === input.revision, "Document changed. Reload before saving.");
    if (doc) assertNoInvoiceCheckout(db, doc.id);
    if (cmd.action === "billing.save") {
      const v = billingSchemas["billing.save"].parse(input), { id, revision, reviewed, ...fields } = v; void reviewed;
      must(!doc || doc.status === "draft", "Posted documents retain their history. Use a credit or void, then create the replacement.");
      must(!doc || doc.kind === fields.kind, "A document cannot change between invoice and vendor bill.");
      must(fields.due >= fields.date, "Due date cannot precede the document date.");
      must(!docs.some(d => d.id !== id && d.kind === fields.kind && d.number.toLowerCase() === fields.number.toLowerCase() && (d.kind === "invoice" || d.party.name.toLowerCase() === fields.party.name.toLowerCase())), "This invoice number or vendor bill reference already exists.");
      billingTotals(fields.lines);
      const now = new Date().toISOString();
      doc = { ...fields, id: id ?? randomUUID(), revision: revision + 1, status: "draft", createdAt: doc?.createdAt ?? now, updatedAt: now, journalId: null, settlements: [], credits: [] };
      s.billing = [...docs.filter(d => d.id !== doc!.id), doc];
    } else {
      must(doc, "Choose an existing document.");
      if (cmd.action === "billing.post") {
        must(doc.status === "draft", "This document has already been posted or voided.");
        doc.journalId = postBillingEntry(s, db, bookId, actor, doc.date, `${doc.heading} ${doc.number} · ${doc.party.name}`, linesFor(doc, doc.lines, accounts)); doc.status = "posted";
      } else if (cmd.action === "billing.void") {
        const v = billingSchemas["billing.void"].parse(input);
        must(doc.status !== "void", "This document is already void.");
        must(!doc.settlements.length && !doc.credits.length, "This document has payment or credit history. Use a correcting credit and refund instead.");
        must(v.date >= doc.date, "The void date cannot precede the original document.");
        if (doc.status === "posted") {
          const original = s.entries.find(e => e.entry.id === doc!.journalId); must(original, "Original posting missing. Restore its accounting history.");
          postBillingEntry(s, db, bookId, actor, v.date, `Void ${doc.number} · ${v.reason}`, original.entry.lines.map(l => ({ accountNumber: l.accountNumber, debitCents: l.creditCents, creditCents: l.debitCents })));
        }
        doc.status = "void";
      } else if (cmd.action === "billing.credit") {
        const v = billingSchemas["billing.credit"].parse(input), balance = billingBalance(doc), total = billingTotals(v.lines).total;
        must(doc.status === "posted", "Only posted documents can receive credits.");
        must(v.date >= [...doc.credits, ...doc.settlements].reduce((d,e) => e.date > d ? e.date : d, doc.date), "Credit date must be on or after the latest document event.");
        must(total <= balance.total - balance.credited, "Credit exceeds the remaining uncredited amount.");
        const lines = linesFor(doc, v.lines, accounts).map(l => ({ accountNumber: l.accountNumber, debitCents: l.creditCents, creditCents: l.debitCents }));
        const journalId = postBillingEntry(s, db, bookId, actor, v.date, `Credit ${doc.number} · ${v.reason}`, lines);
        doc.credits.push({ id: randomUUID(), date: v.date, reason: v.reason, lines: v.lines, amountCents: total, journalId, actor, at: new Date().toISOString() });
      } else {
        applyBillingSettlement(s, db, bookId, doc, billingSchemas["billing.settle"].parse(input), actor);
        // Settlement updates revision and audit itself.
        const result = { id: doc.id }; db.prepare("INSERT INTO commands VALUES(?,?,?)").run(cmd.requestId, request, JSON.stringify(result)); return result;
      }
      doc.revision++; doc.updatedAt = new Date().toISOString();
    }
    billingAudit(db, doc, actor, cmd.action);
    const result = { id: doc.id }; db.prepare("INSERT INTO commands VALUES(?,?,?)").run(cmd.requestId, request, JSON.stringify(result)); return result;
  });
}
