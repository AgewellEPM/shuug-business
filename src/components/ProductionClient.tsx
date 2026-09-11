"use client";

/**
 * ProductionClient — recipes with true cost/case, one-click "make a batch"
 * (creates a lot + adds inventory + logs traceability), plus labels/allergens
 * and HACCP status.
 */
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import type { ProduceResult } from "@/app/production/actions";

export interface RecipeRow {
  skuId: string;
  name: string;
  costPerCaseCents: number;
  batchYieldCases: number;
  allergens: string[];
}
export interface LabelRow {
  skuId: string;
  name: string;
  ingredientsStatement: string;
  containsStatement: string;
  netWeight: string;
  shelfLifeDays: number;
  ok: boolean;
  issues: string[];
}
export interface HaccpRow {
  ccp: string;
  criticalLimit: string;
  measured: string;
  withinLimit: boolean;
  lotCode: string | null;
}

export function ProductionClient({
  recipes,
  labels,
  haccp,
  produceAction,
}: {
  recipes: RecipeRow[];
  labels: LabelRow[];
  haccp: { total: number; outOfLimit: number; openCorrectiveActions: number; rows: HaccpRow[] };
  produceAction: (skuId: string, batches: number) => Promise<ProduceResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<ProduceResult | null>(null);
  const [batches, setBatches] = useState<Record<string, string>>({});

  function produce(skuId: string) {
    const n = Math.max(1, Math.floor(Number(batches[skuId] || "1")));
    setMsg(null);
    startTransition(async () => setMsg(await produceAction(skuId, n)));
  }

  return (
    <div className="space-y-6">
      {msg && <p className={`rounded-lg px-3 py-2 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.message}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recipes & production</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 text-right font-medium">Cost / case</th>
                <th className="py-2 text-center font-medium">Batch yield</th>
                <th className="py-2 font-medium">Allergens</th>
                <th className="py-2 text-right font-medium">Make a batch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recipes.map((r) => (
                <tr key={r.skuId}>
                  <td className="py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatCents(r.costPerCaseCents)}</td>
                  <td className="py-2.5 text-center tabular-nums text-slate-600">{r.batchYieldCases} cs</td>
                  <td className="py-2.5 text-slate-600">{r.allergens.length ? r.allergens.join(", ") : "—"}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" min={1} value={batches[r.skuId] ?? "1"} onChange={(e) => setBatches((p) => ({ ...p, [r.skuId]: e.target.value }))} className="w-14 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none" />
                      <button type="button" onClick={() => produce(r.skuId)} disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Produce</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Labels & allergens</h2>
        <ul className="space-y-3">
          {labels.map((l) => (
            <li key={l.skuId} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{l.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{l.ok ? "label complete" : `${l.issues.length} to fix`}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{l.ingredientsStatement}</p>
              <p className="mt-0.5 text-sm font-medium text-slate-800">{l.containsStatement || "No major allergens declared"}</p>
              <p className="mt-0.5 text-xs text-slate-400">{l.netWeight} · best-by {l.shelfLifeDays} days</p>
              {!l.ok && <p className="mt-1 text-xs text-amber-700">{l.issues.join(" ")}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">HACCP checks</h2>
          <span className="text-sm text-slate-500">
            {haccp.outOfLimit === 0 ? <span className="text-emerald-700">All {haccp.total} within limits</span> : <span className="text-red-700">{haccp.outOfLimit} out of limit</span>}
            {haccp.openCorrectiveActions > 0 && <span className="ml-2 text-amber-700">· {haccp.openCorrectiveActions} need corrective action</span>}
          </span>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {haccp.rows.map((c, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span className="text-slate-700">{c.ccp} <span className="text-slate-400">({c.criticalLimit})</span>{c.lotCode ? ` · ${c.lotCode}` : ""}</span>
              <span className={c.withinLimit ? "text-emerald-700" : "text-red-700"}>{c.measured} {c.withinLimit ? "✓" : "✕"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
