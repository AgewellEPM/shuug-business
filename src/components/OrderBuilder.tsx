"use client";

/**
 * OrderBuilder — pick a unit (cases or bottles) and quantity per SKU and watch
 * the order price live off the customer's volume tiers. Bottle lines are priced
 * per bottle (tier case price / bottles-per-case) and roll up to case-equivalents
 * for minimums. Each line's price can be overridden for this order only, and its
 * margin recolors so the consequence is obvious.
 */
import { computeMargin, evaluateGuardrail } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { formatPercent } from "@/lib/format";
import type { OrderPricing, OrderValidation } from "@/lib/pricing";
import type { OrderUnit, Sku } from "@/lib/data/model";
import type { PlaceOrderResult } from "@/app/customers/[id]/orders/actions";

const MARGIN_TINT = {
  above: "text-emerald-700",
  warn: "text-amber-700",
  critical: "text-red-700 font-semibold",
} as const;

export interface OrderBuilderProps {
  skus: Sku[];
  qtyById: Record<string, number>;
  onQty: (skuId: string, quantity: number) => void;
  unitById: Record<string, OrderUnit>;
  onUnit: (skuId: string, unit: OrderUnit) => void;
  overrideById: Record<string, string>;
  onOverride: (skuId: string, value: string) => void;
  targetFraction: number;
  floorFraction: number | null;
  pricing: OrderPricing;
  validation: OrderValidation;
  requiresPO: boolean;
  poNumber: string;
  onPO: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  result: PlaceOrderResult | null;
}

export function OrderBuilder(props: OrderBuilderProps) {
  const { skus, qtyById, unitById, onQty, onUnit, pricing, validation, requiresPO } = props;
  const lineBySku = new Map(pricing.lines.map((l) => [l.skuId, l]));
  const inputCls = "rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">New order</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 text-center font-medium">Unit</th>
              <th className="py-2 text-center font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit price</th>
              <th className="py-2 text-right font-medium">Override $</th>
              <th className="py-2 text-right font-medium">Margin</th>
              <th className="py-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {skus.map((sku) => {
              const line = lineBySku.get(sku.id);
              const unit = unitById[sku.id] ?? "case";
              const qty = qtyById[sku.id] ?? 0;
              const units = sku.unitsPerCase || 1;
              const costBasis = unit === "bottle" ? Math.round(sku.costPerCaseCents / units) : sku.costPerCaseCents;
              const effectiveUnit = line?.unitPriceCents ?? null;
              const margin = effectiveUnit === null ? null : computeMargin(costBasis, effectiveUnit);
              const status =
                margin === null
                  ? null
                  : evaluateGuardrail(margin.marginFraction, {
                      targetFraction: props.targetFraction,
                      floorFraction: props.floorFraction ?? undefined,
                    }).status;
              return (
                <tr key={sku.id}>
                  <td className="py-2.5 font-medium text-slate-800">
                    {sku.name}
                    {line?.isOverride && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">custom</span>
                    )}
                  </td>
                  <td className="py-2.5 text-center">
                    <select
                      value={unit}
                      onChange={(e) => onUnit(sku.id, e.target.value as OrderUnit)}
                      className="rounded-md border border-slate-300 px-1.5 py-1 text-sm focus:border-emerald-500 focus:outline-none"
                      aria-label={`${sku.name} unit`}
                    >
                      <option value="case">Cases</option>
                      <option value="bottle">Bottles</option>
                    </select>
                  </td>
                  <td className="py-2.5 text-center">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={qty}
                      onChange={(e) => onQty(sku.id, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className={`${inputCls} w-16 text-center`}
                      aria-label={`${sku.name} quantity`}
                    />
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-500">
                    {line && !line.isOverride ? `${formatCents(line.unitPriceCents)} (${line.tierLabel})` : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-slate-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={props.overrideById[sku.id] ?? ""}
                      onChange={(e) => props.onOverride(sku.id, e.target.value)}
                      placeholder="tier"
                      className={`${inputCls} w-16`}
                      aria-label={`${sku.name} override price`}
                    />
                  </td>
                  <td className={`py-2.5 text-right tabular-nums ${status ? MARGIN_TINT[status] : "text-slate-300"}`}>
                    {margin ? formatPercent(margin.marginFraction) : "—"}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-slate-900">
                    {line ? formatCents(line.lineTotalCents) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Subtotal ({validation.totalCases.toFixed(validation.totalCases % 1 === 0 ? 0 : 1)} case-equiv)</dt>
          <dd className="tabular-nums text-slate-800">{formatCents(pricing.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Freight · {pricing.freightNote}</dt>
          <dd className="tabular-nums text-slate-800">{formatCents(pricing.freightCents)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt className="text-slate-900">Order total</dt>
          <dd className="tabular-nums text-slate-900">{formatCents(pricing.totalCents)}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            PO number {requiresPO && <span className="text-red-600">*</span>}
          </span>
          <input
            type="text"
            value={props.poNumber}
            onChange={(e) => props.onPO(e.target.value)}
            placeholder={requiresPO ? "Required for this customer" : "Optional"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Note</span>
          <input
            type="text"
            value={props.note}
            onChange={(e) => props.onNote(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>

      {!validation.ok && (
        <ul className="mt-4 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {validation.violations.map((v) => (
            <li key={v.code + v.message}>⚠ {v.message}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={props.pending || !validation.ok}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {props.pending ? "Placing…" : "Place order"}
        </button>
        {props.result?.ok && (
          <span className="text-sm font-medium text-emerald-700">
            Order {props.result.orderId} placed
            {props.result.durable === false ? " (demo — not persisted)" : ""}
          </span>
        )}
        {props.result && !props.result.ok && props.result.error && (
          <span className="text-sm font-medium text-red-700">{props.result.error}</span>
        )}
      </div>
    </div>
  );
}
