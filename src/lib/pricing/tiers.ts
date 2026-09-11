/**
 * Volume tiers — "1–9 cases $48, 10–24 $45, 25–49 $42" instead of
 * renegotiating every order.
 *
 * A tier ladder is validated once (sorted, contiguous, non-overlapping, exactly
 * one open top) so that resolving a quantity is total and unambiguous: every
 * qty >= the first tier's minQty lands in exactly one tier.
 */
import { assertCents } from "../money";
import type { VolumeTier } from "./types";

/**
 * Validate a tier ladder. Throws (fail-fast) on any malformed ladder:
 *  - empty
 *  - non-integer / non-positive quantities
 *  - first tier not starting at its declared minQty <= that of any band gap
 *  - overlaps or gaps between consecutive bands
 *  - a non-final tier with an open (null) maxQty
 *  - a final tier that is NOT open (we require an open top so large orders never
 *    fall off the ladder). Callers wanting a closed top can pass an explicit
 *    high maxQty, but the common case is open.
 */
export function validateTiers(tiers: VolumeTier[]): void {
  if (tiers.length === 0) throw new RangeError("tier ladder is empty");

  tiers.forEach((t, i) => {
    if (!Number.isInteger(t.minQty) || t.minQty < 1) {
      throw new RangeError(`tier ${i}: minQty must be a positive integer, got ${t.minQty}`);
    }
    assertCents(t.unitPriceCents, `tier ${i} unitPriceCents`);
    if (t.unitPriceCents < 0) {
      throw new RangeError(`tier ${i}: unitPriceCents cannot be negative`);
    }
    const isLast = i === tiers.length - 1;
    if (!isLast) {
      if (t.maxQty === null) {
        throw new RangeError(`tier ${i}: only the final tier may have an open (null) maxQty`);
      }
      if (!Number.isInteger(t.maxQty) || t.maxQty < t.minQty) {
        throw new RangeError(`tier ${i}: maxQty ${t.maxQty} must be an integer >= minQty ${t.minQty}`);
      }
      const next = tiers[i + 1];
      if (next.minQty !== t.maxQty + 1) {
        throw new RangeError(
          `tier ${i}->${i + 1}: bands must be contiguous; ${t.maxQty} then ${next.minQty}`,
        );
      }
    } else if (t.maxQty !== null && (!Number.isInteger(t.maxQty) || t.maxQty < t.minQty)) {
      throw new RangeError(`final tier: maxQty must be null or an integer >= minQty`);
    }
  });
}

/**
 * Resolve the unit price for a quantity. Returns null when qty is below the
 * ladder's floor (i.e. below any minimum) — the caller decides whether that is
 * a minimum-order violation. Validates the ladder every call (cheap, and it
 * keeps a corrupt ladder from returning a plausible-but-wrong price).
 */
export function resolveTier(qty: number, tiers: VolumeTier[]): VolumeTier | null {
  if (!Number.isInteger(qty) || qty < 0) {
    throw new RangeError(`qty must be a non-negative integer, got ${qty}`);
  }
  validateTiers(tiers);
  for (const t of tiers) {
    const withinLow = qty >= t.minQty;
    const withinHigh = t.maxQty === null || qty <= t.maxQty;
    if (withinLow && withinHigh) return t;
  }
  return null;
}
