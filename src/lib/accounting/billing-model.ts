import { z } from "zod";

export const billingMoney = z.number().int().min(0).max(99_999_999_999);
const account = z.number().int().positive();
export const billingLineInput = z.object({
  description: z.string().trim().min(1).max(500), quantity: z.string().regex(/^\d{1,7}(\.\d{1,4})?$/),
  unit: z.string().trim().max(40), unitCents: billingMoney, discountCents: billingMoney,
  taxCents: billingMoney, accountNumber: account, taxAccountNumber: account,
}).strict();
export const billingFieldsInput = z.object({
  kind: z.enum(["invoice", "bill"]), number: z.string().trim().min(1).max(80),
  heading: z.string().trim().min(1).max(80), date: z.iso.date(), due: z.iso.date(), currency: z.literal("USD"),
  party: z.object({ name: z.string().trim().min(1).max(160), email: z.union([z.email().max(200), z.literal("")]), address: z.string().trim().max(2000) }).strict(),
  issuer: z.string().trim().min(1).max(2000), terms: z.string().trim().max(3000), notes: z.string().trim().max(5000), privateNotes: z.string().trim().max(5000),
  controlAccount: account, lines: z.array(billingLineInput).min(1).max(100),
  custom: z.array(z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().max(500) }).strict()).max(30),
}).strict();
export type BillingFields = z.infer<typeof billingFieldsInput>;
export type BillingLine = z.infer<typeof billingLineInput>;
export function lineAmounts(line: BillingLine) {
  const [whole, fraction = ""] = line.quantity.split(".");
  const quantity = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
  if (quantity <= 0n) throw new Error("Line quantity must be greater than zero.");
  const gross = (quantity * BigInt(line.unitCents) + 5000n) / 10000n;
  if (gross > 99_999_999_999n) throw new Error("Line amount exceeds the supported maximum.");
  if (line.discountCents > Number(gross)) throw new Error("A line discount cannot exceed its price.");
  return { gross: Number(gross), net: Number(gross) - line.discountCents, tax: line.taxCents, total: Number(gross) - line.discountCents + line.taxCents };
}
export function billingTotals(lines: BillingLine[]) {
  const total = lines.reduce((a, l) => { const n = lineAmounts(l); return { subtotal: a.subtotal + n.gross, discount: a.discount + l.discountCents, tax: a.tax + n.tax, total: a.total + n.total }; }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
  if (total.total > 99_999_999_999 || !Number.isSafeInteger(total.total)) throw new Error("Document total exceeds the supported maximum.");
  return total;
}
export interface BillingSettlement {
  id: string; date: string; amountCents: number; accountNumber: number; method: string; reference: string; evidence: string;
  direction: "payment" | "refund"; journalId: string; actor: string; at: string; providerPaymentId?: string;
}
export interface BillingCredit { id: string; date: string; reason: string; lines: BillingLine[]; amountCents: number; journalId: string; actor: string; at: string }
export interface BillingDocument extends BillingFields {
  id: string; revision: number; status: "draft" | "posted" | "void"; createdAt: string; updatedAt: string;
  journalId: string | null; settlements: BillingSettlement[]; credits: BillingCredit[];
}
export function billingBalance(d: BillingDocument) {
  const total = billingTotals(d.lines).total, credited = d.credits.reduce((n,c) => n + c.amountCents, 0);
  const paid = d.settlements.reduce((n,p) => n + (p.direction === "payment" ? p.amountCents : -p.amountCents), 0);
  return { total, credited, paid, outstanding: d.status === "posted" ? total - credited - paid : 0 };
}
const version = { id: z.uuid(), revision: z.number().int().positive(), reviewed: z.literal(true) };
export const billingSchemas = {
  "billing.save": billingFieldsInput.extend({ id: z.uuid().optional(), revision: z.number().int().nonnegative(), reviewed: z.literal(true) }).strict(),
  "billing.post": z.object(version).strict(),
  "billing.void": z.object({ ...version, date: z.iso.date(), reason: z.string().trim().min(3).max(1000) }).strict(),
  "billing.credit": z.object({ ...version, date: z.iso.date(), reason: z.string().trim().min(3).max(1000), lines: z.array(billingLineInput).min(1).max(100) }).strict(),
  "billing.settle": z.object({ ...version, date: z.iso.date(), direction: z.enum(["payment", "refund"]), amountCents: billingMoney.refine(n => n > 0), accountNumber: account,
    method: z.string().trim().min(1).max(80), reference: z.string().trim().min(1).max(160), evidence: z.string().trim().min(3).max(2000) }).strict(),
} as const;
