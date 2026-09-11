/**
 * Pure Shopify → normalized mappers. No network here — takes a raw Admin API
 * payload and returns our neutral shapes, converting Shopify's decimal-string
 * money to integer cents at the boundary. Fully unit-testable.
 */
import { parseDollarsToCents } from "../money";
import type { IncomingCustomer, IncomingOrder, IncomingOrderLine } from "./types";

// --- minimal raw Shopify shapes we consume (Admin REST) ---------------------

export interface ShopifyAddressRaw {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  company?: string | null;
}

export interface ShopifyCustomerRaw {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  default_address?: ShopifyAddressRaw | null;
}

export interface ShopifyLineItemRaw {
  sku?: string | null;
  title: string;
  quantity: number;
  price: string; // decimal string, e.g. "72.00"
}

export interface ShopifyNoteAttribute {
  name: string;
  value: string;
}

export interface ShopifyOrderRaw {
  id: number | string;
  name: string; // "#1001"
  email?: string | null;
  po_number?: string | null;
  note_attributes?: ShopifyNoteAttribute[] | null;
  customer?: ShopifyCustomerRaw | null;
  line_items: ShopifyLineItemRaw[];
  subtotal_price?: string | null;
  total_shipping_price_set?: { shop_money?: { amount?: string | null } } | null;
  total_price?: string | null;
}

function formatAddress(a?: ShopifyAddressRaw | null): string {
  if (!a) return "";
  return [a.address1, a.address2, a.city, a.province, a.zip, a.country]
    .filter((p) => p && p.trim())
    .join(", ");
}

function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter((p) => p && p.trim()).join(" ").trim();
}

function moneyToCents(v: string | null | undefined): number {
  if (!v || !v.trim()) return 0;
  return parseDollarsToCents(v);
}

export function mapShopifyCustomer(raw: ShopifyCustomerRaw): IncomingCustomer {
  const address = formatAddress(raw.default_address);
  const company = raw.default_address?.company?.trim() || fullName(raw.first_name, raw.last_name) || "Unknown";
  return {
    externalId: String(raw.id),
    company,
    buyerName: fullName(raw.first_name, raw.last_name) || company,
    buyerEmail: raw.email?.trim() || "",
    website: null,
    billingAddress: address,
    shippingAddress: address,
  };
}

/** Pull a PO number from Shopify's native field or a note attribute. */
function extractPO(raw: ShopifyOrderRaw): string | null {
  if (raw.po_number && raw.po_number.trim()) return raw.po_number.trim();
  const attr = raw.note_attributes?.find((n) => /po|purchase.?order/i.test(n.name));
  return attr?.value?.trim() || null;
}

export function mapShopifyOrder(raw: ShopifyOrderRaw): IncomingOrder {
  const lines: IncomingOrderLine[] = raw.line_items.map((li) => ({
    sku: li.sku?.trim() || null,
    title: li.title,
    quantity: li.quantity,
    unitPriceCents: moneyToCents(li.price),
  }));

  const subtotalCents =
    raw.subtotal_price != null
      ? moneyToCents(raw.subtotal_price)
      : lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const shippingCents = moneyToCents(raw.total_shipping_price_set?.shop_money?.amount);
  const totalCents =
    raw.total_price != null ? moneyToCents(raw.total_price) : subtotalCents + shippingCents;

  return {
    externalId: String(raw.id),
    name: raw.name,
    customerExternalId: raw.customer ? String(raw.customer.id) : null,
    customer: raw.customer ? mapShopifyCustomer(raw.customer) : null,
    poNumber: extractPO(raw),
    lines,
    subtotalCents,
    shippingCents,
    totalCents,
  };
}
