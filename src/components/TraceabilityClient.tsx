"use client";

/**
 * TraceabilityClient — the FSMA-204 surface: lots by expiry, a one-box recall
 * lookup (who got this lot / what it was made from), and the 24-hour FDA export.
 */
import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { RecallTrace } from "@/lib/ops/lots";

export interface LotExpiryRow {
  lotCode: string;
  product: string;
  remainingCases: number;
  expiresOn: string;
  daysToExpiry: number;
  expired: boolean;
}

export function TraceabilityClient({
  lots,
  recallAction,
}: {
  lots: LotExpiryRow[];
  recallAction: (lotCode: string) => Promise<RecallTrace>;
}) {
  const [code, setCode] = useState("");
  const [trace, setTrace] = useState<RecallTrace | null>(null);
  const [pending, startTransition] = useTransition();

  function run(lotCode: string) {
    setCode(lotCode);
    startTransition(async () => setTrace(await recallAction(lotCode)));
  }

  return (
    <div className="space-y-6">
      {/* Recall lookup */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Recall lookup</h2>
        <p className="mb-3 text-sm text-slate-500">Type a lot code — we&apos;ll show who received it and what it was made from.</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(code)}
            placeholder="e.g. AMBA-2608"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button type="button" onClick={() => run(code)} disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            {pending ? "Tracing…" : "Trace lot"}
          </button>
        </div>

        {trace && trace.lotCode && (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="font-semibold text-slate-800">Shipped to ({trace.shippedTo.length})</p>
              {trace.shippedTo.length === 0 ? (
                <p className="text-slate-400">Not shipped to any customer yet.</p>
              ) : (
                <ul className="mt-1 divide-y divide-slate-100">
                  {trace.shippedTo.map((s, i) => (
                    <li key={i} className="flex justify-between py-1.5">
                      <span className="text-slate-700">{s.customer} · {s.reference}</span>
                      <span className="tabular-nums text-slate-500">{s.quantityCases} cs · {formatDate(s.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-800">Made from lots</p>
              <p className="text-slate-600">{trace.madeFromLotCodes.length ? trace.madeFromLotCodes.join(", ") : "—"}</p>
            </div>
            <p className="text-xs text-slate-400">{trace.events.length} tracking events on this lot.</p>
          </div>
        )}
        {trace && !trace.lotCode && <p className="mt-3 text-sm text-slate-400">Enter a lot code above.</p>}
      </section>

      {/* Lots by expiry */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lots — by expiry (FEFO)</h2>
          <a href="/api/traceability/export" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Download FDA export (CSV)
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 font-medium">Lot code</th>
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 text-right font-medium">On hand</th>
                <th className="py-2 font-medium">Expires</th>
                <th className="py-2 text-center font-medium">Status</th>
                <th className="py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lots.map((l) => (
                <tr key={l.lotCode}>
                  <td className="py-2.5 font-mono text-xs text-slate-700">{l.lotCode}</td>
                  <td className="py-2.5 text-slate-700">{l.product}</td>
                  <td className="py-2.5 text-right tabular-nums">{l.remainingCases}</td>
                  <td className="py-2.5 text-slate-600">{formatDate(l.expiresOn)}</td>
                  <td className="py-2.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.expired ? "bg-red-100 text-red-800" : l.daysToExpiry < 90 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
                      {l.expired ? "expired" : `${l.daysToExpiry}d`}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button type="button" onClick={() => run(l.lotCode)} className="text-sm text-emerald-700 hover:underline">Trace</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
