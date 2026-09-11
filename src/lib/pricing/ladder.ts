/**
 * Standard volume-ladder policy: derive the 4-band tier ladder from a base
 * (tier-1) case price. Single source of truth so the seed data and the "save
 * price agreement" path can never drift apart on how tiers are built.
 *
 * Steps: 1–9 base, 10–24 -$3.00, 25–49 -$6.00, 50+ -$8.00, floored at $0.
 */
import type { VolumeTier } from "./types";

const STEP_CENTS = [0, 300, 600, 800];

export function standardLadder(baseCents: number): VolumeTier[] {
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    throw new RangeError(`standardLadder: baseCents must be a non-negative integer, got ${baseCents}`);
  }
  const price = (i: number) => Math.max(0, baseCents - STEP_CENTS[i]);
  return [
    { minQty: 1, maxQty: 9, unitPriceCents: price(0) },
    { minQty: 10, maxQty: 24, unitPriceCents: price(1) },
    { minQty: 25, maxQty: 49, unitPriceCents: price(2) },
    { minQty: 50, maxQty: null, unitPriceCents: price(3) },
  ];
}
