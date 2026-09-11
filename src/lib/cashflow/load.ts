/**
 * Shape real data into the cash forecast: expected collections from open invoices
 * (order total, due = order date + the customer's terms), bills from unpaid
 * receipts, and payroll spread weekly. Opening balance is owner-set (no bank
 * connection yet) — clearly a confirmed input, everything else is forecast.
 */
import { loadWorkspace } from "../data/workspace";
import { expenseOutstanding } from "../expenses/accounting-model";
import { listExpenses } from "../expenses/store";
import { listTeam } from "../team/store";
import { setting } from "../connections/vault";
import { computeCashFlow, termDays, type CashItem, type CashForecast } from "./engine";

const DAY = 86_400_000;
const WEEKS = 12;

export async function loadCashFlowAsync(nowMs = Date.now(), collectionDelayDays = 0): Promise<CashForecast> {
  const openingCents = Number(setting("OPENING_CASH_CENTS")) || 0;
  const { deals, orders } = await loadWorkspace();

  const termsByCustomer = new Map(deals.map((d) => [d.customer.id, d.agreement.paymentTerms]));
  const companyByCustomer = new Map(deals.map((d) => [d.customer.id, d.customer.company]));

  const receivables: CashItem[] = orders
    .filter((o) => o.status === "submitted")
    .map((o) => {
      const days = termDays(termsByCustomer.get(o.customerId) ?? "net30");
      return { amountCents: o.totalCents, dueMs: Date.parse(o.createdAt) + days * DAY, label: `${companyByCustomer.get(o.customerId) ?? o.customerId} · ${o.id}`, kind: "collection" as const };
    });

  const bills: CashItem[] = [];
  for (const e of listExpenses()) {
    if (e.accounting) {
      const balance = expenseOutstanding(e.accounting);
      if (!balance.amountCents) continue;
      const credit = e.accounting.fields.kind === "refund";
      (credit ? receivables : bills).push({ amountCents: balance.homeAmountCents, dueMs: Date.parse(`${e.accounting.dueDate}T00:00:00Z`), label: `${e.fields.merchant} · remaining ${credit ? "vendor credit" : "bill"}`, kind: credit ? "collection" : "bill" });
    } else if (e.status === "recorded" && e.fields.paymentStatus === "unpaid" && e.fields.currency === "USD" && e.fields.amountCents && e.fields.treatment !== "transfer") {
      const credit = e.fields.kind === "refund";
      (credit ? receivables : bills).push({ amountCents: e.fields.amountCents, dueMs: Date.parse(`${e.fields.date}T00:00:00Z`), label: `${e.fields.merchant} · unposted document estimate`, kind: credit ? "collection" : "bill" });
    }
  }

  const weeklyPayrollCents = Math.round(listTeam().reduce((n, m) => n + (m.salaryCents ?? 0), 0) / 52);
  const payroll: CashItem[] = weeklyPayrollCents > 0
    ? Array.from({ length: WEEKS }, (_, i) => ({ amountCents: weeklyPayrollCents, dueMs: nowMs + i * 7 * DAY, label: "Payroll", kind: "payroll" as const }))
    : [];

  return computeCashFlow({ openingCents, receivables, payables: [...bills, ...payroll], nowMs, weeks: WEEKS, collectionDelayDays });
}
