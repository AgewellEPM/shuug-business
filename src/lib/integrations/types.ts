/**
 * Normalized integration shapes — the neutral vocabulary between Shopify
 * (source), Deal Desk, and QuickBooks (accounting). External payloads are
 * mapped INTO these; QuickBooks payloads are built FROM these. Money is cents.
 */

export interface IncomingCustomer {
  /** stable id in the source system (Shopify customer id). */
  externalId: string;
  company: string;
  buyerName: string;
  buyerEmail: string;
  website: string | null;
  billingAddress: string;
  shippingAddress: string;
}

export interface IncomingOrderLine {
  sku: string | null;
  title: string;
  quantity: number;
  unitPriceCents: number;
}

export interface IncomingOrder {
  /** Optional on legacy imports; invoice sync requires verified metadata. */
  currency?: string;
  financialStatus?: string | null;
  cancelled?: boolean;
  testOrder?: boolean;
  edited?: boolean;
  outstandingCents?: number;
  refundedCents?: number;
  linesComplete?: boolean;
  externalId: string;
  /** human order name/number, e.g. Shopify "#1001". */
  name: string;
  customerExternalId: string | null;
  /** the order's customer, mapped, when the source embeds it. */
  customer: IncomingCustomer | null;
  poNumber: string | null;
  lines: IncomingOrderLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}
