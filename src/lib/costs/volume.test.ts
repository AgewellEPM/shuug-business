import { describe, it, expect } from "vitest";
import { volumePlan } from "./volume";
import type { Sku } from "../data/model";

// standardLadder($60 base): 1-9 $60, 10-24 $57, 25-49 $54, 50+ $52
const sku: Sku = { id: "amba", name: "Amba", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 4000, standardPriceCents: 6000 };

describe("volumePlan", () => {
  it("lands in the right tier and computes cases to the next break", () => {
    const p = volumePlan(sku, 12); // 12 cases/mo → tier 10-24
    expect(p.currentTier.minQty).toBe(10);
    expect(p.nextTier?.minQty).toBe(25);
    expect(p.casesToNextTier).toBe(13); // 25 - 12
    expect(p.nextUnitPriceCents).toBe(5400);
  });

  it("computes monthly savings the next break is worth at forecast volume", () => {
    const p = volumePlan(sku, 20); // tier 10-24 ($57), next 25-49 ($54) → $3/case × 20 = $60
    expect(p.monthlySavingsAtNextCents).toBe(300 * 20);
  });

  it("reports mfg cost and margin at standard price", () => {
    const p = volumePlan(sku, 5);
    expect(p.mfgCostPerCaseCents).toBe(4000);
    expect(p.marginNowFraction).toBeCloseTo((6000 - 4000) / 6000, 5);
  });

  it("has no next tier at the top band", () => {
    const p = volumePlan(sku, 100);
    expect(p.nextTier).toBeNull();
    expect(p.casesToNextTier).toBe(0);
    expect(p.monthlySavingsAtNextCents).toBe(0);
  });
});
