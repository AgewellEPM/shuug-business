import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { getDealStore } from "@/lib/data/store";

// Always reflect the latest orders (demo store in memory, or Postgres).
export const dynamic = "force-dynamic";
import { loadAnalytics } from "@/lib/analytics/load";
import { formatCents } from "@/lib/money";
import { formatPercent } from "@/lib/format";
import { BarList, type BarItem } from "@/components/charts/BarList";
import { MonthTrend } from "@/components/charts/MonthTrend";
import { DayBars } from "@/components/charts/DayBars";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

const toBars = (
  rows: { key: string; label: string; revenueCents: number; orderCount: number }[],
  n = 6,
): BarItem[] =>
  rows.slice(0, n).map((r) => ({
    key: r.key,
    label: r.label,
    valueCents: r.revenueCents,
    sub: `${r.orderCount} order${r.orderCount === 1 ? "" : "s"}`,
  }));

export default async function AnalyticsPage() {
  await requireSectionAccess("money", "view");

  const store = await getDealStore();
  const { analytics: a } = await loadAnalytics(store);

  const mom =
    a.momGrowth === null
      ? "—"
      : `${a.momGrowth >= 0 ? "+" : ""}${formatPercent(a.momGrowth)}`;

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sales performance across products, regions, owners, and time.
          </p>
        </div>
        <Link
          href="/calendar"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          Calendar & margins →
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total revenue" value={formatCents(a.totalRevenueCents)} hint={`${a.orderCount} orders`} />
        <Kpi label="Avg order" value={formatCents(a.avgOrderCents)} hint={`${a.totalCases % 1 === 0 ? a.totalCases : a.totalCases.toFixed(1)} case-equiv`} />
        <Kpi label="Month over month" value={mom} hint="latest vs prior month" />
        <Kpi
          label="Forecast next month"
          value={a.forecastNextMonthCents === null ? "—" : formatCents(a.forecastNextMonthCents)}
          hint="trailing 3-mo avg"
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Avg sale / case" value={formatCents(a.avgCasePriceCents)} hint="blended across channels" />
        <Kpi label="Avg sale / bottle" value={formatCents(a.avgBottlePriceCents)} hint={`${a.totalBottles.toLocaleString()} bottles sold`} />
        <Kpi label="Cases sold" value={`${a.totalCases % 1 === 0 ? a.totalCases : a.totalCases.toFixed(1)}`} hint="case-equivalent" />
        <Kpi label="Channels" value={`${a.byChannel.length}`} hint="active sales channels" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Revenue by month">
            <MonthTrend points={a.byMonth} />
          </Card>
        </div>
        <Card title="Best sales days">
          <DayBars days={a.byDayOfWeek} />
        </Card>

        <Card title="Top sellers">
          <BarList items={toBars(a.topProducts)} />
        </Card>
        <Card title="By channel">
          <BarList items={toBars(a.byChannel)} accent="bg-rose-500" />
        </Card>
        <Card title="By region">
          <BarList items={toBars(a.byRegion)} accent="bg-sky-500" />
        </Card>
        <Card title="By account owner">
          <BarList items={toBars(a.byOwner)} accent="bg-violet-500" />
        </Card>

        <div className="lg:col-span-3">
          <Card title="Top customers">
            <BarList items={toBars(a.byCustomer, 10)} accent="bg-amber-500" />
          </Card>
        </div>
      </div>
    </div>
  );
}
