/**
 * Gather every customer + order from the store and compute analytics. Shared by
 * the dashboard page and the AI copilot so both see identical numbers.
 */
import type { DealStore } from "../data/store";
import type { Customer, Order, Sku } from "../data/model";
import { computeAnalytics, type Analytics } from "./metrics";

export interface AnalyticsBundle {
  analytics: Analytics;
  customers: Customer[];
  skus: Sku[];
  orders: Order[];
  orderCount: number;
}

export async function loadAnalytics(store: DealStore): Promise<AnalyticsBundle> {
  const summaries = await store.listCustomers();
  const deals = (await Promise.all(summaries.map((s) => store.getDeal(s.id)))).filter(
    (d): d is NonNullable<typeof d> => d !== null,
  );

  const customers: Customer[] = deals.map((d) => d.customer);
  const skus: Sku[] = deals[0]?.skus ?? [];

  const orderLists = await Promise.all(summaries.map((s) => store.listOrders(s.id)));
  const orders: Order[] = orderLists.flat().filter(o => o.status !== "cancelled");

  return {
    analytics: computeAnalytics(orders, customers, skus),
    customers,
    skus,
    orders,
    orderCount: orders.length,
  };
}
