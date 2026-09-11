import { describe, it, expect } from "vitest";
import { validateEntry, isBalanced, trialBalance, accountBalance, ledgerIncomeStatement, ledgerBalanceSheet, type JournalEntry } from "./ledger";
import { postOrder, postPayment, postExpense, deriveEntries } from "./posting";

const dr = (accountNumber: number, cents: number) => ({ accountNumber, debitCents: cents, creditCents: 0 });
const cr = (accountNumber: number, cents: number) => ({ accountNumber, debitCents: 0, creditCents: cents });
const entry = (lines: JournalEntry["lines"]): JournalEntry => ({ id: "e", date: "2026-01-01", memo: "m", source: "manual", lines });

describe("validateEntry / isBalanced", () => {
  it("accepts a balanced two-line entry", () => {
    expect(validateEntry({ lines: [dr(1000, 5000), cr(4000, 5000)] })).toBeNull();
    expect(isBalanced(entry([dr(1000, 5000), cr(4000, 5000)]))).toBe(true);
  });
  it("rejects unbalanced debits/credits", () => {
    expect(validateEntry({ lines: [dr(1000, 5000), cr(4000, 4000)] })).toMatch(/must equal/);
  });
  it("rejects a line that is both a debit and a credit", () => {
    expect(validateEntry({ lines: [{ accountNumber: 1000, debitCents: 10, creditCents: 10 }, cr(4000, 10)] })).toMatch(/either a debit or a credit/);
  });
  it("rejects an unknown account", () => {
    expect(validateEntry({ lines: [dr(9999, 10), cr(4000, 10)] })).toMatch(/Unknown account/);
  });
  it("rejects a single-line or zero entry", () => {
    expect(validateEntry({ lines: [dr(1000, 10)] })).toMatch(/at least two lines/);
    expect(validateEntry({ lines: [dr(1000, 0), cr(4000, 0)] })).toMatch(/either a debit or a credit|zero/);
  });
});

describe("trialBalance", () => {
  it("balances and reports accounts in their normal column", () => {
    const entries = [entry([dr(1000, 10000), cr(4000, 10000)])]; // cash sale
    const tb = trialBalance(entries);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    expect(tb.rows.find((r) => r.accountNumber === 1000)?.debitCents).toBe(10000); // asset → debit
    expect(tb.rows.find((r) => r.accountNumber === 4000)?.creditCents).toBe(10000); // income → credit
  });
  it("accountBalance returns natural-direction balances", () => {
    const tb = trialBalance([entry([dr(1000, 10000), cr(4000, 10000)])]);
    expect(accountBalance(tb, 1000)).toBe(10000);  // asset positive on debit
    expect(accountBalance(tb, 4000)).toBe(10000);  // income positive on credit
  });
});

describe("ledger-derived statements", () => {
  it("P&L nets income − cogs − expense", () => {
    const entries = [
      entry([dr(1200, 10000), cr(4000, 10000)]), // sale on account
      entry([dr(5000, 4000), cr(1300, 4000)]),   // cogs
      entry([dr(6000, 1500), cr(2000, 1500)]),   // expense on account
    ];
    const is = ledgerIncomeStatement(trialBalance(entries));
    expect(is.incomeCents).toBe(10000);
    expect(is.cogsCents).toBe(4000);
    expect(is.grossProfitCents).toBe(6000);
    expect(is.expenseCents).toBe(1500);
    expect(is.netIncomeCents).toBe(4500);
  });
  it("Balance Sheet balances with net income folded into equity", () => {
    const entries = [
      entry([dr(1200, 10000), cr(4000, 10000)]),
      entry([dr(5000, 4000), cr(1300, 4000)]),
      entry([dr(6000, 1500), cr(2000, 1500)]),
    ];
    const bs = ledgerBalanceSheet(trialBalance(entries));
    expect(bs.balanced).toBe(true);
    expect(bs.assetsCents).toBe(bs.liabilitiesCents + bs.equityCents);
    expect(bs.netIncomeCents).toBe(4500);
  });
});

describe("auto-posting rules produce balanced entries", () => {
  it("postOrder emits a balanced sale + cogs", () => {
    const es = postOrder({ id: "o1", date: "2026-01-02T00:00:00Z", subtotalCents: 10000, freightCents: 500, totalCents: 10500, costCents: 4000 });
    expect(es).toHaveLength(2);
    for (const e of es) expect(isBalanced(e)).toBe(true);
    expect(es[0].lines.find((l) => l.accountNumber === 4000)?.creditCents).toBe(10500); // subtotal+freight
  });
  it("postPayment and postExpense are balanced; unpaid expense hits A/P not cash", () => {
    expect(isBalanced(postPayment({ invoiceId: "o1", date: "2026-01-03", paidCents: 5000 })!)).toBe(true);
    const unpaid = postExpense({ id: "x1", date: "2026-01-03", amountCents: 2000, category: "marketing", paid: false })!;
    expect(isBalanced(unpaid)).toBe(true);
    expect(unpaid.lines.find((l) => l.accountNumber === 2000)?.creditCents).toBe(2000); // A/P
    const paid = postExpense({ id: "x2", date: "2026-01-03", amountCents: 2000, category: "marketing", paid: true })!;
    expect(paid.lines.find((l) => l.accountNumber === 1000)?.creditCents).toBe(2000);   // Cash
  });
  it("deriveEntries keeps the whole ledger in balance", () => {
    const entries = deriveEntries({
      orders: [{ id: "o1", date: "2026-01-02", subtotalCents: 10000, freightCents: 0, totalCents: 10000, costCents: 4000 }],
      payments: [{ invoiceId: "o1", date: "2026-01-05", paidCents: 6000 }],
      expenses: [{ id: "x1", date: "2026-01-06", amountCents: 1500, category: "software", paid: false }],
    });
    const tb = trialBalance(entries);
    expect(tb.balanced).toBe(true);
  });
});
