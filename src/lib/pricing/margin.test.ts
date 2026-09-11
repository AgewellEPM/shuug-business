import { describe, it, expect } from "vitest";
import {
  computeMargin,
  discountFraction,
  sellForTargetMargin,
} from "./margin";

describe("computeMargin", () => {
  it("matches Luke's Joe's Market example (cost $25.20, sell $44.00)", () => {
    const r = computeMargin(2520, 4400);
    expect(r.grossProfitCents).toBe(1880); // $18.80
    expect(r.marginFraction).toBeCloseTo(0.4272727, 6); // 42.7%
    expect(r.markupFraction).toBeCloseTo(0.7460317, 6);
  });

  it("handles selling below cost (negative GP, negative margin)", () => {
    const r = computeMargin(4000, 3000);
    expect(r.grossProfitCents).toBe(-1000);
    expect(r.marginFraction).toBeCloseTo(-1000 / 3000, 6);
  });

  it("returns null margin when sell is 0", () => {
    const r = computeMargin(2520, 0);
    expect(r.marginFraction).toBeNull();
    expect(r.grossProfitCents).toBe(-2520);
  });

  it("returns null markup when cost is 0", () => {
    const r = computeMargin(0, 4400);
    expect(r.markupFraction).toBeNull();
    expect(r.marginFraction).toBe(1);
  });

  it("fail-fast on negatives and non-integers", () => {
    expect(() => computeMargin(-1, 4400)).toThrow();
    expect(() => computeMargin(2520, -1)).toThrow();
    expect(() => computeMargin(2520.5, 4400)).toThrow();
  });
});

describe("discountFraction", () => {
  it("computes Joe's 8.3% off standard $48 -> $44", () => {
    expect(discountFraction(4800, 4400)).toBeCloseTo(0.083333, 6);
  });
  it("negative fraction when customer pays above standard", () => {
    expect(discountFraction(4800, 5000)).toBeCloseTo(-0.041667, 6);
  });
  it("null when standard is 0", () => {
    expect(discountFraction(0, 4400)).toBeNull();
  });
});

describe("sellForTargetMargin", () => {
  it("inverts to hit a target margin (round-trips through computeMargin)", () => {
    const sell = sellForTargetMargin(2520, 0.4);
    expect(sell).toBe(4200); // 2520 / 0.6
    const back = computeMargin(2520, sell);
    expect(back.marginFraction).toBeCloseTo(0.4, 4);
  });
  it("rejects unreachable target >= 100%", () => {
    expect(() => sellForTargetMargin(2520, 1)).toThrow();
    expect(() => sellForTargetMargin(2520, 1.5)).toThrow();
  });
});
