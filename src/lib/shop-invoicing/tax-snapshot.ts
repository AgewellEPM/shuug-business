import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { numberField, textField, type BusinessRecord } from "../workspace/model";

const cents = z.number().int().min(0).max(99_999_999);
const reviewedQuote = z.object({
  currency: z.literal("USD"), client: z.object({ id: z.uuid() }),
  input: z.object({ taxReviewed: z.literal(true), taxReview: z.string().trim().min(3) }),
  laborSubtotal: cents, partsSubtotal: cents, subtotal: cents,
  laborTax: cents, partsTax: cents, tax: cents, total: cents.positive(), pricedOn: z.iso.date(),
});
export interface ServiceTaxSnapshot {
  version: 1; proposalId: string; proposalRevision: number; quoteDigest: string;
  subtotal: number; laborTax: number; partsTax: number; tax: number; total: number;
  depositApplied: number; review: string; pricedOn: string;
}
const must = (value: unknown, message: string) => { if (!value) throw new Error(message); };
export function transactionRecords(db: DatabaseSync): BusinessRecord[] {
  return (db.prepare("SELECT body FROM records").all() as { body: string }[]).map(row => JSON.parse(row.body));
}
export function repairInvoiceContext(invoice: BusinessRecord, records: BusinessRecord[]) {
  const job = records.find(r => r.id === invoice.fields.job && r.kind === "job");
  const agreement = records.find(r => r.id === job?.fields.agreement && r.kind === "agreement");
  const proposal = records.find(r => r.id === agreement?.fields.proposal && r.kind === "proposal");
  return { job, agreement, proposal };
}

/** Copy reviewed amounts, never infer a statutory rate or re-price accepted work. */
export function reviewedRepairTax(invoice: BusinessRecord, records: BusinessRecord[]): ServiceTaxSnapshot | null {
  const { job, agreement, proposal } = repairInvoiceContext(invoice, records);
  if (!proposal?.computed?.repairEstimate) return null;
  if (textField(invoice, "method") === "deposit") return null; // Deposits remain a liability until final billing.
  must(textField(invoice, "method") === "fixed", "Reviewed automotive tax allocation requires a fixed final invoice. Review other billing methods separately.");
  const quote = reviewedQuote.parse(proposal.computed.repairEstimate);
  const applied = Number(invoice.computed?.depositApplied ?? 0);
  must(job && agreement && proposal.status === "accepted" && agreement.status === "signed" &&
    proposal.fields.client === job.fields.client && agreement.fields.client === job.fields.client && quote.client.id === job.fields.client,
  "The reviewed repair quote must belong to this job's accepted client agreement.");
  must(quote.laborSubtotal + quote.partsSubtotal === quote.subtotal && quote.laborTax + quote.partsTax === quote.tax &&
    quote.subtotal + quote.tax === quote.total && numberField(proposal, "amount") === quote.total,
  "Reviewed repair net, tax and gross amounts do not reconcile. Review the estimate before invoicing.");
  must(Number.isSafeInteger(applied) && applied >= 0 && invoice.currency === quote.currency &&
    numberField(invoice, "amount") + applied === quote.total,
  "The invoice gross cannot be allocated to the reviewed repair quote. Review scope changes and deposits before invoicing.");
  must(!records.some(r => r.kind === "change" && r.fields.job === job!.id && r.status === "approved" && numberField(r, "amount") !== 0),
    "Approved repair scope changes require a new reviewed tax allocation before final invoicing.");
  return { version: 1, proposalId: proposal.id, proposalRevision: proposal.revision,
    quoteDigest: createHash("sha256").update(JSON.stringify(proposal.computed.repairEstimate)).digest("hex"),
    subtotal: quote.subtotal, laborTax: quote.laborTax, partsTax: quote.partsTax, tax: quote.tax,
    total: quote.total, depositApplied: applied, review: quote.input.taxReview, pricedOn: quote.pricedOn };
}

/** Cumulative rounding ensures partial credits can never reverse tax twice. */
export function creditedTax(snapshot: ServiceTaxSnapshot, priorCredit: number, amount: number) {
  must(snapshot.depositApplied === 0, "Credit allocation for a deposit-applied repair invoice requires an accountant-reviewed correction.");
  must(Number.isSafeInteger(priorCredit) && Number.isSafeInteger(amount) && priorCredit >= 0 && amount > 0 && priorCredit + amount <= snapshot.total,
    "Repair credits exceed the original reviewed gross amount.");
  const allocation = (gross: number) => Number((BigInt(snapshot.tax) * BigInt(gross) + BigInt(Math.floor(snapshot.total / 2))) / BigInt(snapshot.total));
  return allocation(priorCredit + amount) - allocation(priorCredit);
}
