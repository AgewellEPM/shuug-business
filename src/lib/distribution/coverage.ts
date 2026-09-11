/**
 * Coverage gaps — where you're under-penetrated. Two honest signals a wholesale
 * operator can act on:
 *   1. Region gaps: a region has live accounts but isn't buying a product that
 *      sells well everywhere else — a cross-sell/placement opportunity.
 *   2. Product reach: how many of your territories each product is actually in.
 * Pure aggregation over orders; ranking is by real company-wide revenue so the
 * biggest opportunities float up. No made-up scores.
 */
import type { Customer, Order, Sku } from "../data/model";

export interface MissingProduct {
  skuId: string;
  name: string;
  /** company-wide revenue for this product — how big the opportunity is. */
  companyRevenueCents: number;
}
export interface RegionGap {
  region: string;
  accounts: number;
  skusSold: number;
  missing: MissingProduct[];
}
export interface ProductReach {
  skuId: string;
  name: string;
  regions: number;
  totalRegions: number;
  revenueCents: number;
}
export interface CoverageGaps {
  regionGaps: RegionGap[];
  productReach: ProductReach[];
  totalRegions: number;
}

const UNASSIGNED = "Unassigned";
const regionOf = (c: Customer) => c.region?.trim() || UNASSIGNED;

export function coverageGaps(
  customers: Customer[],
  orders: Order[],
  skus: Sku[],
  maxMissingPerRegion = 5,
): CoverageGaps {
  const skuName = new Map(skus.map((s) => [s.id, s.name]));
  const regionByCustomer = new Map(customers.map((c) => [c.id, regionOf(c)]));

  // Every region that has at least one account (an opportunity surface).
  const accountsByRegion = new Map<string, number>();
  for (const c of customers) accountsByRegion.set(regionOf(c), (accountsByRegion.get(regionOf(c)) ?? 0) + 1);

  // Company-wide revenue per SKU + which regions each SKU sells in.
  const skuRevenue = new Map<string, number>();
  const skuRegions = new Map<string, Set<string>>();
  const regionSkus = new Map<string, Set<string>>();
  for (const o of orders) {
    const region = regionByCustomer.get(o.customerId) ?? UNASSIGNED;
    for (const line of o.lines) {
      skuRevenue.set(line.skuId, (skuRevenue.get(line.skuId) ?? 0) + line.lineTotalCents);
      (skuRegions.get(line.skuId) ?? skuRegions.set(line.skuId, new Set()).get(line.skuId)!).add(region);
      (regionSkus.get(region) ?? regionSkus.set(region, new Set()).get(region)!).add(line.skuId);
    }
  }

  // Rank SKUs by company revenue — the "top products" a region ought to carry.
  const rankedSkus = [...skuRevenue.entries()].sort((a, b) => b[1] - a[1]).map(([skuId]) => skuId);

  const totalRegions = accountsByRegion.size;
  const regionGaps: RegionGap[] = [...accountsByRegion.entries()]
    .map(([region, accounts]) => {
      const sold = regionSkus.get(region) ?? new Set<string>();
      const missing = rankedSkus
        .filter((skuId) => !sold.has(skuId))
        .slice(0, maxMissingPerRegion)
        .map((skuId) => ({ skuId, name: skuName.get(skuId) ?? skuId, companyRevenueCents: skuRevenue.get(skuId) ?? 0 }));
      return { region, accounts, skusSold: sold.size, missing };
    })
    // Regions with the most missing high-value products first.
    .sort((a, b) => {
      const av = a.missing.reduce((s, m) => s + m.companyRevenueCents, 0);
      const bv = b.missing.reduce((s, m) => s + m.companyRevenueCents, 0);
      return bv - av;
    });

  const productReach: ProductReach[] = rankedSkus.map((skuId) => ({
    skuId,
    name: skuName.get(skuId) ?? skuId,
    regions: skuRegions.get(skuId)?.size ?? 0,
    totalRegions,
    revenueCents: skuRevenue.get(skuId) ?? 0,
  }));

  return { regionGaps, productReach, totalRegions };
}
