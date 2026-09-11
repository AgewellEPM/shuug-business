/**
 * Client-portal account summary — what a customer sees about their own history:
 * when they last ordered, how many orders, lifetime spend, and what's still open.
 * Pure aggregation over their orders (cancelled excluded from spend). Cents only.
 */
import type { Order } from "../data/model";

export interface AccountSummary {
  orderCount: number;
  lifetimeSpendCents: number;
  lastOrderISO: string | null;
  openOrders: number;
  avgOrderCents: number;
}

export function accountSummary(orders: Order[]): AccountSummary {
  const live = orders.filter((o) => o.status !== "cancelled");
  const lifetimeSpendCents = live.reduce((n, o) => n + o.totalCents, 0);
  const lastOrderISO = live.reduce<string | null>((latest, o) => (!latest || o.createdAt > latest ? o.createdAt : latest), null);
  return {
    orderCount: live.length,
    lifetimeSpendCents,
    lastOrderISO,
    openOrders: live.filter((o) => o.status === "submitted").length,
    avgOrderCents: live.length ? Math.round(lifetimeSpendCents / live.length) : 0,
  };
}

/** Days since the last order (null when they've never ordered). */
export function daysSinceLastOrder(lastOrderISO: string | null, now: Date): number | null {
  if (!lastOrderISO) return null;
  return Math.floor((now.getTime() - new Date(lastOrderISO).getTime()) / 86_400_000);
}
