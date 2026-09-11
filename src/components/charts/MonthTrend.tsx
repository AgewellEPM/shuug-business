/**
 * MonthTrend — a lightweight SVG line chart of monthly revenue (month-over-
 * month). Dependency-free. Renders a filled area + line + end-point dots.
 */
import { formatCents } from "@/lib/money";
import type { MonthPoint } from "@/lib/analytics/metrics";

const W = 560;
const H = 160;
const PAD = 8;

export function MonthTrend({ points }: { points: MonthPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-400">No monthly data yet.</p>;
  }
  if (points.length === 1) {
    return (
      <p className="text-sm text-slate-600">
        {points[0].month}: <span className="font-semibold">{formatCents(points[0].revenueCents)}</span>{" "}
        <span className="text-slate-400">(need ≥2 months for a trend)</span>
      </p>
    );
  }

  const max = Math.max(...points.map((p) => p.revenueCents), 1);
  const stepX = (W - PAD * 2) / (points.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const coords = points.map((p, i) => ({ x: PAD + i * stepX, y: y(p.revenueCents), p }));
  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${PAD + (points.length - 1) * stepX},${H - PAD}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly revenue trend">
        <polygon points={area} fill="rgb(16 185 129 / 0.12)" />
        <polyline points={line} fill="none" stroke="rgb(5 150 105)" strokeWidth={2} />
        {coords.map((c) => (
          <circle key={c.p.month} cx={c.x} cy={c.y} r={3} fill="rgb(5 150 105)" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        {points.map((p) => (
          <span key={p.month}>{p.month.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}
