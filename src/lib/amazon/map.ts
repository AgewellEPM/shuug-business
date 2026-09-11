/**
 * Pure Amazon SP-API mappers. Converts a raw Orders API order into our
 * normalized AmazonOrder, turning Amazon's { Amount: "12.99" } money into cents.
 * No network — fully unit-testable.
 */
import type { AmazonOrder } from "./model";

export interface AmazonMoney {
  CurrencyCode?: string;
  Amount?: string | number;
}

export interface AmazonOrderRaw {
  AmazonOrderId: string;
  PurchaseDate?: string;
  OrderStatus?: string;
  SalesChannel?: string;
  MarketplaceId?: string;
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  OrderTotal?: AmazonMoney | null;
  BuyerInfo?: { BuyerEmail?: string | null } | null;
}

/** "12.99" (or 12.99) -> 1299 cents. Missing/garbage -> 0. */
export function moneyToCents(money: AmazonMoney | null | undefined): number {
  if (!money || money.Amount === undefined || money.Amount === null) return 0;
  const n = typeof money.Amount === "string" ? Number(money.Amount) : money.Amount;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

export function mapAmazonOrder(raw: AmazonOrderRaw): AmazonOrder {
  const shipped = raw.NumberOfItemsShipped ?? 0;
  const unshipped = raw.NumberOfItemsUnshipped ?? 0;
  return {
    orderId: raw.AmazonOrderId,
    purchaseDate: raw.PurchaseDate ?? "",
    status: raw.OrderStatus ?? "Unknown",
    salesChannel: raw.SalesChannel ?? "Amazon",
    buyerEmail: raw.BuyerInfo?.BuyerEmail ?? null,
    marketplaceId: raw.MarketplaceId ?? "",
    itemsCount: shipped + unshipped,
    totalCents: moneyToCents(raw.OrderTotal),
  };
}

export function mapAmazonOrders(orders: AmazonOrderRaw[]): AmazonOrder[] {
  return orders.filter((o) => typeof o.AmazonOrderId === "string").map(mapAmazonOrder);
}
