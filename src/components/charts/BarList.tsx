/**
 * BarList — horizontal labeled bars for ranked revenue (top products, by
 * region, by owner, by customer). Dependency-free; width is % of the max.
 */
import { formatCents } from "@/lib/money";

export interface BarItem {
  key: string;
  label: string;
  valueCents: number;
  sub?: string;
}

export function BarList({
  items,
  accent = "bg-emerald-500",
  empty = "No data yet.",
}: {
  items: BarItem[];
  accent?: string;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{empty}</p>;
  }
  const max = Math.max(...items.map((i) => i.valueCents), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="tabular-nums text-slate-600">{formatCents(item.valueCents)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${accent}`}
              style={{ width: `${Math.max(2, (item.valueCents / max) * 100)}%` }}
            />
          </div>
          {item.sub && <p className="mt-0.5 text-xs text-slate-400">{item.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
