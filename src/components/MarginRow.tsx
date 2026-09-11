"use client";

/**
 * MarginRow — the deal desk's centerpiece. A controlled price slider for one
 * SKU that turns the price into its consequence in real time:
 *   your cost -> sell price -> gross profit -> margin %  (+ guardrail verdict)
 * and the discount vs standard wholesale. No blind number-dragging.
 */
import { computeMargin, discountFraction, evaluateGuardrail } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { formatPercent } from "@/lib/format";
import type { Sku } from "@/lib/data/model";

const STATUS_STYLE = {
  above: { badge: "bg-emerald-100 text-emerald-800 ring-emerald-600/20", bar: "accent-emerald-600", mark: "✓" },
  warn: { badge: "bg-amber-100 text-amber-900 ring-amber-600/30", bar: "accent-amber-500", mark: "⚠" },
  critical: { badge: "bg-red-100 text-red-800 ring-red-600/30", bar: "accent-red-600", mark: "✕" },
} as const;

export interface MarginRowProps {
  sku: Sku;
  sellCents: number;
  targetFraction: number;
  floorFraction: number | null;
  /** slider bounds in cents. */
  minCents: number;
  maxCents: number;
  onChange: (sellCents: number) => void;
}

export function MarginRow({
  sku,
  sellCents,
  targetFraction,
  floorFraction,
  minCents,
  maxCents,
  onChange,
}: MarginRowProps) {
  const margin = computeMargin(sku.costPerCaseCents, sellCents);
  const verdict = evaluateGuardrail(margin.marginFraction, {
    targetFraction,
    floorFraction: floorFraction ?? undefined,
  });
  const discount = discountFraction(sku.standardPriceCents, sellCents);
  const style = STATUS_STYLE[verdict.status];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{sku.name}</h3>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset ${style.badge}`}
          role="status"
          aria-label={`Margin status: ${verdict.status}`}
        >
          {style.mark} {formatPercent(margin.marginFraction)}
        </span>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="text-slate-500">Cost / case</dt>
        <dd className="text-right font-medium tabular-nums text-slate-700">
          {formatCents(sku.costPerCaseCents)}
        </dd>
      </dl>

      <label className="block">
        <span className="mb-1 flex items-baseline justify-between">
          <span className="text-sm text-slate-500">Customer price</span>
          <span className="text-2xl font-bold tabular-nums text-slate-900">{formatCents(sellCents)}</span>
        </span>
        <input
          type="range"
          min={minCents}
          max={maxCents}
          step={5}
          value={sellCents}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-full ${style.bar}`}
          aria-label={`${sku.name} customer price`}
        />
      </label>

      <div className="mt-2 flex items-center justify-end gap-4 text-sm">
        <label className="flex items-center gap-1 text-slate-500">
          $/case
          <input
            type="text"
            inputMode="decimal"
            value={(sellCents / 100).toFixed(2)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * 100));
            }}
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none"
            aria-label={`${sku.name} price per case`}
          />
        </label>
        <label className="flex items-center gap-1 text-slate-500">
          $/bottle
          <input
            type="text"
            inputMode="decimal"
            value={(sellCents / (sku.unitsPerCase || 1) / 100).toFixed(2)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * (sku.unitsPerCase || 1) * 100));
            }}
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none"
            aria-label={`${sku.name} price per bottle`}
          />
        </label>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-slate-500">Gross profit / case</dt>
        <dd className="text-right font-semibold tabular-nums text-slate-900">
          {formatCents(margin.grossProfitCents)}
        </dd>

        <dt className="text-slate-500">Gross profit / bottle</dt>
        <dd className="text-right tabular-nums text-slate-600">
          {formatCents(Math.round(margin.grossProfitCents / (sku.unitsPerCase || 1)))}
        </dd>

        <dt className="text-slate-500">Gross margin</dt>
        <dd className="text-right font-semibold tabular-nums text-slate-900">
          {formatPercent(margin.marginFraction)}
        </dd>

        <dt className="text-slate-500">Standard wholesale</dt>
        <dd className="text-right tabular-nums text-slate-600">{formatCents(sku.standardPriceCents)}</dd>

        <dt className="text-slate-500">Discount vs standard</dt>
        <dd className="text-right tabular-nums text-slate-600">{formatPercent(discount)}</dd>
      </dl>

      <p
        className={`mt-3 rounded-md px-3 py-2 text-sm ${
          verdict.status === "above"
            ? "bg-emerald-50 text-emerald-800"
            : verdict.status === "warn"
              ? "bg-amber-50 text-amber-900"
              : "bg-red-50 text-red-800"
        }`}
      >
        {verdict.message}
      </p>
    </section>
  );
}
