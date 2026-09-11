/** Durable receipt/returned-payment history, with one-time fail-closed legacy import. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { persistentState } from "../workspace/state";
import { settleInvoice, type Payment, type CollectionState, type Invoice } from "./collections";
import { receivableCommandInput, receivableSchemas, receiptInput, returnInput, followupInput, reminderInput } from "./receivable-model";
import type { JournalEntry } from "../accounting/ledger";
import { validateEntry } from "../accounting/ledger";
interface ReceiptAudit { id: string; actor: string; at: string; action: string; recordId: string; snapshot: unknown }
interface ArData { journals: JournalEntry[]; payments: Payment[]; collections: Record<string, CollectionState>; commands: Record<string, { hash: string; id: string }>; audit: ReceiptAudit[] }
const legacyPayment = z.object({ id: z.string().min(1).max(150), invoiceId: z.string().min(1).max(150), amountCents: z.number().int().min(1).max(99_999_999_999), method: z.enum(["cash", "check", "card", "link", "other"]), receivedAtISO: z.iso.date(), feeCents: z.number().int().min(0).max(99_999_999_999), refunded: z.boolean() }).strict();
const collection = z.object({ invoiceId: z.string().min(1).max(150), promisedDate: z.iso.date().nullable().optional(), reminders: z.number().int().nonnegative().optional(), escalatedTo: z.string().nullable().optional(), note: z.string().optional() }).strict();
const state = persistentState<ArData>("receivables", () => {
  const result: ArData = { journals: [], payments: [], collections: {}, commands: {}, audit: [] };
  let raw: unknown; try { raw = JSON.parse(readFileSync(path.join(dataDirectory(), "ar.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return result; throw new Error("Existing ar.json could not be read. Restore or repair it before continuing; the original file has not been replaced."); }
  const data = z.object({ payments: z.array(legacyPayment), collections: z.record(z.string(), collection) }).strict().safeParse(raw);
  if (!data.success || new Set(data.data.payments.map(p => p.id)).size !== data.data.payments.length || Object.entries(data.data.collections).some(([key, value]) => key !== value.invoiceId)) throw new Error("Existing ar.json contains invalid or duplicate receipts. Restore or repair it before continuing; the original file has not been replaced.");
  result.payments = data.data.payments.map(p => ({ ...p, imported: true, actor: "Legacy import; original author unavailable" }));
  result.journals = receiptJournalEntries(result.payments).entries;
  result.collections = Object.fromEntries(Object.entries(data.data.collections).map(([id, c]) => [id, { ...c, revision: 1 }]));
  result.audit.push({ id: randomUUID(), actor: "System migration", at: new Date().toISOString(), action: "receivables.import", recordId: "legacy", snapshot: { receiptCount: result.payments.length, collectionCount: Object.keys(result.collections).length } });
  return result;
});
export function receivableData() { return state.change(s => ({ payments: s.payments, collections: s.collections, audit: s.audit })); }
export function listAllPayments(): Payment[] { return state.change(s => s.payments); }
export function allCollectionStates(): Record<string, CollectionState> { return state.change(s => s.collections); }
/** Invoice data comes from the server's order store, never the command payload. */
export function applyReceivableCommand(raw: unknown, actor: string, invoices: (Invoice & { issuedOn: string })[], today = new Date().toISOString().slice(0, 10)) {
  const command = receivableCommandInput.parse(raw), input = receivableSchemas[command.action].parse(command.input);
  const hash = createHash("sha256").update(JSON.stringify({ action: command.action, input, actor })).digest("hex");
  return state.change(s => {
    const prior = s.commands[command.requestId]; if (prior) { if (prior.hash !== hash) throw new Error("This request ID belongs to another receivable action or author."); return { id: prior.id, kind: "receivable" }; }
    let id: string, snapshot: unknown, changedPayment: Payment | null = null;
    const at = new Date().toISOString();
    const invoice = (invoiceId: string) => { const found = invoices.find(i => i.id === invoiceId); if (!found) throw new Error("The source invoice is unavailable."); return found; };
    if (command.action === "payment.record") {
      const v = receiptInput.parse(input), inv = invoice(v.invoiceId);
      if (inv.void) throw new Error("A cancelled invoice cannot receive a new payment.");
      if (v.receivedAtISO < inv.issuedOn || v.receivedAtISO > today) throw new Error("Choose an actual receipt date on or after this invoice and no later than today.");
      // Limit against the current total allocation, including any later dated receipts.
      const settled = settleInvoice(inv, s.payments, s.collections[inv.id], today);
      if (v.amountCents > Math.min(settled.balanceCents, settleInvoice(inv, s.payments, s.collections[inv.id], v.receivedAtISO).balanceCents)) throw new Error("This payment exceeds the current invoice balance. Reload before recording it.");
      if (s.payments.some(p => p.reference?.toLocaleLowerCase() === v.reference.toLocaleLowerCase() && p.method === v.method && (p.customerId ?? invoices.find(i => i.id === p.invoiceId)?.customerId) === inv.customerId)) throw new Error("This payment reference was already recorded for this method. Review the original receipt.");
      if (s.payments.length >= 100000) throw new Error("The receipt archive is full. Review deployment capacity.");
      const { reviewed: _, ...fields } = v; void _;
      const payment: Payment = { ...fields, customerId: inv.customerId, id: randomUUID(), refunded: false, actor, recordedAt: at, imported: false };
      s.payments.push(payment); id = payment.id; snapshot = payment; changedPayment = payment;
    } else if (command.action === "payment.return") {
      const v = returnInput.parse(input), payment = s.payments.find(p => p.id === v.paymentId);
      if (!payment) throw new Error("Original receipt unavailable.");
      const inv = invoice(payment.invoiceId);
      if (payment.returned) throw new Error("This receipt already has a recorded return.");
      if (v.date < payment.receivedAtISO || v.date > today) throw new Error("Choose the actual return date on or after the receipt and no later than today.");
      if (inv.void && v.customerFeeCents) throw new Error("A cancelled invoice cannot receive an additional customer fee.");
      if (s.payments.some(p => p.returned?.reference.toLocaleLowerCase() === v.reference.toLocaleLowerCase())) throw new Error("This bank return reference was already recorded.");
      const { paymentId: _, reviewed: __, ...fields } = v; void _; void __;
      payment.returned = { ...fields, id: randomUUID(), actor, recordedAt: at }; payment.refunded = true;
      settleInvoice(inv, s.payments, s.collections[inv.id], today);
      id = payment.returned.id; snapshot = payment; changedPayment = payment;
    } else if (command.action === "collection.update") {
      const v = followupInput.parse(input); invoice(v.invoiceId);
      const previous = s.collections[v.invoiceId];
      if ((previous?.revision ?? 0) !== v.revision) throw new Error("Collection follow-up changed. Reload the current revision.");
      s.collections[v.invoiceId] = { ...previous, ...v, revision: v.revision + 1 }; id = v.invoiceId; snapshot = s.collections[id];
    } else {
      const v = reminderInput.parse(input); invoice(v.invoiceId); if (v.date > today) throw new Error("Only record reminders already made.");
      const previous = s.collections[v.invoiceId] ?? { invoiceId: v.invoiceId };
      s.collections[v.invoiceId] = { ...previous, revision: (previous.revision ?? 0) + 1, reminders: (previous.reminders ?? 0) + 1 };
      id = randomUUID(); snapshot = v;
    }
    if (changedPayment) {
      const existing = new Set(s.journals.map(e => e.id));
      for (const entry of receiptJournalEntries([changedPayment]).entries) if (!existing.has(entry.id)) s.journals.push(entry);
    }
    s.audit.push({ id: randomUUID(), actor, at, action: command.action, recordId: id, snapshot: structuredClone(snapshot) });
    s.commands[command.requestId] = { hash, id }; return { id, kind: "receivable" };
  });
}
/** Retained for old callers; financial history must use a dated, reviewed command. */
export function refundPayment(_paymentId: string): never { void _paymentId; throw new Error("Use a reviewed, dated returned-payment record. Customer-credit refunds are a separate workflow."); }
export function receiptJournalEntries(payments: Payment[]): { entries: JournalEntry[]; issues: string[] } {
  const entries: JournalEntry[] = [], issues: string[] = [];
  const add = (id: string, date: string, memo: string, debit: number, credit: number, amount: number) => {
    if (!amount) return;
    const entry: JournalEntry = { id, source: id, date, memo, lines: [{ accountNumber: debit, debitCents: amount, creditCents: 0 }, { accountNumber: credit, debitCents: 0, creditCents: amount }] };
    const error = validateEntry(entry); if (error) throw new Error(error); entries.push(entry);
  };
  for (const p of payments) {
    add(`receipt:${p.id}`, p.receivedAtISO, `Receipt ${p.reference || p.id} · invoice ${p.invoiceId}`, 1000, 1200, p.amountCents);
    add(`receipt-fee:${p.id}`, p.receivedAtISO, `Processing fee · receipt ${p.id}`, 6400, 1000, p.feeCents);
    if (p.returned) {
      const r = p.returned;
      add(`receipt-return:${r.id}`, r.date, `Returned payment ${r.reference} · invoice ${p.invoiceId}`, 1200, 1000, p.amountCents);
      add(`receipt-return-bank-fee:${r.id}`, r.date, `Bank return fee ${r.reference}`, 6400, 1000, r.bankFeeCents);
      if (r.customerFeeCents) {
        const entry: JournalEntry = { id: `receipt-return-customer-fee:${r.id}`, source: `receipt-return-customer-fee:${r.id}`, date: r.date, memo: `Reviewed customer return fee · invoice ${p.invoiceId}`, lines: [
          { accountNumber: 1200, debitCents: r.customerFeeCents, creditCents: 0 },
          { accountNumber: 4000, debitCents: 0, creditCents: r.customerFeeCents - r.customerFeeTaxCents },
          { accountNumber: 2200, debitCents: 0, creditCents: r.customerFeeTaxCents },
        ].filter(l => l.debitCents || l.creditCents) };
        const error = validateEntry(entry); if (error) throw new Error(error); entries.push(entry);
      }
    } else if (p.refunded) issues.push(`Receipt ${p.id} was marked refunded in legacy data without a return date. Review its history before relying on these accounting totals.`);
  }
  return { entries, issues };
}

export function receivableJournals() { return state.change(s => ({ entries: s.journals, issues: s.payments.filter(p => p.refunded && !p.returned).map(p => `Receipt ${p.id} has an undated legacy refund. Review its return before relying on these accounting totals.`) })); }
