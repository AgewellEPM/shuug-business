"use client";

/**
 * CockpitWidgets — the body of each dashboard tile, rendered from the serializable
 * CockpitData. The Cockpit shell supplies the card chrome (title, pin/drag), so
 * these are just the contents. One switch, one responsibility.
 */
import Link from "next/link";
import type { CockpitData } from "@/lib/cockpit/data";
import { formatCents } from "@/lib/money";

const SEV_DOT: Record<string, string> = { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-slate-300" };
const rel = (iso: string) => (iso ? iso.slice(0, 10) : "");

export function WidgetBody({ id, data }: { id: string; data: CockpitData }) {
  switch (id) {
    case "kpis":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Sales recorded", value: formatCents(data.kpis.revenueCents) },
            { label: "Orders", value: String(data.kpis.orders) },
            { label: "Active customers", value: String(data.kpis.customers) },
            { label: "To fulfill", value: String(data.kpis.toFulfill) },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <p className="text-[11px] text-slate-400">{k.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{k.value}</p>
            </div>
          ))}
        </div>
      );

    case "needs-attention":
      return data.alerts.length === 0 ? (
        <Empty>All clear. 🎉</Empty>
      ) : (
        <ul className="space-y-1.5">
          {data.alerts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 flex-none rounded-full ${SEV_DOT[a.severity] ?? "bg-slate-300"}`} />
              <span className="min-w-0 flex-1 truncate text-slate-700"><strong className="text-slate-900">{a.title}</strong> — {a.detail}</span>
              <Link href={a.href} className="flex-none text-xs font-semibold text-emerald-700 hover:underline">{a.actionLabel} →</Link>
            </li>
          ))}
        </ul>
      );

    case "recent-orders":
      return data.recentOrders.length === 0 ? <Empty>No orders yet.</Empty> : (
        <table className="w-full text-sm">
          <tbody>
            {data.recentOrders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 first:border-0">
                <td className="py-2"><Link href={`/customers/${o.customerId}/orders`} className="font-medium text-slate-800 hover:underline">{o.company}</Link><span className="ml-2 text-xs text-slate-400">{rel(o.dateISO)}</span></td>
                <td className="py-2"><span className={`rounded px-2 py-0.5 text-[10px] ${o.status === "fulfilled" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{o.status === "fulfilled" ? "Fulfilled" : "To fulfill"}</span></td>
                <td className="py-2 text-right font-semibold tabular-nums">{formatCents(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "new-accounts":
      return data.newAccounts.length === 0 ? <Empty>No accounts yet.</Empty> : (
        <ul className="space-y-2">
          {data.newAccounts.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <Link href={`/customers/${c.id}`} className="font-medium text-slate-800 hover:underline">{c.company}</Link>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{c.channelLabel}</span>
              <span className="ml-auto text-xs text-slate-400">{c.region}</span>
            </li>
          ))}
        </ul>
      );

    case "channels":
      return <ChannelBars channels={data.channels} />;

    case "coverage-gaps":
      return data.coverage.length === 0 ? <Empty>Every territory carries your top sellers. 🎉</Empty> : (
        <div className="space-y-2">
          {data.coverage.map((r) => (
            <div key={r.region}>
              <p className="text-xs font-semibold text-slate-700">{r.region}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.missing.map((m) => <span key={m.name} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 ring-1 ring-amber-200">{m.name}</span>)}
              </div>
            </div>
          ))}
        </div>
      );

    case "territories":
      return (
        <ul className="space-y-1.5">
          {data.territories.map((t) => (
            <li key={t.region} className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-800">{t.region}</span>
              <span className="text-xs text-slate-400">{t.accounts} acct</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900">{formatCents(t.revenueCents)}</span>
            </li>
          ))}
        </ul>
      );

    case "contracts":
      return data.contracts.length === 0 ? <Empty>No renewals coming up.</Empty> : (
        <ul className="space-y-1.5">
          {data.contracts.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <Link href={`/customers/${c.id}`} className="font-medium text-slate-800 hover:underline">{c.company}</Link>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === "expired" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                {c.status === "expired" ? `Expired ${-c.days}d` : `${c.days}d left`}
              </span>
            </li>
          ))}
        </ul>
      );

    case "team-activity":
      return data.teamActivity.length === 0 ? <Empty>No completed work yet.</Empty> : (
        <ul className="space-y-1.5">
          {data.teamActivity.map((t, i) => (
            <li key={`${t.title}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="text-emerald-600">✓</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{t.title}</span>
              <span className="text-xs text-slate-400">{t.assignee}</span>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">+{t.xp}xp</span>
            </li>
          ))}
        </ul>
      );

    case "my-tasks":
      return data.myTasks.length === 0 ? <Empty>Nothing open. 🎉</Empty> : (
        <ul className="space-y-1.5">
          {data.myTasks.map((t, i) => (
            <li key={`${t.title}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-700">{t.title}</span>
              <span className="text-xs text-slate-400">{t.assignee}</span>
              {t.dueDate && <span className="text-[10px] tabular-nums text-slate-400">{t.dueDate.slice(5)}</span>}
            </li>
          ))}
        </ul>
      );

    case "low-stock":
      return data.lowStock.length === 0 ? <Empty>Stock looks healthy.</Empty> : (
        <ul className="space-y-1.5">
          {data.lowStock.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="text-amber-500">▲</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{s.detail}</span>
              <Link href={s.href} className="text-xs font-semibold text-emerald-700 hover:underline">Reorder →</Link>
            </li>
          ))}
        </ul>
      );

    case "marketing":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <p className="text-[11px] text-slate-400">Website sales</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">{formatCents(data.marketing.websiteRevenueCents)}</p>
            <p className="text-[11px] text-slate-400">{data.marketing.websiteOrders} orders</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <p className="text-[11px] text-slate-400">Amazon sales</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatCents(data.marketing.amazonRevenueCents)}</p>
            <Link href="/marketing" className="text-[11px] font-semibold text-emerald-700 hover:underline">Marketing →</Link>
          </div>
        </div>
      );

    case "top-products":
      return data.topProducts.length === 0 ? <Empty>No sales yet.</Empty> : (
        <ul className="space-y-1.5">
          {data.topProducts.map((p) => (
            <li key={p.name} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-700">{p.name}</span>
              <span className="font-semibold tabular-nums text-slate-900">{formatCents(p.revenueCents)}</span>
            </li>
          ))}
        </ul>
      );

    case "onboarding":
      return (
        <div className="space-y-2 text-sm">
          <Step done={data.onboarding.customers > 0} label="Add your buyers" href="/customers/new" />
          <Step done={data.onboarding.shopify} label="Connect your online store" href="/settings" />
          <Step done={data.onboarding.quickbooks} label="Connect QuickBooks" href="/settings" />
        </div>
      );

    default:
      return <Empty>Unknown widget.</Empty>;
  }
}

function ChannelBars({ channels }: { channels: CockpitData["channels"] }) {
  const max = Math.max(1, ...channels.map((c) => c.revenueCents));
  return (
    <div className="space-y-2">
      {channels.map((c) => (
        <div key={c.key} className="text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-700">{c.label} <span className="text-xs text-slate-400">· {c.accounts} acct</span></span>
            <span className="font-semibold tabular-nums text-slate-900">{formatCents(c.revenueCents)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((c.revenueCents / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Step({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${done ? "bg-emerald-100 text-emerald-700" : "border border-slate-200 text-slate-400"}`}>{done ? "✓" : "•"}</span>
      <span className={done ? "text-slate-400 line-through" : "text-slate-700"}>{label}</span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-center text-sm text-slate-400">{children}</p>;
}
