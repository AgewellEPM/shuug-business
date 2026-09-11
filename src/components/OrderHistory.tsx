"use client";

/**
 * OrderHistory — what they bought, at what price, with totals and status, plus
 * one-click reorder (prefills the builder with the same case counts). Newest
 * first. Presentational + an onReorder callback.
 */
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/format";
import type { Order, Sku } from "@/lib/data/model";

const STATUS_STYLE: Record<Order["status"], string> = {
  submitted: "bg-blue-100 text-blue-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-600",
};

export function OrderHistory({
  orders,
  skus,
  onReorder,
}: {
  orders: Order[];
  skus: Sku[];
  onReorder: (order: Order) => void;
}) {
  const nameById = new Map(skus.map((s) => [s.id, s.name]));

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        No orders yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{order.id}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[order.status]}`}>
                {order.status}
              </span>
              <span className="text-sm text-slate-500">{formatDate(order.createdAt)}</span>
              {order.poNumber && <span className="text-sm text-slate-400">PO {order.poNumber}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold tabular-nums text-slate-900">
                {formatCents(order.totalCents)}
              </span>
              <button
                type="button"
                onClick={() => onReorder(order)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
              >
                Reorder
              </button>
            </div>
          </div>
          <ul className="mt-2 text-sm text-slate-600">
            {order.lines.map((l) => (
              <li key={l.skuId} className="flex justify-between">
                <span>
                  {l.quantity} {l.unit === "bottle" ? "btl" : "cs"} × {nameById.get(l.skuId) ?? l.skuId}{" "}
                  <span className="text-slate-400">@ {formatCents(l.unitPriceCents)} ({l.tierLabel})</span>
                </span>
                <span className="tabular-nums">{formatCents(l.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
