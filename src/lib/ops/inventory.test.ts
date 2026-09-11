import { describe, it, expect } from "vitest";
import { checkStock, applyShip, applyReceive, reorderRow, buildReorderPlan } from "./inventory";
import type { InventoryItem } from "./model";

const ITEMS: InventoryItem[] = [
  { skuId: "shuug-amba", onHandCases: 40, reorderPointCases: 20, targetDaysCover: 30, mfgCostPerCaseCents: 2400 },
  { skuId: "shuug-zhoug", onHandCases: 8, reorderPointCases: 20, targetDaysCover: 30, mfgCostPerCaseCents: 2400 },
];

describe("checkStock / applyShip", () => {
  it("ships when stock is sufficient and decrements", () => {
    const lines = [{ skuId: "shuug-amba", cases: 10 }];
    expect(checkStock(lines, ITEMS).ok).toBe(true);
    const after = applyShip(lines, ITEMS);
    expect(after.find((i) => i.skuId === "shuug-amba")?.onHandCases).toBe(30);
    // originals untouched (immutable)
    expect(ITEMS[0].onHandCases).toBe(40);
  });

  it("reports shortfalls and refuses to ship over stock", () => {
    const lines = [{ skuId: "shuug-zhoug", cases: 20 }];
    const check = checkStock(lines, ITEMS);
    expect(check.ok).toBe(false);
    expect(check.shortfalls[0]).toMatchObject({ skuId: "shuug-zhoug", requested: 20, onHand: 8 });
    expect(() => applyShip(lines, ITEMS)).toThrow();
  });

  it("receives produced stock", () => {
    const after = applyReceive("shuug-zhoug", 50, ITEMS);
    expect(after.find((i) => i.skuId === "shuug-zhoug")?.onHandCases).toBe(58);
  });
});

describe("reorderRow / buildReorderPlan", () => {
  it("computes days of cover and a production suggestion to hit target", () => {
    // 2 cases/day, 40 on hand, target 30 days -> need 60, produce 20
    const r = reorderRow(ITEMS[0], 2);
    expect(r.daysOfCover).toBe(20);
    expect(r.suggestedProduceCases).toBe(20);
    expect(r.productionCostCents).toBe(20 * 2400);
    expect(r.belowReorderPoint).toBe(false);
  });

  it("flags below-reorder items and infinite cover when nothing sells", () => {
    const r = reorderRow(ITEMS[1], 0);
    expect(r.daysOfCover).toBe(Infinity);
    expect(r.suggestedProduceCases).toBe(0);
    expect(r.belowReorderPoint).toBe(true); // 8 <= 20
  });

  it("rolls up total production cost and below-reorder count", () => {
    const plan = buildReorderPlan(
      ITEMS,
      new Map([["shuug-amba", 2], ["shuug-zhoug", 1]]),
    );
    // zhoug: 1/day * 30 = 30 target, on hand 8 -> produce 22
    expect(plan.rows.find((r) => r.skuId === "shuug-zhoug")?.suggestedProduceCases).toBe(22);
    expect(plan.itemsBelowReorder).toBe(1);
    expect(plan.totalProductionCostCents).toBe((20 + 22) * 2400);
  });
});
