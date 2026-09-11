/**
 * PricingMatrix — the whole wholesale business on one grid: every SKU's price
 * across Standard and each customer, instead of prices scattered through emails
 * and QuickBooks notes. Cells are tinted by margin health so a thin deal is
 * visible at a glance. Presentational.
 */
import Link from "next/link";
import { computeMargin, evaluateGuardrail } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import type { Sku } from "@/lib/data/model";

export interface MatrixColumn {
  customerId: string;
  company: string;
  targetFraction: number;
  floorFraction: number | null;
  /** skuId -> agreed base case price cents. */
  prices: Record<string, number>;
}

function cellTint(status: "above" | "warn" | "critical"): string {
  return status === "above"
    ? "text-slate-800"
    : status === "warn"
      ? "bg-amber-50 text-amber-900"
      : "bg-red-50 text-red-800 font-semibold";
}

export function PricingMatrix({ skus, columns }: { skus: Sku[]; columns: MatrixColumn[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="px-4 py-3 font-semibold text-slate-600">SKU</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Standard</th>
            {columns.map((c) => (
              <th key={c.customerId} className="px-4 py-3 text-right font-semibold text-slate-700">
                <Link href={`/customers/${c.customerId}`} className="hover:underline">
                  {c.company}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {skus.map((sku) => (
            <tr key={sku.id}>
              <td className="px-4 py-3 font-medium text-slate-800">{sku.name}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                {formatCents(sku.standardPriceCents)}
              </td>
              {columns.map((c) => {
                const price = c.prices[sku.id];
                if (price === undefined) {
                  return (
                    <td key={c.customerId} className="px-4 py-3 text-right text-slate-300">
                      —
                    </td>
                  );
                }
                const margin = computeMargin(sku.costPerCaseCents, price);
                const status = evaluateGuardrail(margin.marginFraction, {
                  targetFraction: c.targetFraction,
                  floorFraction: c.floorFraction ?? undefined,
                }).status;
                return (
                  <td
                    key={c.customerId}
                    className={`px-4 py-3 text-right tabular-nums ${cellTint(status)}`}
                  >
                    {formatCents(price)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
