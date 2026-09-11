import { requireSectionAccess } from "@/lib/permissions/guard";
import { getDealStore } from "@/lib/data/store";
import { loadAnalytics } from "@/lib/analytics/load";
import { velocityBySku } from "@/lib/ops/velocity";
import { volumePlan } from "@/lib/costs/volume";
import { formatCents } from "@/lib/money";
import { formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  await requireSectionAccess("operations", "view");

  const store = await getDealStore();
  const { skus, orders } = await loadAnalytics(store);
  const velocity = velocityBySku(orders); // cases/day per sku
  const plans = skus.map((s) => volumePlan(s, (velocity.get(s.id) ?? 0) * 30));

  return (
    <div>
      <header className="mb-6">
        <p className="dd-eyebrow">Make it, price it, scale it</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Costs &amp; volume</h1>
        <p className="mt-2 text-sm text-slate-500">
          What each product costs to make, your margin at list price, and — based on your forecast — how much
          more volume gets you to the next price break.
        </p>
      </header>

      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.skuId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
              <span className="text-xs text-slate-400">Forecast ~{p.forecastCasesPerMonth} cases/mo</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Cost to make / case" value={formatCents(p.mfgCostPerCaseCents)} />
              <Metric label="List price / case" value={formatCents(p.standardPriceCents)} />
              <Metric label="Margin at list" value={formatPercent(p.marginNowFraction)} tone={p.marginNowFraction >= 0.3 ? "text-emerald-600" : "text-amber-600"} />
              <Metric label="Your tier price" value={formatCents(p.currentTier.unitPriceCents)} />
            </div>

            {/* Volume ladder */}
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Volume price breaks</p>
              <div className="flex flex-wrap gap-2">
                {p.ladder.map((t) => {
                  const isCurrent = t === p.currentTier;
                  const isNext = t === p.nextTier;
                  return (
                    <span key={t.minQty} className={`rounded-lg px-2.5 py-1 text-xs ${isCurrent ? "bg-slate-900 text-white" : isNext ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" : "bg-slate-100 text-slate-600"}`}>
                      {t.minQty}{t.maxQty ? `–${t.maxQty}` : "+"} cases · {formatCents(t.unitPriceCents)}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Next-break callout */}
            {p.nextTier ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Move <strong>{p.casesToNextTier} more case{p.casesToNextTier === 1 ? "" : "s"}</strong> to hit {formatCents(p.nextUnitPriceCents ?? 0)}/case —
                worth about <strong>{formatCents(p.monthlySavingsAtNextCents)}/mo</strong> at your forecast. Good moment to ask for bulk pricing.
              </p>
            ) : (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">You’re at the top volume tier — best case price already applies.</p>
            )}
          </div>
        ))}
        {plans.length === 0 && <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">No products yet.</p>}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
