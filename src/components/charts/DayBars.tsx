/**
 * DayBars — vertical bars of revenue by day of week ("what days did better").
 * Dependency-free CSS bars; the best day is highlighted.
 */
import { formatCents } from "@/lib/money";
import type { DayPoint } from "@/lib/analytics/metrics";

export function DayBars({ days }: { days: DayPoint[] }) {
  const max = Math.max(...days.map((d) => d.revenueCents), 1);
  const bestDow = days.reduce((best, d) => (d.revenueCents > best.revenueCents ? d : best), days[0]);

  return (
    <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
      {days.map((d) => {
        const isBest = d.dow === bestDow.dow && d.revenueCents > 0;
        return (
          <div key={d.dow} className="flex flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[10px] tabular-nums text-slate-400">
              {d.revenueCents > 0 ? formatCents(d.revenueCents) : ""}
            </span>
            <div
              className={`w-full rounded-t ${isBest ? "bg-emerald-600" : "bg-slate-300"}`}
              style={{ height: `${Math.max(2, (d.revenueCents / max) * 100)}%` }}
              title={`${d.label}: ${formatCents(d.revenueCents)}`}
            />
            <span className={`mt-1 text-xs ${isBest ? "font-semibold text-emerald-700" : "text-slate-500"}`}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
