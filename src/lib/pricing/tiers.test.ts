import { describe, it, expect } from "vitest";
import { resolveTier, validateTiers } from "./tiers";
import type { VolumeTier } from "./types";

// Luke's example ladder: 1–9 $48, 10–24 $45, 25–49 $42, 50+ $40
const LADDER: VolumeTier[] = [
  { minQty: 1, maxQty: 9, unitPriceCents: 4800 },
  { minQty: 10, maxQty: 24, unitPriceCents: 4500 },
  { minQty: 25, maxQty: 49, unitPriceCents: 4200 },
  { minQty: 50, maxQty: null, unitPriceCents: 4000 },
];

describe("resolveTier", () => {
  it.each([
    [1, 4800],
    [9, 4800],
    [10, 4500],
    [24, 4500],
    [25, 4200],
    [49, 4200],
    [50, 4000],
    [10000, 4000],
  ])("qty %d -> %d cents", (qty, price) => {
    expect(resolveTier(qty, LADDER)?.unitPriceCents).toBe(price);
  });

  it("returns null below the ladder floor", () => {
    expect(resolveTier(0, LADDER)).toBeNull();
  });

  it("every band boundary lands in exactly one tier (no gaps/overlaps)", () => {
    for (let q = 1; q <= 60; q++) {
      const matches = LADDER.filter(
        (t) => q >= t.minQty && (t.maxQty === null || q <= t.maxQty),
      );
      expect(matches).toHaveLength(1);
    }
  });

  it("rejects non-integer qty", () => {
    expect(() => resolveTier(1.5, LADDER)).toThrow();
  });
});

describe("validateTiers", () => {
  it("accepts a well-formed ladder", () => {
    expect(() => validateTiers(LADDER)).not.toThrow();
  });
  it("rejects empty", () => {
    expect(() => validateTiers([])).toThrow();
  });
  it("rejects a gap between bands", () => {
    const gap: VolumeTier[] = [
      { minQty: 1, maxQty: 9, unitPriceCents: 4800 },
      { minQty: 11, maxQty: null, unitPriceCents: 4500 }, // 10 missing
    ];
    expect(() => validateTiers(gap)).toThrow();
  });
  it("rejects an overlap between bands", () => {
    const overlap: VolumeTier[] = [
      { minQty: 1, maxQty: 10, unitPriceCents: 4800 },
      { minQty: 10, maxQty: null, unitPriceCents: 4500 }, // 10 overlaps
    ];
    expect(() => validateTiers(overlap)).toThrow();
  });
  it("rejects a non-final open band", () => {
    const badOpen: VolumeTier[] = [
      { minQty: 1, maxQty: null, unitPriceCents: 4800 },
      { minQty: 2, maxQty: null, unitPriceCents: 4500 },
    ];
    expect(() => validateTiers(badOpen)).toThrow();
  });
});
