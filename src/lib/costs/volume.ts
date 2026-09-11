/**
 * Manufacturing cost + volume-discount planner. For each product: the current
 * cost to make a case, the margin at standard price, and — based on FORECAST
 * monthly volume — which volume tier you'd land in, how many more cases to reach
 * the next price break, and the monthly saving that break is worth. Pure, cents.
 */
import { standardLadder } from "../pricing/ladder";
import type { Sku } from "../data/model";
import type { VolumeTier } from "../pricing/types";

export interface VolumePlan {
  skuId: string;
  name: string;
  mfgCostPerCaseCents: number;
  standardPriceCents: number;
  /** (standard - cost) / standard, at standard price. */
  marginNowFraction: number;
  forecastCasesPerMonth: number;
  ladder: VolumeTier[];
  currentTier: VolumeTier;
  nextTier: VolumeTier | null;
  /** cases of volume still needed to reach the next tier (0 at top tier). */
  casesToNextTier: number;
  nextUnitPriceCents: number | null;
  /** what the next break saves per month at the forecast volume. */
  monthlySavingsAtNextCents: number;
}

export function volumePlan(sku: Sku, forecastCasesPerMonth: number): VolumePlan {
  const ladder = standardLadder(sku.standardPriceCents);
  const qty = Math.max(0, Math.round(forecastCasesPerMonth));

  const currentTier = ladder.find((t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty)) ?? ladder[0];
  const idx = ladder.indexOf(currentTier);
  const nextTier = idx < ladder.length - 1 ? ladder[idx + 1] : null;

  const casesToNextTier = nextTier ? Math.max(0, nextTier.minQty - qty) : 0;
  const monthlySavingsAtNextCents = nextTier ? Math.max(0, currentTier.unitPriceCents - nextTier.unitPriceCents) * qty : 0;
  const marginNowFraction = sku.standardPriceCents > 0 ? (sku.standardPriceCents - sku.costPerCaseCents) / sku.standardPriceCents : 0;

  return {
    skuId: sku.id,
    name: sku.name,
    mfgCostPerCaseCents: sku.costPerCaseCents,
    standardPriceCents: sku.standardPriceCents,
    marginNowFraction,
    forecastCasesPerMonth: qty,
    ladder,
    currentTier,
    nextTier,
    casesToNextTier,
    nextUnitPriceCents: nextTier ? nextTier.unitPriceCents : null,
    monthlySavingsAtNextCents,
  };
}
