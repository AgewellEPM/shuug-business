/**
 * Amazon (Selling Partner API) normalized shapes. Amazon orders flow in here so
 * you can see them next to your website (Shopify) orders and know which channel
 * a sale came from. Money is integer cents.
 */

export type SalesSource = "website" | "amazon";

export interface AmazonOrder {
  /** Amazon order id, e.g. "111-2233445-6677889". */
  orderId: string;
  purchaseDate: string; // ISO
  status: string; // "Shipped", "Unshipped", "Pending", "Canceled", ...
  /** Amazon's channel label ("Amazon.com") — distinguishes FBA/FBM etc. */
  salesChannel: string;
  buyerEmail: string | null;
  marketplaceId: string;
  itemsCount: number;
  totalCents: number;
}

export interface ChannelTotals {
  source: SalesSource;
  label: string;
  orderCount: number;
  revenueCents: number;
}
