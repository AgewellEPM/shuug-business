/**
 * Margin engine — the heart of the deal desk.
 *
 * Given a cost and a sell price it answers, exactly and deterministically:
 *   your cost -> sell price -> gross profit -> margin %
 *
 * Pure functions, integer cents in, no floats for money. Margin/markup are the
 * only fractions and they are ratios, computed last, never fed back into money.
 */
import { assertCents, type Cents } from "../money";
import type { MarginResult } from "./types";

/**
 * Compute the full margin picture for a cost/sell pair.
 * Fail-fast on non-integer or negative cost/sell — those are data bugs, not
 * business cases we want to silently paper over.
 */
export function computeMargin(costCents: Cents, sellCents: Cents): MarginResult {
  assertCents(costCents, "costCents");
  assertCents(sellCents, "sellCents");
  if (costCents < 0) throw new RangeError(`costCents cannot be negative: ${costCents}`);
  if (sellCents < 0) throw new RangeError(`sellCents cannot be negative: ${sellCents}`);

  const grossProfitCents = sellCents - costCents;

  return {
    costCents,
    sellCents,
    grossProfitCents,
    marginFraction: sellCents === 0 ? null : grossProfitCents / sellCents,
    markupFraction: costCents === 0 ? null : grossProfitCents / costCents,
  };
}

/**
 * The discount off a reference (standard wholesale) price, as a fraction.
 * e.g. standard $48.00, customer $44.00 -> 0.0833... (8.33%). Negative = markup.
 * null when the standard price is 0.
 */
export function discountFraction(standardCents: Cents, customerCents: Cents): number | null {
  assertCents(standardCents, "standardCents");
  assertCents(customerCents, "customerCents");
  if (standardCents === 0) return null;
  return (standardCents - customerCents) / standardCents;
}

/**
 * Invert the margin engine: what sell price hits a target margin fraction on a
 * given cost? Returned rounded to the nearest cent (fail-fast if target >= 1,
 * which is unreachable — you can't have 100%+ margin at finite price).
 */
export function sellForTargetMargin(costCents: Cents, targetFraction: number): Cents {
  assertCents(costCents, "costCents");
  if (!Number.isFinite(targetFraction)) {
    throw new RangeError(`targetFraction must be finite: ${targetFraction}`);
  }
  if (targetFraction >= 1) {
    throw new RangeError(`targetFraction ${targetFraction} unreachable (>= 100%)`);
  }
  // margin = (sell - cost) / sell = target  =>  sell = cost / (1 - target)
  return Math.round(costCents / (1 - targetFraction));
}
