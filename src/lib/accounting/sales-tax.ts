/**
 * Sales Tax (QBD Ch.9) — estimated tax collected/owed on taxable sales at your
 * configured rate, broken out by region (jurisdiction). Pure. Rate is in basis
 * points (700 = 7.00%). When the rate is 0 the estimate is 0 — set your rate in
 * Settings. Orders don't carry a tax line yet, so this is an estimate from sales.
 */
import type { Customer, Order } from "../data/model";

export interface SalesTaxByRegion { region: string; taxableCents: number; taxCents: number }
export interface SalesTaxSummary {
  rateBasisPoints: number;
  taxableSalesCents: number;
  estimatedTaxCents: number;
  byRegion: SalesTaxByRegion[];
  note: string;
}

export function computeSalesTax(orders: Order[], customers: Customer[], rateBasisPoints: number): SalesTaxSummary {
  const rate = Math.max(0, Math.round(rateBasisPoints)) / 10_000;
  const regionByCustomer = new Map(customers.map((c) => [c.id, c.region?.trim() || "Unassigned"]));
  const channelByCustomer = new Map(customers.map((c) => [c.id, c.channel]));

  const byRegion = new Map<string, number>();
  let taxableSalesCents = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    // Online marketplace sales are typically tax-handled by the marketplace.
    if (channelByCustomer.get(o.customerId) === "amazon") continue;
    const region = regionByCustomer.get(o.customerId) ?? "Unassigned";
    taxableSalesCents += o.subtotalCents;
    byRegion.set(region, (byRegion.get(region) ?? 0) + o.subtotalCents);
  }

  const taxOf = (cents: number) => Math.round(cents * rate);
  return {
    rateBasisPoints: Math.max(0, Math.round(rateBasisPoints)),
    taxableSalesCents,
    estimatedTaxCents: taxOf(taxableSalesCents),
    byRegion: [...byRegion.entries()]
      .map(([region, taxableCents]) => ({ region, taxableCents, taxCents: taxOf(taxableCents) }))
      .sort((a, b) => b.taxableCents - a.taxableCents),
    note: rateBasisPoints > 0
      ? `Estimated at ${(rate * 100).toFixed(2)}%. Marketplace (Amazon) sales excluded.`
      : "Set SALES_TAX_RATE_BPS to your rate to estimate tax owed.",
  };
}
