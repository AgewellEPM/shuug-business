/**
 * Invoicing + collections engine (#9/#10/#11). An invoice is an order with a due
 * date; payments (cash/check/card/link) — including partials, fees, and bank returns —
 * are matched against it to compute balance, status, and aging from recorded receipt and return evidence. Legacy undated refunds remain flagged. Overdue invoices get a concrete next action based on
 * reminders sent, a promised-payment date, and whether it's been escalated to a
 * person. Pure, deterministic, cents-only.
 */
export type InvoiceState = "paid" | "partial" | "unpaid" | "overdue" | "void";
export type PayMethod = "cash" | "check" | "card" | "link" | "other";

export interface Invoice { id: string; customerId: string; company: string; totalCents: number; dueDateISO: string; poRef?: string; void?: boolean }
export interface PaymentReturn { id: string; date: string; reference: string; reason: string; evidence: string; bankFeeCents: number; customerFeeCents: number; customerFeeTaxCents: number; customerFeeEvidence: string; actor: string; recordedAt: string }
export interface Payment { customerId?: string; reference?: string; evidence?: string; actor?: string; recordedAt?: string; returned?: PaymentReturn; imported?: boolean; id: string; invoiceId: string; amountCents: number; method: PayMethod; receivedAtISO: string; feeCents: number; refunded: boolean }
export interface CollectionState { revision?: number; invoiceId: string; promisedDate?: string | null; reminders?: number; escalatedTo?: string | null; note?: string }

export interface InvoiceStatus {
  invoiceId: string;
  company: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  feeCents: number;
  returnFeeCents: number;
  customerFeeCents: number;
  legacyReturnNeedsReview: boolean;
  collectionRevision: number;
  collectionNote: string;
  status: InvoiceState;
  dueDateISO: string;
  daysOverdue: number;
  promisedDate: string | null;
  reminders: number;
  escalatedTo: string | null;
  nextAction: string;
  poRef?: string;
}

const DAY = 86_400_000;
const daysBetween = (aIso: string, bIso: string) => Math.floor((Date.parse(`${aIso}T00:00:00Z`) - Date.parse(`${bIso}T00:00:00Z`)) / DAY);

export function settleInvoice(inv: Invoice, payments: Payment[], state: CollectionState | undefined, todayIso: string): InvoiceStatus {
  const mine = payments.filter((p) => p.invoiceId === inv.id && p.receivedAtISO <= todayIso);
  const paidCents = mine.filter(p => p.returned ? p.returned.date > todayIso : !p.refunded).reduce((n, p) => n + p.amountCents, 0);
  const feeCents = mine.reduce((n, p) => n + p.feeCents, 0);
  const returned = mine.filter(p => p.returned && p.returned.date <= todayIso);
  const returnFeeCents = returned.reduce((n, p) => n + p.returned!.bankFeeCents, 0);
  const customerFeeCents = returned.reduce((n, p) => n + p.returned!.customerFeeCents, 0);
  const totalCents = inv.totalCents + customerFeeCents;
  const balanceCents = Math.max(0, totalCents - paidCents);
  const daysOverdue = Math.max(0, daysBetween(todayIso, inv.dueDateISO));
  const reminders = state?.reminders ?? 0;
  const promisedDate = state?.promisedDate ?? null;
  const escalatedTo = state?.escalatedTo ?? null;

  for (const value of [inv.totalCents, paidCents, feeCents, returnFeeCents, customerFeeCents, totalCents]) if (!Number.isSafeInteger(value) || value < 0) throw new Error("Receivable totals exceed supported whole-cent precision or contain invalid amounts.");

  const status: InvoiceState =
    inv.void ? "void" :
    balanceCents <= 0 ? "paid" :
    inv.dueDateISO < todayIso ? "overdue" :
    paidCents > 0 ? "partial" : "unpaid";

  return {
    invoiceId: inv.id, company: inv.company, totalCents, paidCents, balanceCents, feeCents, returnFeeCents, customerFeeCents, legacyReturnNeedsReview: mine.some(p => p.refunded && !p.returned), collectionRevision: state?.revision ?? 0, collectionNote: state?.note ?? "",
    status, dueDateISO: inv.dueDateISO, daysOverdue, promisedDate, reminders, escalatedTo,
    nextAction: nextAction({ status, daysOverdue, reminders, promisedDate, escalatedTo, dueDateISO: inv.dueDateISO, todayIso }),
    poRef: inv.poRef,
  };
}

function nextAction(x: { status: InvoiceState; daysOverdue: number; reminders: number; promisedDate: string | null; escalatedTo: string | null; dueDateISO: string; todayIso: string }): string {
  if (x.status === "paid") return "Paid in full";
  if (x.status === "void") return "Voided";
  if (x.status !== "overdue") return `Due ${x.dueDateISO}`;
  if (x.escalatedTo) return `Escalated to ${x.escalatedTo}`;
  if (x.promisedDate && x.promisedDate >= x.todayIso) return `Promised ${x.promisedDate}`;
  if (x.promisedDate && x.promisedDate < x.todayIso) return "Promise broken — call the customer";
  if (x.reminders === 0) return "Send first reminder";
  if (x.reminders >= 3 || x.daysOverdue > 45) return "Escalate — needs a personal call";
  return `Send reminder (${x.reminders} sent)`;
}

export interface Aging { currentCents: number; d1_30Cents: number; d31_60Cents: number; d61_90Cents: number; d90plusCents: number; totalCents: number }
export function agingFromStatuses(statuses: InvoiceStatus[]): Aging {
  const a: Aging = { currentCents: 0, d1_30Cents: 0, d31_60Cents: 0, d61_90Cents: 0, d90plusCents: 0, totalCents: 0 };
  for (const s of statuses) {
    if (s.status === "paid" || s.status === "void" || s.balanceCents <= 0) continue;
    a.totalCents += s.balanceCents;
    if (s.daysOverdue <= 0) a.currentCents += s.balanceCents;
    else if (s.daysOverdue <= 30) a.d1_30Cents += s.balanceCents;
    else if (s.daysOverdue <= 60) a.d31_60Cents += s.balanceCents;
    else if (s.daysOverdue <= 90) a.d61_90Cents += s.balanceCents;
    else a.d90plusCents += s.balanceCents;
  }
  return a;
}
