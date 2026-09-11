import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { marketingSummary, channelSales, trailingChannelRevenueCents, ROAS_WINDOW_DAYS } from "@/lib/marketing/summary";
import { getDealStore } from "@/lib/data/store";
import { loadAnalytics } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
const roasText = (r: number | null) => (r === null ? "—" : `${r.toFixed(2)}×`);

export default async function MarketingPage() {
  await requireSectionAccess("marketing", "view");

  const { channels, totalCampaigns, totalDailyBudgetCents, connectedChannels } = marketingSummary();

  // Pipe real storefront sales in: the Online channel IS the website.
  const store = await getDealStore();
  const { analytics, orders, customers } = await loadAnalytics(store);
  const website = channelSales(analytics.byChannel, "Online");
  const amazonSales = channelSales(analytics.byChannel, "Amazon");

  // ROAS: match ad spend to the revenue it drove over the SAME trailing window.
  // Amazon spend is estimated from active daily budgets; Google spend needs a live
  // pull we don't have yet, so it stays honestly blank.
  const now = new Date();
  const amazonChannel = channels.find((c) => c.key === "amazon");
  const amazonSpend30Cents = (amazonChannel?.dailyBudgetCents ?? 0) * ROAS_WINDOW_DAYS;
  const amazonRev30Cents = trailingChannelRevenueCents(orders, customers, "Amazon", now);
  const amazonRoas: number | null = null; // Actual ad-attributed sales and spend are shown in Amazon performance reports.

  return (
    <div>
      <header className="mb-6">
        <p className="dd-eyebrow">Grow your business</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Marketing</h1>
        <p className="mt-2 text-sm text-slate-500">
          Every place you advertise and sell online, in one spot. See what you spend on ads next to the
          workspace orders alongside campaign budgets.
        </p>
      </header>

      <Link href="/social" className="mb-6 block rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-semibold text-emerald-950">Social marketing</h2><p className="mt-2 text-sm text-emerald-900">Drop a website or social profile link. Track your brand and competitors, plan posts and create campaign artwork.</p><span className="mt-3 inline-block text-sm font-semibold text-emerald-800">Open social workspace →</span></Link>

      {/* Headline numbers across all channels */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Website sales" value={money(website.revenueCents)} tone="text-emerald-700" />
        <Stat
          label="Amazon ad ROAS"
          value={roasText(amazonRoas)}
          tone={amazonRoas !== null && amazonRoas >= 1 ? "text-emerald-700" : amazonRoas !== null ? "text-red-600" : "text-slate-400"}
        />
        <Stat label="Active campaigns" value={`${totalCampaigns} · ${connectedChannels}/${channels.length} live`} />
        <Stat label="Daily ad budget" value={money(totalDailyBudgetCents)} />
      </div>

      {/* Website / online store — piped from real order analytics */}
      <section className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Website store</h2>
            <p className="text-xs text-slate-500">Recorded online orders — includes demo history when using the local sample workspace.</p>
          </div>
          <Link href="/analytics" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
            Full report →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Mini label="Revenue" value={money(website.revenueCents)} tone="text-emerald-700" />
          <Mini label="Orders" value={String(website.orders)} />
          <Mini label="Avg order" value={money(website.aovCents)} />
        </div>
      </section>

      {/* One card per ad channel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {channels.map((c) => {
          const sales = c.key === "amazon" ? amazonSales : null;
          return (
            <Link
              key={c.key}
              href={c.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{c.label}</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    c.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {c.connected ? (c.live ? "Live" : "Connected") : "Not connected"}
                </span>
              </div>

              {c.connected ? (
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <Mini label="Campaigns" value={String(c.campaigns)} />
                  <Mini label="Running" value={String(c.activeCampaigns)} tone={c.activeCampaigns > 0 ? "text-emerald-600" : undefined} />
                  <Mini label="Daily budget" value={money(c.dailyBudgetCents)} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Connect {c.label} in Settings to build campaigns and pull results here.
                </p>
              )}

              {/* For Amazon, tie spend to the marketplace revenue it drove (ROAS). */}
              {c.key === "amazon" && c.connected && (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Last {ROAS_WINDOW_DAYS} days · Amazon sales</span>
                    <strong className="text-slate-900">{money(amazonRev30Cents)}</strong>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span>30-day budget at today’s pace</span>
                    <strong className="text-slate-900">{money(amazonSpend30Cents)}</strong>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1">
                    <span className="font-medium">Actual ad ROAS · open performance report</span>
                    <strong className={amazonRoas !== null && amazonRoas >= 1 ? "text-emerald-700" : amazonRoas !== null ? "text-red-600" : "text-slate-400"}>
                      {roasText(amazonRoas)}
                    </strong>
                  </div>
                  {sales && sales.orders > 0 && (
                    <p className="mt-1 text-[11px] text-slate-400">All-time: {money(sales.revenueCents)} from {sales.orders} order{sales.orders === 1 ? "" : "s"}</p>
                  )}
                </div>
              )}
              {c.key === "google" && c.connected && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
                  Turn on campaign push and pull a report to see Google spend &amp; ROAS here.
                </p>
              )}

              {c.needsAttention > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                  ⚠ {c.needsAttention} campaign{c.needsAttention === 1 ? "" : "s"} need a look
                </p>
              )}

              <p className="mt-4 text-sm font-semibold text-emerald-700 group-hover:underline">
                Open {c.label} →
              </p>
            </Link>
          );
        })}
      </div>

      {/* Plain-language "what this does" so a non-technical owner isn't lost */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-sm font-semibold text-slate-700">What marketing does for you</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>• <strong>Website store</strong> is what your own site sells directly — the numbers above come from recorded workspace orders.</li>
          <li>• <strong>Google Ads</strong> puts your products in front of people searching the web.</li>
          <li>• <strong>Amazon Ads</strong> promotes your listings to shoppers already on Amazon.</li>
          <li>• Use platform performance reports for actual spend and ad-attributed sales. Budgets are planned limits.</li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
