import { requireSectionAccess } from "@/lib/permissions/guard";
import { loadCashFlowAsync } from "@/lib/cashflow/load";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const wk = (ms: number) => new Date(ms).toISOString().slice(5, 10);

export default async function CashFlowPage() {
  await requireSectionAccess("money", "view");

  const base = await loadCashFlowAsync();
  const late = await loadCashFlowAsync(undefined, 14); // "what if collections slip 2 weeks"
  const a = base.arAging;

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">See it before it&apos;s tight</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Cash flow</h1>
        <p className="mt-2 text-sm text-slate-500">
          A forward look at cash: expected collections in, bills and payroll out, week by week. Confirmed
          balance and forecast are kept separate — this is a projection, not a bank balance.
        </p>
      </header>

      {/* Runway + scenario */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={`rounded-2xl border p-5 shadow-sm ${base.goesNegative ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50/50"}`}>
          <p className="text-xs uppercase tracking-wide text-slate-500">Lowest projected balance</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${base.goesNegative ? "text-red-700" : "text-emerald-700"}`}>{formatCents(base.lowestBalanceCents)}</p>
          <p className="text-xs text-slate-500">week of {wk(base.lowestWeekStartMs)}{base.goesNegative ? " — cash goes negative" : " — stays positive"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Expected in (12 wk)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{formatCents(base.totalExpectedInCents)}</p>
          <p className="text-xs text-slate-400">out {formatCents(base.totalExpectedOutCents)}</p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${late.goesNegative && !base.goesNegative ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs uppercase tracking-wide text-slate-500">Stress test: collections 2 wks late</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${late.goesNegative ? "text-red-700" : "text-slate-900"}`}>{formatCents(late.lowestBalanceCents)}</p>
          <p className="text-xs text-slate-500">{late.goesNegative ? "would go negative" : "still positive"} · Δ {formatCents(late.lowestBalanceCents - base.lowestBalanceCents)}</p>
        </div>
      </div>

      {base.openingCents === 0 && (
        <p className="mb-5 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">Opening balance is $0 — set <code>OPENING_CASH_CENTS</code> (or connect a bank) for an accurate runway. The shape of the forecast is still real.</p>
      )}

      {/* Weekly calendar */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="p-5 pb-2 text-sm font-semibold text-slate-900">12-week cash calendar</h2>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[560px] text-right text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="py-2 text-left">Week of</th><th className="py-2">In</th><th className="py-2">Out</th><th className="py-2">Net</th><th className="py-2">Ending</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {base.weeks.map((w) => (
                <tr key={w.weekStartMs}>
                  <td className="py-2 text-left text-slate-600">{wk(w.weekStartMs)}</td>
                  <td className="py-2 tabular-nums text-emerald-700">{w.inflowCents ? formatCents(w.inflowCents) : "—"}</td>
                  <td className="py-2 tabular-nums text-slate-500">{w.outflowCents ? `(${formatCents(w.outflowCents)})` : "—"}</td>
                  <td className={`py-2 tabular-nums ${w.netCents < 0 ? "text-red-600" : "text-slate-700"}`}>{formatCents(w.netCents)}</td>
                  <td className={`py-2 font-semibold tabular-nums ${w.endingBalanceCents < 0 ? "text-red-700" : "text-slate-900"}`}>{formatCents(w.endingBalanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* A/R aging */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Who owes you (A/R aging)</h2>
          <span className="text-xs text-slate-400">Total {formatCents(a.totalCents)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Age label="Current" cents={a.currentCents} tone="text-emerald-700" />
          <Age label="1–30 days" cents={a.d1_30Cents} tone="text-amber-700" />
          <Age label="31–60 days" cents={a.d31_60Cents} tone="text-orange-700" />
          <Age label="61–90 days" cents={a.d61_90Cents} tone="text-red-600" />
          <Age label="90+ days" cents={a.d90plusCents} tone="text-red-700" />
        </div>
      </section>
    </div>
  );
}

function Age({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-center">
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{formatCents(cents)}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
