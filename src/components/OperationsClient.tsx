"use client";

/**
 * OperationsClient — inventory levels + production/reorder forecast, ship
 * pending orders (decrements stock), and receive produced stock. Actions run
 * server-side against the in-memory ops store.
 */
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import type { OpsResult } from "@/app/operations/actions";

export interface InvRow {
  skuId: string;
  name: string;
  onHandCases: number;
  reorderPointCases: number;
  velocityCasesPerDay: number;
  daysOfCover: number;
  belowReorderPoint: boolean;
  suggestedProduceCases: number;
  productionCostCents: number;
}

export interface OrderRow {
  id: string;
  company: string;
  totalCents: number;
  shipped: boolean;
}

export interface ShipmentRow {
  id: string;
  kind: string;
  refId: string;
  toCompany: string;
  shippingCostCents: number;
  createdAt: string;
  summary: string;
}

export function OperationsClient({
  inventory,
  totalProductionCostCents,
  orders,
  shipments,
  shipAction,
  receiveAction,
}: {
  inventory: InvRow[];
  totalProductionCostCents: number;
  orders: OrderRow[];
  shipments: ShipmentRow[];
  shipAction: (orderId: string) => Promise<OpsResult>;
  receiveAction: (skuId: string, cases: number) => Promise<OpsResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<OpsResult | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  function doShip(orderId: string) {
    setMsg(null);
    startTransition(async () => setMsg(await shipAction(orderId)));
  }
  function doReceive(skuId: string) {
    const cases = Math.floor(Number(receiveQty[skuId] || "0"));
    if (!cases) return;
    setMsg(null);
    startTransition(async () => {
      setMsg(await receiveAction(skuId, cases));
      setReceiveQty((p) => ({ ...p, [skuId]: "" }));
    });
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {msg.message}
        </p>
      )}

      {/* Inventory + reorder forecast */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Inventory & production forecast</h2>
          <span className="text-sm text-slate-500">
            Suggested run cost: <span className="font-semibold text-slate-800">{formatCents(totalProductionCostCents)}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 text-right font-medium">On hand</th>
                <th className="py-2 text-right font-medium">Sells/day</th>
                <th className="py-2 text-right font-medium">Days cover</th>
                <th className="py-2 text-center font-medium">Status</th>
                <th className="py-2 text-right font-medium">Produce</th>
                <th className="py-2 text-right font-medium">Run cost</th>
                <th className="py-2 text-right font-medium">Receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventory.map((r) => (
                <tr key={r.skuId}>
                  <td className="py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.onHandCases}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-500">{r.velocityCasesPerDay.toFixed(1)}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-600">
                    {Number.isFinite(r.daysOfCover) ? `${Math.round(r.daysOfCover)}d` : "—"}
                  </td>
                  <td className="py-2.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.belowReorderPoint ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {r.belowReorderPoint ? "reorder" : "ok"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-slate-900">
                    {r.suggestedProduceCases > 0 ? `${r.suggestedProduceCases} cs` : "—"}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-500">
                    {r.suggestedProduceCases > 0 ? formatCents(r.productionCostCents) : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min={0}
                        value={receiveQty[r.skuId] ?? ""}
                        onChange={(e) => setReceiveQty((p) => ({ ...p, [r.skuId]: e.target.value }))}
                        placeholder="cs"
                        className="w-14 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                      <button type="button" onClick={() => doReceive(r.skuId)} disabled={pending} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        Receive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Orders to ship */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Ship orders</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-400">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{o.id}</span> · {o.company} ·{" "}
                  <span className="tabular-nums text-slate-600">{formatCents(o.totalCents)}</span>
                </span>
                {o.shipped ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">shipped</span>
                ) : (
                  <button type="button" onClick={() => doShip(o.id)} disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                    Ship — OK it
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent shipments */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent shipments</h2>
        {shipments.length === 0 ? (
          <p className="text-sm text-slate-400">No shipments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {shipments.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span>
                  <span className="font-medium text-slate-800">{s.id}</span>{" "}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{s.kind}</span> · {s.toCompany} · {s.summary}
                </span>
                <span className="tabular-nums text-slate-500">freight {formatCents(s.shippingCostCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
