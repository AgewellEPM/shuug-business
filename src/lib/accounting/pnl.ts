/**
 * Profit & Loss — the core financial statement (QBD Ch.3), built from real data:
 * income from orders, COGS from captured landed cost, and operating expenses from
 * recorded receipts. Pure, cents-only. Also emits deterministic cost-lowering
 * insights so sales performance is read next to the cost of earning it.
 */
import type { Order, Sku } from "../data/model";
import type { Expense } from "../expenses/model";

export interface PnlLine { label: string; cents: number }

export interface ProfitAndLoss {
  incomeCents: number;
  cogsCents: number;
  grossProfitCents: number;
  grossMarginFraction: number;
  operatingExpensesByCategory: PnlLine[];
  totalOperatingExpensesCents: number;
  netIncomeCents: number;
  netMarginFraction: number;
  /** plain-language, deterministic cost-lowering levers. */
  insights: string[];
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (f: number) => `${Math.round(f * 100)}%`;

export function computePnl(orders: Order[], skus: Sku[], expenses: Expense[]): ProfitAndLoss {
  const live = orders.filter((o) => o.status !== "cancelled");
  const costBySku = new Map(skus.map((s) => [s.id, s.costPerCaseCents]));

  const incomeCents = live.reduce((n, o) => n + o.subtotalCents, 0);
  const expenseCogs = expenses.reduce((n, e) => n + (e.accounting?.status === "posted" ? e.accounting.allocations.filter(l => l.purpose === "cost_of_sales").reduce((m, l) => m + l.amountCents, 0) * (e.fields.kind === "refund" ? -1 : 1) : 0), 0);
  const cogsCents = live.reduce(
    (n, o) => n + o.lines.reduce((m, l) => m + (l.costAtOrderCents ?? (costBySku.get(l.skuId) ?? 0) * l.cases), 0),
    expenseCogs,
  );
  const grossProfitCents = incomeCents - cogsCents;
  const grossMarginFraction = incomeCents > 0 ? grossProfitCents / incomeCents : 0;

  // Operating expenses: recorded receipts only, refunds subtract, grouped by category.
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    if (e.accounting ? e.accounting.status !== "posted" || e.accounting.mode !== "bill" : e.status !== "recorded" || e.fields.currency !== "USD" || e.fields.treatment !== "operating") continue;
    const amt = (e.accounting ? e.accounting.allocations.filter(l => l.purpose === "operating").reduce((n, l) => n + l.amountCents, 0) : e.fields.amountCents ?? 0) * (e.fields.kind === "refund" ? -1 : 1);
    byCat.set(e.fields.category, (byCat.get(e.fields.category) ?? 0) + amt);
  }
  const operatingExpensesByCategory = [...byCat.entries()]
    .map(([label, cents]) => ({ label, cents }))
    .sort((a, b) => b.cents - a.cents);
  const totalOperatingExpensesCents = operatingExpensesByCategory.reduce((n, l) => n + l.cents, 0);

  const netIncomeCents = grossProfitCents - totalOperatingExpensesCents;
  const netMarginFraction = incomeCents > 0 ? netIncomeCents / incomeCents : 0;

  return {
    incomeCents,
    cogsCents,
    grossProfitCents,
    grossMarginFraction,
    operatingExpensesByCategory,
    totalOperatingExpensesCents,
    netIncomeCents,
    netMarginFraction,
    insights: buildInsights({ incomeCents, cogsCents, grossMarginFraction, operatingExpensesByCategory, netIncomeCents }),
  };
}

function buildInsights(p: {
  incomeCents: number;
  cogsCents: number;
  grossMarginFraction: number;
  operatingExpensesByCategory: PnlLine[];
  netIncomeCents: number;
}): string[] {
  const out: string[] = [];
  if (p.incomeCents === 0) return ["No recorded sales yet — add orders to see your P&L and cost levers."];

  const cogsPct = p.cogsCents / p.incomeCents;
  if (cogsPct > 0.55) {
    out.push(`Cost of goods is ${pct(cogsPct)} of revenue — your biggest lever. Buying/producing at the next volume tier is the fastest way to cut it. See Costs & volume.`);
  } else {
    out.push(`Gross margin is ${pct(p.grossMarginFraction)} — cost of goods is a healthy ${pct(cogsPct)} of revenue.`);
  }

  const topExpense = p.operatingExpensesByCategory.find((l) => l.cents > 0);
  if (topExpense) {
    const share = topExpense.cents / p.incomeCents;
    out.push(`Your largest operating cost is ${topExpense.label} at ${usd(topExpense.cents)} (${pct(share)} of sales). Trimming it 10% adds ${usd(Math.round(topExpense.cents * 0.1))} to the bottom line.`);
  }

  out.push(p.netIncomeCents >= 0
    ? `Net profit is ${usd(p.netIncomeCents)}. Every 1% of cost you remove is roughly ${usd(Math.round(p.incomeCents * 0.01))} more profit.`
    : `You're ${usd(-p.netIncomeCents)} under water — lowering cost of goods and your top expense category closes the gap fastest.`);

  return out;
}
