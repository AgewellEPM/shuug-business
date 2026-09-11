import { describe, it, expect } from "vitest";
import { evaluateKeyword, evaluateCampaign, type PpcAssumptions } from "./economics";

// $2.00 CPC, 2% conversion -> $100 CPA. Product GP $150/conversion.
const A: PpcAssumptions = { ctr: 0.05, conversionRate: 0.02, valuePerConversionCents: 15000 };

describe("evaluateKeyword", () => {
  it("computes CPA, profit, ROAS and a 'worth' verdict when margin beats CPA", () => {
    const r = evaluateKeyword({ keyword: "hot sauce wholesale", cpcCents: 200, monthlySearches: 1000 }, A);
    expect(r.cpaCents).toBe(10000); // 200 / 0.02
    expect(r.profitPerConversionCents).toBe(5000); // 15000 - 10000
    expect(r.roas).toBeCloseTo(1.5, 6);
    expect(r.verdict).toBe("worth");
    expect(r.breakEvenCpcCents).toBe(300); // 15000 * 0.02
    expect(r.breakEvenConversionRate).toBeCloseTo(200 / 15000, 6);
  });

  it("flags 'skip' when CPA exceeds the product's value", () => {
    const r = evaluateKeyword({ keyword: "expensive term", cpcCents: 500, monthlySearches: 500 }, A);
    expect(r.cpaCents).toBe(25000); // 500 / 0.02
    expect(r.profitPerConversionCents).toBe(-10000);
    expect(r.roas).toBeCloseTo(15000 / 25000, 6); // 0.6
    expect(r.verdict).toBe("skip");
  });

  it("projects monthly clicks, spend, gross profit and net", () => {
    const r = evaluateKeyword({ keyword: "k", cpcCents: 200, monthlySearches: 1000 }, A);
    expect(r.monthlyClicks).toBe(50); // 1000 * 0.05
    expect(r.monthlyConversions).toBe(1); // 50 * 0.02
    expect(r.monthlySpendCents).toBe(10000); // 50 * 200
    expect(r.monthlyGrossProfitCents).toBe(15000); // 1 * 15000
    expect(r.monthlyNetCents).toBe(5000);
  });

  it("rejects bad assumptions", () => {
    expect(() => evaluateKeyword({ keyword: "x", cpcCents: 100, monthlySearches: 1 }, { ...A, conversionRate: 0 })).toThrow();
    expect(() => evaluateKeyword({ keyword: "x", cpcCents: -1, monthlySearches: 1 }, A)).toThrow();
  });
});

describe("evaluateCampaign", () => {
  it("rolls up spend, gross profit, net, blended ROAS and worth count", () => {
    const c = evaluateCampaign(
      [
        { keyword: "good", cpcCents: 200, monthlySearches: 1000 }, // net +5000
        { keyword: "bad", cpcCents: 500, monthlySearches: 500 }, // spend 25*500=12500, conv 0.5 -> gp 7500, net -5000
      ],
      A,
    );
    expect(c.rows).toHaveLength(2);
    expect(c.worthCount).toBe(1);
    expect(c.totalMonthlySpendCents).toBe(10000 + 12500);
    expect(c.totalMonthlyGrossProfitCents).toBe(15000 + 7500);
    expect(c.totalMonthlyNetCents).toBe(0);
    expect(c.blendedRoas).toBeCloseTo(22500 / 22500, 6);
  });
});
