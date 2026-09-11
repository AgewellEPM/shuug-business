/**
 * Auto-posting rules — turn live business events into balanced double-entry
 * journal entries, so the general ledger reflects real activity without hand
 * data-entry. Every helper returns a BALANCED entry (validated by the ledger).
 * Pure: callers assemble the plain inputs; this maps them to debits/credits.
 */
import type { JournalEntry } from "./ledger";

// Account numbers (mirror STANDARD_COA).
const CASH = 1000, AR = 1200, INVENTORY = 1300, AP = 2000, INCOME = 4000, COGS = 5000;
const EXPENSE_BY_CATEGORY: Record<string, number> = {
  shipping: 6100, freight: 6100, marketing: 6200, advertising: 6200, ads: 6200,
  software: 6300, subscriptions: 6300, saas: 6300,
};
const OTHER_EXPENSE = 6900, OPERATING = 6000;

export interface OrderPosting { id: string; date: string; subtotalCents: number; freightCents: number; totalCents: number; costCents: number }
export interface PaymentPosting { invoiceId: string; date: string; paidCents: number }
export interface ExpensePosting { id: string; date: string; amountCents: number; category: string; paid: boolean }

export interface PostingInputs {
  orders: OrderPosting[];
  payments: PaymentPosting[];
  expenses: ExpensePosting[];
}

const dr = (accountNumber: number, cents: number) => ({ accountNumber, debitCents: cents, creditCents: 0 });
const cr = (accountNumber: number, cents: number) => ({ accountNumber, debitCents: 0, creditCents: cents });

/** A credit sale: Dr A/R (what they owe), Cr Sales Income; plus COGS: Dr COGS, Cr Inventory. */
export function postOrder(o: OrderPosting): JournalEntry[] {
  const revenue = o.subtotalCents + o.freightCents; // freight billed to the customer is income
  const entries: JournalEntry[] = [{
    id: `order:${o.id}`, date: o.date.slice(0, 10), memo: `Sale — order ${o.id}`, source: `order:${o.id}`,
    lines: [dr(AR, revenue), cr(INCOME, revenue)],
  }];
  if (o.costCents > 0) {
    entries.push({
      id: `cogs:${o.id}`, date: o.date.slice(0, 10), memo: `Cost of goods — order ${o.id}`, source: `order:${o.id}`,
      lines: [dr(COGS, o.costCents), cr(INVENTORY, o.costCents)],
    });
  }
  return entries;
}

/** Cash in against a receivable: Dr Cash, Cr A/R. */
export function postPayment(p: PaymentPosting): JournalEntry | null {
  if (p.paidCents <= 0) return null;
  return {
    id: `payment:${p.invoiceId}`, date: p.date.slice(0, 10), memo: `Payment received — ${p.invoiceId}`, source: `payment:${p.invoiceId}`,
    lines: [dr(CASH, p.paidCents), cr(AR, p.paidCents)],
  };
}

/** A bill/expense: Dr the expense account; Cr A/P if unpaid, else Cr Cash. */
export function postExpense(e: ExpensePosting): JournalEntry | null {
  if (e.amountCents <= 0) return null;
  const acct = EXPENSE_BY_CATEGORY[e.category?.toLowerCase() ?? ""] ?? (e.category ? OTHER_EXPENSE : OPERATING);
  return {
    id: `expense:${e.id}`, date: e.date.slice(0, 10), memo: `Expense — ${e.category || "operating"}`, source: `expense:${e.id}`,
    lines: [dr(acct, e.amountCents), e.paid ? cr(CASH, e.amountCents) : cr(AP, e.amountCents)],
  };
}

/** Derive the full set of auto-posted entries from live business inputs. */
export function deriveEntries(inputs: PostingInputs): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const o of inputs.orders) out.push(...postOrder(o));
  for (const p of inputs.payments) { const e = postPayment(p); if (e) out.push(e); }
  for (const x of inputs.expenses) { const e = postExpense(x); if (e) out.push(e); }
  return out;
}
