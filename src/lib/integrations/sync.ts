/**
 * Sync engine: Shopify (source) → QuickBooks (accounting).
 *
 * Pulls recent Shopify orders and, for each, ensures the customer exists in
 * QuickBooks (labeled by company) and creates an invoice for the order lines.
 * Per-order errors are collected, not thrown, so one bad order doesn't abort the
 * whole run. Requires Shopify configured + QuickBooks connected.
 */
import { fetchShopifyOrders } from "./shopify";
import { findOrCreateQboCustomer, createQboInvoice, findOrCreateQboItem } from "./quickbooks";
import { buildQboCustomer, buildQboInvoice } from "./quickbooks-map";
import type { IncomingOrder } from "./types";
import { getShopifyConfig, getQuickBooksConfig } from "./config";
import { getQboTokens } from "./token-store";

export interface SyncLineResult {
  order: string;
  ok: boolean;
  invoiceId?: string;
  qboCustomerId?: string;
  message?: string;
}

export interface SyncResult {
  ordersFetched: number;
  invoicesCreated: number;
  results: SyncLineResult[];
}

/** Preconditions check — returns a human reason when sync can't run, else null. */
export function syncBlockedReason(): string | null {
  if (!getShopifyConfig()) return "Shopify is not configured.";
  if (!getQuickBooksConfig()) return "QuickBooks app is not configured.";
  if (!getQboTokens()) return "QuickBooks is not connected — click Connect first.";
  return null;
}

export async function syncShopifyToQuickBooks(
  limit = 25,
  itemRefBySku: Record<string, string> = {},
): Promise<SyncResult> {
  const blocked = syncBlockedReason();
  if (blocked) throw new Error(blocked);

  const orders = await fetchShopifyOrders(limit);
  const results: SyncLineResult[] = [];
  let invoicesCreated = 0;

  // Resolve every distinct product to a QBO Item once, so invoice lines carry
  // real ItemRefs. Seed with any caller-provided overrides.
  const itemMap: Record<string, string> = { ...itemRefBySku };
  await resolveItemRefs(orders, itemMap);

  for (const order of orders) {
    if (!order.customer) {
      results.push({ order: order.name, ok: false, message: "No customer on order" });
      continue;
    }
    try {
      const qboCustomerId = await findOrCreateQboCustomer(buildQboCustomer(order.customer));
      const invoice = await createQboInvoice(buildQboInvoice(order, qboCustomerId, itemMap));
      invoicesCreated += 1;
      results.push({ order: order.name, ok: true, invoiceId: invoice.Id, qboCustomerId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "sync failed";
      results.push({ order: order.name, ok: false, message });
    }
  }

  return { ordersFetched: orders.length, invoicesCreated, results };
}

/**
 * Populate `itemMap` (source SKU -> QBO Item.Id) for every distinct product in
 * the orders, resolving/creating QBO items by product name. Failures are left
 * unmapped (that line posts without an ItemRef) rather than aborting the sync.
 */
async function resolveItemRefs(
  orders: IncomingOrder[],
  itemMap: Record<string, string>,
): Promise<void> {
  const titleBySku = new Map<string, string>();
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.sku && !itemMap[line.sku] && !titleBySku.has(line.sku)) {
        titleBySku.set(line.sku, line.title);
      }
    }
  }
  for (const [sku, title] of titleBySku) {
    try {
      itemMap[sku] = await findOrCreateQboItem(title);
    } catch {
      // leave unmapped — the invoice line will post without an ItemRef
    }
  }
}
