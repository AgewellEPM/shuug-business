import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { getDealStore } from "@/lib/data/store";
import { loadAnalytics } from "@/lib/analytics/load";
import { distributionOverview } from "@/lib/distribution/summary";
import { coverageGaps } from "@/lib/distribution/coverage";
import { CHANNEL_LABELS } from "@/lib/data/model";
import { RouteOptimizer } from "@/components/RouteOptimizer";
import { optimizeRegionRouteAction } from "./actions";

export const dynamic = "force-dynamic";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);

const TABS = [
  { key: "territories", label: "Territories" },
  { key: "channels", label: "Channels" },
  { key: "coverage", label: "Coverage gaps" },
  { key: "reps", label: "Reps" },
  { key: "routes", label: "Routes" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function DistributionPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSectionAccess("distribution", "view");

  const { tab } = await searchParams;
  const active: TabKey = (TABS.find((t) => t.key === tab)?.key ?? "territories") as TabKey;

  const store = await getDealStore();
  const { analytics, customers, orders, skus } = await loadAnalytics(store);
  const o = distributionOverview(customers, analytics.byRegion, analytics.byOwner, analytics.byChannel);
  const gaps = active === "coverage" ? coverageGaps(customers, orders, skus) : null;

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Get your product on more shelves</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Distribution</h1>
        <p className="mt-2 text-sm text-slate-500">
          Where you sell, who covers it, and how it ships. Manage territories, channels and delivery runs in one place.
        </p>
      </header>

      {/* Headline */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accounts" value={String(o.totalAccounts)} />
        <Stat label="Territories" value={String(o.regionsCovered)} />
        <Stat label="Channels" value={String(o.channels.length)} />
        <Stat label="Delivery routes" value={String(o.routes.length)} />
      </div>

      {/* Tabs */}
      <div className="mb-5 flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/distribution?tab=${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              active === t.key ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <Link href="/visits" className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
          Store finder →
        </Link>
      </div>

      {active === "territories" && <Territories o={o} />}
      {active === "channels" && <Channels o={o} />}
      {active === "coverage" && gaps && <Coverage gaps={gaps} />}
      {active === "reps" && <Reps o={o} />}
      {active === "routes" && <Routes o={o} />}
    </div>
  );
}

type OProp = { o: Awaited<ReturnType<typeof distributionOverview>> };

function Territories({ o }: OProp) {
  if (o.territories.length === 0) return <Empty label="No territories yet — add customers with a region." />;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table head={["Territory", "Accounts", "Reps", "Channels", "Revenue"]}>
        {o.territories.map((t) => (
          <tr key={t.region} className="border-t border-slate-100">
            <Td><span className="font-medium text-slate-900">{t.region}</span></Td>
            <Td>{t.accounts}</Td>
            <Td className="text-slate-500">{t.owners.join(", ")}</Td>
            <Td className="text-slate-500">
              {Object.entries(t.channels).map(([c, n]) => `${CHANNEL_LABELS[c as keyof typeof CHANNEL_LABELS]} ${n}`).join(" · ")}
            </Td>
            <Td className="font-semibold tabular-nums text-slate-900">{money(t.revenueCents)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Channels({ o }: OProp) {
  if (o.channels.length === 0) return <Empty label="No channels with accounts yet." />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {o.channels.map((c) => (
        <div key={c.channel} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">{c.label}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c.accounts} account{c.accounts === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-900">{money(c.revenueCents)}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Revenue · {c.orderCount} orders</p>
            </div>
            <Link href={`/customers?channel=${c.channel}`} className="text-xs font-semibold text-emerald-700 hover:underline">
              View accounts →
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function Reps({ o }: OProp) {
  if (o.reps.length === 0) return <Empty label="No reps assigned yet." />;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table head={["Rep", "Accounts", "Territories", "Revenue"]}>
        {o.reps.map((r) => (
          <tr key={r.owner} className="border-t border-slate-100">
            <Td><span className="font-medium text-slate-900">{r.owner}</span></Td>
            <Td>{r.accounts}</Td>
            <Td className="text-slate-500">{r.regions.join(", ")}</Td>
            <Td className="font-semibold tabular-nums text-slate-900">{money(r.revenueCents)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Routes({ o }: OProp) {
  if (o.routes.length === 0) return <Empty label="No delivery routes — accounts ship by carrier or need a region." />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Accounts grouped by territory for delivery runs. Online orders ship by carrier and aren’t listed.
        Open <Link href="/visits" className="font-semibold text-emerald-700 hover:underline">Store finder</Link> to map a run.
      </p>
      {o.routes.map((g) => (
        <div key={g.region} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">{g.region}</h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{g.stops.length} stop{g.stops.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {g.stops.map((s) => (
              <li key={s.customerId} className="flex items-center gap-3 py-2">
                <Link href={`/customers/${s.customerId}`} className="text-sm font-medium text-slate-800 hover:text-emerald-700">{s.company}</Link>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">{CHANNEL_LABELS[s.channel]}</span>
                <span className="ml-auto truncate text-xs text-slate-400">{s.shippingAddress || "No address on file"}</span>
              </li>
            ))}
          </ul>
          {g.stops.length > 1 && <RouteOptimizer region={g.region} optimizeAction={optimizeRegionRouteAction} />}
        </div>
      ))}
    </div>
  );
}

function Coverage({ gaps }: { gaps: NonNullable<Awaited<ReturnType<typeof coverageGaps>>> }) {
  const withGaps = gaps.regionGaps.filter((r) => r.missing.length > 0);
  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Where to sell more</h2>
        {withGaps.length === 0 ? (
          <Empty label="Every territory carries your top products. 🎉" />
        ) : (
          <div className="space-y-2">
            {withGaps.map((r) => (
              <div key={r.region} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{r.region}</h3>
                  <span className="text-xs text-slate-500">{r.accounts} account{r.accounts === 1 ? "" : "s"} · {r.skusSold} products carried</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Not buying these top sellers yet:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.missing.map((m) => (
                    <span key={m.skuId} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-amber-200">
                      {m.name} <span className="text-slate-400">· {money(m.companyRevenueCents)} elsewhere</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Product reach</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table head={["Product", "Territories", "Reach", "Revenue"]}>
            {gaps.productReach.map((p) => {
              const pct = p.totalRegions ? Math.round((p.regions / p.totalRegions) * 100) : 0;
              return (
                <tr key={p.skuId} className="border-t border-slate-100">
                  <Td><span className="font-medium text-slate-900">{p.name}</span></Td>
                  <Td>{p.regions} of {p.totalRegions}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${pct >= 66 ? "bg-emerald-500" : pct >= 33 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{pct}%</span>
                    </div>
                  </Td>
                  <Td className="font-semibold tabular-nums text-slate-900">{money(p.revenueCents)}</Td>
                </tr>
              );
            })}
          </Table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
        <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
function Empty({ label }: { label: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{label}</div>;
}
