/**
 * Application domain model for the deal desk.
 *
 * These are the shapes the UI and data layer speak. Money is integer cents
 * (see ../money); pricing math lives in ../pricing. Persistence-neutral: the
 * same shapes are served by the in-memory demo store and the Prisma/Postgres
 * store (see ./store).
 */
import type { VolumeTier } from "../pricing/types";

export type PaymentTermsCode =
  | "prepaid"
  | "card"
  | "net15"
  | "net30"
  | "net45";

export type FreightPolicyKind = "customer_pays" | "included" | "flat" | "free_over";

export interface FreightPolicy {
  kind: FreightPolicyKind;
  /** for "flat": the flat charge; for "free_over": the threshold. cents. */
  amountCents?: number;
  /** for "free_over": freight charged when the order is UNDER the threshold. */
  belowChargeCents?: number;
}

export interface Sku {
  id: string;
  name: string; // "Amba Hot Sauce"
  /** bottles per case (wholesale unit). */
  unitsPerCase: number;
  /** universal retail price per bottle, cents (the retail-invoice reference). */
  retailPriceCents: number;
  /** current landed cost per case, cents. The margin engine's "your cost". */
  costPerCaseCents: number;
  /** list/standard wholesale price per case, cents. The discount reference. */
  standardPriceCents: number;
}

/** Sales channel / buyer type. */
export type CustomerChannel = "wholesale_bulk" | "store" | "online" | "amazon";

export const CHANNEL_LABELS: Record<CustomerChannel, string> = {
  wholesale_bulk: "Wholesale (bulk)",
  store: "Store",
  online: "Online",
  amazon: "Amazon",
};

export interface Customer {
  id: string; // url slug, e.g. "joes-market"
  company: string; // "Joe's Market"
  /** which sales channel / buyer type this account is. */
  channel: CustomerChannel;
  buyerName: string;
  buyerEmail: string;
  phone?: string;
  /** customer website, e.g. "https://joesmarket.com" (optional). */
  website: string | null;
  /** the sales rep / account owner responsible for this store. */
  accountOwner: string;
  /** region/territory for rollups, e.g. "MA" or "Northeast". */
  region: string;
  billingAddress: string;
  shippingAddress: string;
  /** QuickBooks customer ref (mapping stub — real sync is a later milestone). */
  quickbooksCustomerId: string | null;
  requiresPO: boolean;
}

/** A per-SKU price line inside an agreement: base case price + optional tiers. */
export interface PriceLine {
  skuId: string;
  /** agreed price per case at base (tier 1) quantity, cents. */
  unitPriceCents: number;
  /** optional volume ladder; empty means flat price at unitPriceCents. */
  tiers: VolumeTier[];
  /** minimum cases per order for THIS sku (0 = none). */
  minCasesPerSku: number;
}

/** The negotiated commercial envelope for one customer. */
export interface PriceAgreement {
  id: string;
  customerId: string;
  /** margin policy that drives the guardrail. fractions 0..1. */
  targetMarginFraction: number;
  floorMarginFraction: number | null;
  paymentTerms: PaymentTermsCode;
  creditLimitCents: number | null;
  minCasesPerOrder: number;
  minOrderDollarsCents: number;
  freight: FreightPolicy;
  effectiveDate: string; // ISO date
  expirationDate: string; // ISO date
  approvedBy: string;
  lines: PriceLine[];
}

/** An immutable snapshot in the agreement's version history. */
export interface AgreementVersion {
  version: number;
  createdAt: string; // ISO datetime
  changedBy: string;
  note: string;
  snapshot: PriceAgreement;
}

export interface CustomerDeal {
  customer: Customer;
  agreement: PriceAgreement;
  skus: Sku[];
  versions: AgreementVersion[];
}

// ---- Orders -----------------------------------------------------------------

export type OrderStatus = "submitted" | "fulfilled" | "cancelled";

/** Whether a line is ordered by the case or by the individual bottle. */
export type OrderUnit = "case" | "bottle";

/**
 * What the buyer is ordering, before pricing. Backward-compatible: pass `cases`
 * (legacy) OR `quantity` + `unit`. When `quantity`/`unit` are omitted, `cases`
 * is treated as a case quantity.
 */
export interface OrderDraftLine {
  skuId: string;
  cases?: number;
  quantity?: number;
  unit?: OrderUnit;
  /**
   * Optional per-ORDER price override (cents), interpreted PER ORDERED UNIT
   * (per case, or per bottle). Replaces the tier price for this order only.
   */
  overrideUnitPriceCents?: number;
}

/** A priced line as persisted on the order (price captured at order time). */
export interface OrderLine {
  skuId: string;
  /** the unit the buyer ordered in. */
  unit: OrderUnit;
  /** how many of that unit (cases, or bottles). */
  quantity: number;
  /** case-equivalent quantity for rollups/minimums (bottles / unitsPerCase). */
  cases: number;
  /** unit price per ORDERED unit actually charged (tier price, or override), cents. */
  unitPriceCents: number;
  /** which tier band supplied the price, e.g. "10–24", or "custom" if overridden. */
  tierLabel: string;
  /** true when unitPriceCents came from a per-order override, not the tier. */
  isOverride: boolean;
  lineTotalCents: number;
  /** Total landed cost captured when priced; absent on legacy orders. */
  costAtOrderCents?: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  poNumber: string | null;
  createdAt: string; // ISO datetime
  lines: OrderLine[];
  subtotalCents: number;
  freightCents: number;
  totalCents: number;
  note: string;
}
