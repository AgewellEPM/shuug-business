import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadReconciliation } from "@/lib/reconcile/load";
import type { ReconStatus } from "@/lib/reconcile/engine";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS_BANNER: Record<string, { label: string; tone: string }> = {
  reconciled: { label: "Reconciled — your books tie out", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  mismatched: { label: "Mismatches found — review below", tone: "border-red-200 bg-red-50 text-red-800" },
  unmapped: { label: "Records need mapping to your accounting system", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  "not-connected": { label: "Accounting not connected — showing your side only", tone: "border-slate-200 bg-slate-50 text-slate-600" },
};
const LINE_TONE: Record<ReconStatus, string> = { match: "text-emerald-700", mismatch: "text-red-600", unknown: "text-slate-400" };

export default async function ReconcilePage() {
  await requireSectionAccess("money", "view");

  const r = await loadReconciliation();
  const banner = STATUS_BANNER[r.status];

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Trust the numbers</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Accounting reconciliation</h1>
        <p className="mt-2 text-sm text-slate-500">
          Map your customers, products, invoices, payments and taxes to {r.accountingSystem}, and see any mismatch —
          we surface differences instead of hiding them, so reports come from records that tie out.
        </p>
      </header>

      <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${banner.tone}`}>
        <span className="text-sm font-semibold">{banner.label}</span>
        <span className="ml-auto text-xs">{r.mismatches} mismatch{r.mismatches === 1 ? "" : "es"} · {r.unmapped} unmapped</span>
        {!r.connected && <Link href="/settings" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Connect QuickBooks →</Link>}
      </div>

      {/* Totals reconciliation */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="p-5 pb-2 text-sm font-semibold text-slate-900">Totals</h2>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[520px] text-right text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="py-2 text-left">Account</th><th className="py-2">Our system</th><th className="py-2">{r.accountingSystem}</th><th className="py-2">Variance</th><th className="py-2 text-center">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.lines.map((l) => (
                <tr key={l.key}>
                  <td className="py-2.5 text-left text-slate-700">{l.label}</td>
                  <td className="py-2.5 tabular-nums text-slate-900">{formatCents(l.localCents)}</td>
                  <td className="py-2.5 tabular-nums text-slate-500">{l.accountingCents === null ? "—" : formatCents(l.accountingCents)}</td>
                  <td className={`py-2.5 tabular-nums ${l.varianceCents && l.varianceCents !== 0 ? "text-red-600" : "text-slate-400"}`}>{l.varianceCents === null ? "—" : formatCents(l.varianceCents)}</td>
                  <td className={`py-2.5 text-center text-xs font-semibold uppercase ${LINE_TONE[l.status]}`}>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mapping coverage */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Mapping coverage</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {r.coverage.map((c) => (
            <div key={c.entity} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{c.entity}</h3>
                <span className={`text-sm font-bold tabular-nums ${c.pctMapped === 100 ? "text-emerald-700" : "text-amber-700"}`}>{c.pctMapped}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c.pctMapped === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${c.pctMapped}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500">{c.mapped} of {c.total} mapped to {r.accountingSystem}</p>
              {c.unmapped.length > 0 && <p className="mt-1 truncate text-[11px] text-amber-700">Needs mapping: {c.unmapped.slice(0, 4).map((u) => u.label).join(", ")}{c.unmapped.length > 4 ? ` +${c.unmapped.length - 4}` : ""}</p>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">When QuickBooks is connected, the accounting column fills in and any difference is flagged — nothing is silently reconciled. <Link href="/api/v1/reconcile" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link></p>
      </section>
    </div>
  );
}
