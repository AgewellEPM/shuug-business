/**
 * marketingSummary — a single, cross-channel read of the marketing operation for
 * the Marketing hub. Rolls up Amazon Ads campaign receipts and reports Google Ads
 * connection state so the owner sees both channels at a glance. Pure aggregation
 * over the stores; no network calls (connection checks are local/env-driven).
 */
import { listReceipts } from "../amazon-ads/store";
import { getAdsConfig } from "../amazon-ads/client";
import { googleAdsStatus } from "../ppc/google-ads";
import type { CampaignReceipt } from "../amazon-ads/model";
import type { NamedRevenue } from "../analytics/metrics";
import { CHANNEL_LABELS, type Customer, type Order } from "../data/model";

/** Days of history used to match ad spend against the revenue it drove. */
export const ROAS_WINDOW_DAYS = 30;

/**
 * Return on ad spend: dollars of revenue per dollar spent. Null when spend is
 * zero/unknown — we never divide by nothing and never invent a ratio. `spendCents`
 * and `revenueCents` MUST cover the same time window or the number is meaningless.
 */
export function roas(revenueCents: number, spendCents: number): number | null {
  if (spendCents <= 0) return null;
  return revenueCents / spendCents;
}

/**
 * Revenue (product subtotal) booked to one sales channel over the trailing window.
 * Matched to estimated ad spend for an honest ROAS. Cancelled orders are assumed
 * already filtered out upstream (loadAnalytics does this).
 */
export function trailingChannelRevenueCents(
  orders: Order[],
  customers: Customer[],
  channelLabel: string,
  now: Date,
  windowDays = ROAS_WINDOW_DAYS,
): number {
  const channelByCustomer = new Map(customers.map((c) => [c.id, CHANNEL_LABELS[c.channel]]));
  const cutoff = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  let cents = 0;
  for (const o of orders) {
    if (o.createdAt < cutoff) continue;
    if (channelByCustomer.get(o.customerId) === channelLabel) cents += o.subtotalCents;
  }
  return cents;
}

export interface ChannelSales {
  revenueCents: number;
  orders: number;
  /** average order value in cents (0 when there are no orders). */
  aovCents: number;
}

/**
 * Pull one storefront's real sales out of the analytics channel breakdown. Used
 * to feed website (Online) and Amazon marketplace numbers into the marketing hub
 * so ad spend sits next to the revenue it's meant to drive. `byChannel` is keyed
 * by channel label ("Online", "Amazon", …) — see computeAnalytics.
 */
export function channelSales(byChannel: NamedRevenue[], label: string): ChannelSales {
  const row = byChannel.find((c) => c.label === label);
  if (!row || row.orderCount === 0) return { revenueCents: row?.revenueCents ?? 0, orders: row?.orderCount ?? 0, aovCents: 0 };
  return { revenueCents: row.revenueCents, orders: row.orderCount, aovCents: Math.round(row.revenueCents / row.orderCount) };
}

export interface ChannelSummary {
  key: "google" | "amazon";
  label: string;
  connected: boolean;
  /** Push/live-write enabled (Google) or credentials present (Amazon). */
  live: boolean;
  campaigns: number;
  activeCampaigns: number;
  needsAttention: number;
  dailyBudgetCents: number;
  href: string;
}

export interface MarketingSummary {
  channels: ChannelSummary[];
  totalCampaigns: number;
  totalDailyBudgetCents: number;
  connectedChannels: number;
}

/** Roll a list of Amazon Ads receipts into headline counts. */
export function rollupAmazon(receipts: CampaignReceipt[]) {
  const active = receipts.filter((r) => r.status === "active");
  return {
    campaigns: receipts.length,
    activeCampaigns: active.length,
    needsAttention: receipts.filter((r) => r.status === "attention").length,
    // Budget is a live commitment, so only count campaigns that are actually running.
    dailyBudgetCents: active.reduce((sum, r) => sum + (r.plan?.dailyBudgetCents ?? 0), 0),
  };
}

export function marketingSummary(): MarketingSummary {
  const google = googleAdsStatus();

  let receipts: CampaignReceipt[] = [];
  try {
    receipts = listReceipts();
  } catch {
    // A corrupt/absent receipt store must never take down the hub — show zero.
    receipts = [];
  }
  const amazon = rollupAmazon(receipts);
  const amazonConnected = !!getAdsConfig();

  const channels: ChannelSummary[] = [
    {
      key: "google",
      label: "Google Ads",
      connected: google.configured,
      live: google.pushEnabled,
      campaigns: 0,
      activeCampaigns: 0,
      needsAttention: 0,
      dailyBudgetCents: 0,
      href: "/ads",
    },
    {
      key: "amazon",
      label: "Amazon Ads",
      connected: amazonConnected,
      live: amazonConnected,
      campaigns: amazon.campaigns,
      activeCampaigns: amazon.activeCampaigns,
      needsAttention: amazon.needsAttention,
      dailyBudgetCents: amazon.dailyBudgetCents,
      href: "/amazon-marketing",
    },
  ];

  return {
    channels,
    totalCampaigns: channels.reduce((s, c) => s + c.campaigns, 0),
    totalDailyBudgetCents: channels.reduce((s, c) => s + c.dailyBudgetCents, 0),
    connectedChannels: channels.filter((c) => c.connected).length,
  };
}
