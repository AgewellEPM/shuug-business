import { describe, it, expect } from "vitest";
import { batchCostCents, costPerCaseCents, yieldFraction, scaleForCases, recipeAllergens } from "./recipe";
import type { Recipe } from "./model";

const AMBA: Recipe = {
  skuId: "shuug-amba",
  batchYieldCases: 40,
  ingredients: [
    { name: "Mango", quantity: 20, unit: "kg", costCents: 60000, allergen: null },
    { name: "Fenugreek", quantity: 2, unit: "kg", costCents: 8000, allergen: null },
    { name: "Bottles", quantity: 480, unit: "each", costCents: 76800, allergen: null },
    { name: "Sesame oil", quantity: 1, unit: "L", costCents: 4000, allergen: "Sesame" },
  ],
};

describe("cost roll-up", () => {
  it("sums batch cost and derives cost per case", () => {
    expect(batchCostCents(AMBA)).toBe(60000 + 8000 + 76800 + 4000); // 148800
    expect(costPerCaseCents(AMBA)).toBe(Math.round(148800 / 40)); // 3720
  });
  it("uses actual yield when given (low yield raises unit cost)", () => {
    expect(costPerCaseCents(AMBA, 36)).toBe(Math.round(148800 / 36)); // > 3720
    expect(yieldFraction(AMBA, 36)).toBeCloseTo(0.9, 6);
  });
});

describe("scaleForCases", () => {
  it("rounds up to whole batches and scales ingredients + cost", () => {
    const run = scaleForCases(AMBA, 50); // need 50, batch=40 -> 2 batches -> 80 cases
    expect(run.batches).toBe(2);
    expect(run.producedCases).toBe(80);
    expect(run.ingredients.find((i) => i.name === "Mango")?.quantity).toBe(40);
    expect(run.totalCostCents).toBe(148800 * 2);
  });
  it("rejects non-positive targets", () => {
    expect(() => scaleForCases(AMBA, 0)).toThrow();
  });
});

describe("recipeAllergens", () => {
  it("rolls up distinct allergens for the label", () => {
    expect(recipeAllergens(AMBA)).toEqual(["Sesame"]);
  });
});
