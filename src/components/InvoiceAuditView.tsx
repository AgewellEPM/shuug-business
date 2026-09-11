/**
 * InvoiceAuditView — renders an audit report Bedrock-style: at-risk total, each
 * flagged overcharge traced to "unit $X vs your median $Y (n=Z)", and the clean
 * invoices. Presentational; works for any AuditReport (demo invoices or QB).
 */
import { formatCents } from "@/lib/money";
import type { AuditReport } from "@/lib/ops/invoice-audit";

export function InvoiceAuditView({ report, title }: { report: AuditReport; title: string }) {
  const flagged = report.invoices.filter((i) => i.status === "held");
  const clean = report.invoices.filter((i) => i.status === "clean");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">
            At risk <span className="ml-1 text-lg font-bold text-red-600 tabular-nums">{formatCents(report.totalAtRiskCents)}</span>
          </span>
          <span className="text-slate-500">
            Invoices <span className="ml-1 font-semibold text-slate-800 tabular-nums">{report.invoiceCount}</span>
          </span>
          <span className="text-slate-500">
            Held <span className="ml-1 font-semibold text-slate-800 tabular-nums">{report.flaggedInvoiceCount}</span>
          </span>
        </div>
      </div>

      {flagged.length > 0 && (
        <ul className="mb-4 space-y-2">
          {flagged.map((inv) => (
            <li key={inv.id} className="rounded-lg border border-red-200 bg-red-50/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">
                  {inv.vendor} · #{inv.invoiceNumber}
                </span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">held · {formatCents(inv.atRiskCents)}</span>
              </div>
              {inv.flags.map((f, i) => (
                <p key={i} className="mt-1 text-sm text-red-800">
                  Overcharge flagged — {formatCents(f.overchargeCents)}:{" "}
                  <span className="text-slate-700">
                    {f.itemCode}: unit {formatCents(f.unitPriceCents)} vs your median {formatCents(f.medianCents)} (n={f.samples})
                  </span>
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}

      {clean.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {clean.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-2">
              <span className="text-slate-700">{inv.vendor} · #{inv.invoiceNumber}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">clean</span>
            </li>
          ))}
        </ul>
      )}

      {report.invoiceCount === 0 && <p className="text-sm text-slate-400">No invoices to audit.</p>}
    </section>
  );
}
