/**
 * loadCockpitData — one server-side gather of everything every cockpit widget
 * could need, in a plain-serializable shape to hand to the client Cockpit. The
 * client only renders; all business math happens here and in the pure libs.
 */
import { loadWorkspace } from "../data/workspace";
import { computeAnalytics } from "../analytics/metrics";
import { loadAlerts } from "../alerts/load";
import { distributionOverview } from "../distribution/summary";
import { coverageGaps } from "../distribution/coverage";
import { channelSales } from "../marketing/summary";
import { contractStatus, daysUntil, type ContractStatus } from "../contracts/status";
import { listTasks } from "../tasks/store";
import { listTeam } from "../team/store";
import { getIntegrationStatuses } from "../integrations/status";
import { CHANNEL_LABELS } from "../data/model";
import { cookies } from "next/headers";
import { salesChannel, type SalesChannel } from "../data/channels";

/** The channel the owner selected in the top toggle (cookie-persisted). */
async function selectedChannel(): Promise<SalesChannel> {
  try {
    const v = (await cookies()).get("dd_channel")?.value;
    return v === "bulk" || v === "stores" || v === "online" ? v : "all";
  } catch {
    return "all";
  }
}

export interface CockpitData {
  kpis: { revenueCents: number; orders: number; customers: number; toFulfill: number };
  alerts: { id: string; severity: string; category: string; title: string; detail: string; href: string; actionLabel: string }[];
  alertCounts: { critical: number; warning: number; info: number };
  recentOrders: { id: string; company: string; dateISO: string; status: string; totalCents: number; customerId: string }[];
  newAccounts: { id: string; company: string; channelLabel: string; region: string }[];
  channels: { key: string; label: string; revenueCents: number; accounts: number }[];
  coverage: { region: string; missing: { name: string; companyRevenueCents: number }[] }[];
  territories: { region: string; accounts: number; revenueCents: number }[];
  contracts: { id: string; company: string; status: ContractStatus; days: number }[];
  teamActivity: { title: string; assignee: string; xp: number; completedAtISO: string }[];
  myTasks: { title: string; assignee: string; priority: string; dueDate: string | null; storyPoints: number }[];
  lowStock: { title: string; detail: string; href: string }[];
  marketing: { websiteRevenueCents: number; websiteOrders: number; amazonRevenueCents: number };
  topProducts: { name: string; revenueCents: number }[];
  onboarding: { durable: boolean; shopify: boolean; quickbooks: boolean; customers: number };
}

export async function loadCockpitData(): Promise<CockpitData> {
  const { deals, orders, durable } = await loadWorkspace();
  const skus = deals[0]?.skus ?? [];

  // Honor the top channel toggle: scope customers + orders to the chosen channel
  // so every number on the cockpit reflects "what data is showing me".
  const channel = await selectedChannel();
  const scopedDeals = channel === "all" ? deals : deals.filter((d) => salesChannel(d.customer.channel) === channel);
  const scopedIds = new Set(scopedDeals.map((d) => d.customer.id));
  const customers = scopedDeals.map((d) => d.customer);
  const live = orders.filter((o) => o.status !== "cancelled" && (channel === "all" || scopedIds.has(o.customerId)));
  const analytics = computeAnalytics(live, customers, skus);

  const companyById = new Map(deals.map((d) => [d.customer.id, d.customer.company]));
  const teamName = new Map(listTeam().map((m) => [m.id, m.name]));

  const { alerts, counts } = await loadAlerts();
  const dist = distributionOverview(customers, analytics.byRegion, analytics.byOwner, analytics.byChannel);
  const gaps = coverageGaps(customers, orders, skus);
  const today = new Date().toISOString().slice(0, 10);

  const tasks = listTasks();
  const teamActivity = tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 6)
    .map((t) => ({ title: t.title, assignee: t.assigneeId ? teamName.get(t.assigneeId) ?? t.assigneeId : "Unassigned", xp: t.xp, completedAtISO: t.completedAt as string }));
  const myTasks = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 6)
    .map((t) => ({ title: t.title, assignee: t.assigneeId ? teamName.get(t.assigneeId) ?? t.assigneeId : "Unassigned", priority: t.priority, dueDate: t.dueDate, storyPoints: t.storyPoints }));

  const integrations = getIntegrationStatuses();
  const isOn = (kind: string) => !!integrations.find((c) => c.kind === kind)?.connected;

  return {
    kpis: {
      revenueCents: analytics.totalRevenueCents,
      orders: live.length,
      customers: customers.length,
      toFulfill: live.filter((o) => o.status === "submitted").length,
    },
    alerts: alerts.slice(0, 6).map((a) => ({ id: a.id, severity: a.severity, category: a.category, title: a.title, detail: a.detail, href: a.href, actionLabel: a.actionLabel })),
    alertCounts: counts,
    recentOrders: live
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6)
      .map((o) => ({ id: o.id, company: companyById.get(o.customerId) ?? o.customerId, dateISO: o.createdAt, status: o.status, totalCents: o.totalCents, customerId: o.customerId })),
    // No created timestamp on Customer; the store appends new accounts, so the
    // tail is the most-recently-added. Reverse to show newest first.
    newAccounts: customers
      .slice()
      .reverse()
      .slice(0, 5)
      .map((c) => ({ id: c.id, company: c.company, channelLabel: CHANNEL_LABELS[c.channel], region: c.region?.trim() || "—" })),
    channels: dist.channels.map((c) => ({ key: c.channel, label: c.label, revenueCents: c.revenueCents, accounts: c.accounts })),
    coverage: gaps.regionGaps.filter((r) => r.missing.length > 0).slice(0, 4).map((r) => ({ region: r.region, missing: r.missing.slice(0, 3).map((m) => ({ name: m.name, companyRevenueCents: m.companyRevenueCents })) })),
    territories: dist.territories.slice(0, 5).map((t) => ({ region: t.region, accounts: t.accounts, revenueCents: t.revenueCents })),
    contracts: deals
      .map((d) => ({ id: d.customer.id, company: d.customer.company, status: contractStatus(d.agreement.expirationDate, today), days: daysUntil(d.agreement.expirationDate, today) }))
      .filter((c) => c.status !== "active")
      .sort((a, b) => a.days - b.days)
      .slice(0, 6),
    teamActivity,
    myTasks,
    lowStock: alerts.filter((a) => a.category === "Inventory").slice(0, 5).map((a) => ({ title: a.title, detail: a.detail, href: a.href })),
    marketing: {
      websiteRevenueCents: channelSales(analytics.byChannel, "Online").revenueCents,
      websiteOrders: channelSales(analytics.byChannel, "Online").orders,
      amazonRevenueCents: channelSales(analytics.byChannel, "Amazon").revenueCents,
    },
    topProducts: analytics.topProducts.slice(0, 5).map((p) => ({ name: p.label, revenueCents: p.revenueCents })),
    onboarding: { durable, shopify: isOn("shopify"), quickbooks: isOn("quickbooks"), customers: customers.length },
  };
}
