import Link from "next/link";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { getDealStore } from "@/lib/data/store";
import { loadAnalytics } from "@/lib/analytics/load";
import { expenseOutstanding } from "@/lib/expenses/accounting-model";
import { listExpenses } from "@/lib/expenses/store";
import { computePnl } from "@/lib/accounting/pnl";
import { computeBalanceSheet } from "@/lib/accounting/balance-sheet";
import { computeSalesTax } from "@/lib/accounting/sales-tax";
import { getInventory } from "@/lib/ops/store";
import { setting } from "@/lib/connections/vault";
import type { Expense } from "@/lib/expenses/model";
import { QbdManualCoverage } from "@/components/QbdManualCoverage";
import { formatCents } from "@/lib/money";
import { formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireSectionAccess("money");
  const selected = (await searchParams).view;
  const view = selected === "sales-tax" || selected === "balance-sheet" ? selected : "all";
  const store = await getDealStore();
  const { orders, skus, customers } = await loadAnalytics(store);
  const expenses: Expense[] = listExpenses();
  const pnl = computePnl(orders, skus, expenses);

  // Balance sheet + sales tax from the same real data.
  const inv = getInventory();
  const inventoryValueCents = inv.reduce((n, i) => n + i.onHandCases * i.mfgCostPerCaseCents, 0);
  const accountsReceivableCents = orders.filter((o) => o.status === "submitted").reduce((n, o) => n + o.totalCents, 0);
  const accountsPayableCents = expenses.reduce((n, e) => n + (e.accounting ? expenseOutstanding(e.accounting).homeAmountCents * (e.accounting.fields.kind === "refund" ? -1 : 1) : e.status === "recorded" && e.fields.currency === "USD" && e.fields.treatment !== "transfer" && e.fields.paymentStatus === "unpaid" ? (e.fields.amountCents ?? 0) * (e.fields.kind === "refund" ? -1 : 1) : 0), 0);
  const salesTax = computeSalesTax(orders, customers, Number(setting("SALES_TAX_RATE_BPS")) || 0);
  const bs = computeBalanceSheet({
    accountsReceivableCents, inventoryValueCents, cashCents: 0,
    accountsPayableCents, salesTaxPayableCents: salesTax.estimatedTaxCents, retainedEarningsCents: pnl.netIncomeCents,
  });

  return (
    <div>
      <header className="mb-6">
        <p className="dd-eyebrow">Accounting reports and workflow coverage</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{view === "sales-tax" ? "Sales tax" : view === "balance-sheet" ? "Balance sheet" : "Accounting"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Operational summaries from recorded sales and costs. Review the ledger for posted entries and the manual checklist below for outstanding accounting requirements.
        </p>
      </header>

      {view !== "all" && <Link href="/books" className="mb-5 inline-block text-sm font-semibold text-emerald-800">← All accounting reports</Link>}
      {view === "all" && <>
      {/* Profit & Loss */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Profit &amp; Loss</h2>
          <Link href="/api/v1/financials/pnl" target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50">API →</Link>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Income (sales)" cents={pnl.incomeCents} strong />
          <Row label="Cost of goods sold" cents={-pnl.cogsCents} />
          <Row label="Gross profit" cents={pnl.grossProfitCents} strong note={`${formatPercent(pnl.grossMarginFraction)} margin`} />
          {pnl.operatingExpensesByCategory.map((l) => <Row key={l.label} label={`  ${l.label}`} cents={-l.cents} muted />)}
          <Row label="Total operating expenses" cents={-pnl.totalOperatingExpensesCents} />
          <Row label="Net profit" cents={pnl.netIncomeCents} strong note={`${formatPercent(pnl.netMarginFraction)} net margin`} tone={pnl.netIncomeCents >= 0 ? "text-emerald-700" : "text-red-600"} />
        </dl>
      </section>

      {/* Cost-lowering insight */}
      <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Lower your costs</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-emerald-950">
          {pnl.insights.map((s, i) => <li key={i}>• {s}</li>)}
        </ul>
        <Link href="/costs" className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">Open Costs &amp; volume →</Link>
      </section>

      </>}
      {/* Balance sheet + sales tax */}
      <div className={`mb-6 grid grid-cols-1 gap-4 ${view === "all" ? "lg:grid-cols-2" : "max-w-3xl"}`}>
        {view !== "sales-tax" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Balance sheet</h2>
            <Link href="/api/v1/financials/balance-sheet" target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700 hover:underline">API →</Link>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Accounts receivable" cents={bs.assets.accountsReceivableCents} muted />
            <Row label="Inventory asset" cents={bs.assets.inventoryCents} muted />
            <Row label="Total assets" cents={bs.assets.totalCents} strong />
            <Row label="Accounts payable" cents={bs.liabilities.accountsPayableCents} muted />
            <Row label="Sales tax payable" cents={bs.liabilities.salesTaxPayableCents} muted />
            <Row label="Total liabilities" cents={bs.liabilities.totalCents} strong />
            <Row label="Retained earnings" cents={bs.equity.retainedEarningsCents} muted />
            <Row label="Owner's equity" cents={bs.equity.ownersEquityCents} muted />
            <Row label="Total equity" cents={bs.equity.totalCents} strong />
          </dl>
          <p className="mt-2 text-[11px] text-slate-400">{bs.note}</p>
        </section>

        )}
        {view !== "balance-sheet" && (<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Sales tax</h2>
            <Link href="/api/v1/sales-tax" target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700 hover:underline">API →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Taxable sales" value={formatCents(salesTax.taxableSalesCents)} />
            <Metric label={`Est. tax (${(salesTax.rateBasisPoints / 100).toFixed(2)}%)`} value={formatCents(salesTax.estimatedTaxCents)} />
          </div>
          {salesTax.byRegion.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {salesTax.byRegion.map((r) => (
                <li key={r.region} className="flex justify-between"><span className="text-slate-600">{r.region}</span><span className="tabular-nums text-slate-800">{formatCents(r.taxCents)}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-slate-400">{salesTax.note}</p>
        </section>)}
      </div>

      {view === "all" && <QbdManualCoverage />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
function Row({ label, cents, strong, muted, note, tone }: { label: string; cents: number; strong?: boolean; muted?: boolean; note?: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className={`${strong ? "font-semibold text-slate-900" : muted ? "pl-2 text-slate-500" : "text-slate-700"}`}>{label.trim()}{note && <span className="ml-2 text-xs font-normal text-slate-400">{note}</span>}</dt>
      <dd className={`tabular-nums ${tone ?? (strong ? "font-semibold text-slate-900" : "text-slate-700")}`}>{formatCents(cents)}</dd>
    </div>
  );
}
