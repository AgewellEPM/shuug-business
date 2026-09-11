import { describe, it, expect } from "vitest";
import { priceOrder, computeFreight, tierLabel } from "./order";
import { validateOrder } from "./order-validation";
import { buildSeedDeals } from "../data/seed";
import type { PriceAgreement } from "../data/model";

function joesAgreement(): PriceAgreement {
  const joes = buildSeedDeals().find((d) => d.customer.id === "joes-market");
  if (!joes) throw new Error("seed missing joes-market");
  return joes.agreement;
}

describe("tierLabel", () => {
  it("labels closed and open bands", () => {
    expect(tierLabel({ minQty: 10, maxQty: 24, unitPriceCents: 0 })).toBe("10–24");
    expect(tierLabel({ minQty: 50, maxQty: null, unitPriceCents: 0 })).toBe("50+");
  });
});

describe("computeFreight", () => {
  it("free over threshold, charge under it", () => {
    const policy = { kind: "free_over" as const, amountCents: 250_000, belowChargeCents: 7_500 };
    expect(computeFreight(policy, 300_000).freightCents).toBe(0);
    expect(computeFreight(policy, 100_000).freightCents).toBe(7_500);
  });
  it("flat and included and customer_pays", () => {
    expect(computeFreight({ kind: "flat", amountCents: 5_000 }, 0).freightCents).toBe(5_000);
    expect(computeFreight({ kind: "included" }, 0).freightCents).toBe(0);
    expect(computeFreight({ kind: "customer_pays" }, 0).freightCents).toBe(0);
  });
});

describe("priceOrder", () => {
  const agreement = joesAgreement(); // Amba base 6600 -> ladder 6600/6300/6000/5800

  it("prices Amba at the 10–24 tier for 12 cases", () => {
    const p = priceOrder([{ skuId: "shuug-amba", cases: 12 }], agreement);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].unitPriceCents).toBe(6300); // base 6600 - 300
    expect(p.lines[0].tierLabel).toBe("10–24");
    expect(p.lines[0].isOverride).toBe(false);
    expect(p.lines[0].lineTotalCents).toBe(75_600);
    expect(p.subtotalCents).toBe(75_600);
    expect(p.freightCents).toBe(7_500); // under $2,500 threshold
    expect(p.totalCents).toBe(83_100);
  });

  it("drops zero-case lines and gives free freight over threshold", () => {
    const p = priceOrder(
      [
        { skuId: "shuug-amba", cases: 70 }, // 50+ tier = 5800 -> 406000
        { skuId: "shuug-zhoug", cases: 0 },
      ],
      agreement,
    );
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].unitPriceCents).toBe(5800);
    expect(p.subtotalCents).toBe(406_000);
    expect(p.freightCents).toBe(0);
    expect(p.totalCents).toBe(406_000);
  });

  it("prices a BOTTLE order per bottle (tier case price / units)", () => {
    const skus = buildSeedDeals().find((d) => d.customer.id === "joes-market")!.skus;
    // 24 bottles = 2 case-equiv -> tier 1–9 (base 6600) -> per bottle 6600/12 = 550
    const p = priceOrder([{ skuId: "shuug-amba", unit: "bottle", quantity: 24 }], agreement, skus);
    expect(p.lines[0].unit).toBe("bottle");
    expect(p.lines[0].quantity).toBe(24);
    expect(p.lines[0].unitPriceCents).toBe(550); // 6600 / 12
    expect(p.lines[0].cases).toBeCloseTo(2, 6); // case-equivalent
    expect(p.lines[0].lineTotalCents).toBe(550 * 24);
    expect(p.lines[0].tierLabel).toMatch(/btl/);
  });

  it("throws on a bottle order without a known case size", () => {
    expect(() => priceOrder([{ skuId: "shuug-amba", unit: "bottle", quantity: 12 }], agreement)).toThrow();
  });

  it("honors a per-order price override (agreement price ignored)", () => {
    const p = priceOrder(
      [{ skuId: "shuug-amba", cases: 12, overrideUnitPriceCents: 5000 }],
      agreement,
    );
    expect(p.lines[0].unitPriceCents).toBe(5000);
    expect(p.lines[0].isOverride).toBe(true);
    expect(p.lines[0].tierLabel).toBe("custom");
    expect(p.lines[0].lineTotalCents).toBe(60_000);
  });

  it("fail-fast on unknown SKU, bad case counts, and bad override", () => {
    expect(() => priceOrder([{ skuId: "nope", cases: 1 }], agreement)).toThrow();
    expect(() => priceOrder([{ skuId: "shuug-amba", cases: -1 }], agreement)).toThrow();
    expect(() => priceOrder([{ skuId: "shuug-amba", cases: 1.5 }], agreement)).toThrow();
    expect(() =>
      priceOrder([{ skuId: "shuug-amba", cases: 1, overrideUnitPriceCents: -5 }], agreement),
    ).toThrow();
  });
});

describe("validateOrder", () => {
  const agreement = joesAgreement(); // min 10 cases, min $2,500, PO required

  it("flags too-few cases, too-low dollars, and missing PO together", () => {
    const pricing = priceOrder([{ skuId: "shuug-amba", cases: 5 }], agreement);
    const v = validateOrder({ pricing, agreement, requiresPO: true, poNumber: null });
    expect(v.ok).toBe(false);
    const codes = v.violations.map((x) => x.code).sort();
    expect(codes).toEqual(["min_cases", "min_dollars", "po_required"]);
    expect(v.totalCases).toBe(5);
  });

  it("passes a compliant order with a PO", () => {
    const pricing = priceOrder([{ skuId: "shuug-amba", cases: 70 }], agreement);
    const v = validateOrder({ pricing, agreement, requiresPO: true, poNumber: "PO-9001" });
    expect(v.ok).toBe(true);
    expect(v.violations).toHaveLength(0);
  });

  it("flags an empty order", () => {
    const pricing = priceOrder([], agreement);
    const v = validateOrder({ pricing, agreement, requiresPO: false, poNumber: null });
    expect(v.violations.some((x) => x.code === "empty")).toBe(true);
  });
});
