import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadWorkspace } from "@/lib/data/workspace";
import { BusinessDirectory } from "@/components/BusinessDirectory";
import { CHANNEL_LABELS, type CustomerChannel } from "@/lib/data/model";

export const dynamic = "force-dynamic";

const CHANNELS = Object.keys(CHANNEL_LABELS) as CustomerChannel[];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; order?: string; channel?: string }> }) {
  await requireSectionAccess("sales", "view");

  const [data, params] = await Promise.all([loadWorkspace(), searchParams]);
  const channel = CHANNELS.includes(params.channel as CustomerChannel) ? (params.channel as CustomerChannel) : null;

  // Filter to the chosen channel before the directory sees it, and keep orders
  // consistent with the visible accounts so any stats it shows still add up.
  const deals = channel ? data.deals.filter((d) => d.customer.channel === channel) : data.deals;
  const visibleIds = new Set(deals.map((d) => d.customer.id));
  const orders = channel ? data.orders.filter((o) => visibleIds.has(o.customerId)) : data.orders;

  // Preserve the search text when switching channel chips.
  const withQ = (c: CustomerChannel | null) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (c) sp.set("channel", c);
    const s = sp.toString();
    return s ? `/customers?${s}` : "/customers";
  };
  const chip = (c: CustomerChannel | null, label: string, count: number) => (
    <Link
      key={label}
      href={withQ(c)}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        (c ?? null) === channel ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {label} <span className={(c ?? null) === channel ? "text-slate-300" : "text-slate-400"}>{count}</span>
    </Link>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Channel</span>
        {chip(null, "All", data.deals.length)}
        {CHANNELS.map((c) => chip(c, CHANNEL_LABELS[c], data.deals.filter((d) => d.customer.channel === c).length))}
      </div>
      <BusinessDirectory {...data} deals={deals} orders={orders} mode="customers" query={params.q || ""} orderMode={params.order === "1"} />
    </div>
  );
}
