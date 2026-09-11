/**
 * Margin guardrail — turns a margin number into a business verdict.
 *
 * This is the safety rail Luke asked for: when he moves the price below his
 * target margin it must warn, and below a hard floor it must scream. The engine
 * never blocks a save (he may have a strategic reason) — it makes the
 * consequence impossible to miss.
 */
import type { GuardrailStatus, GuardrailVerdict, MarginTarget } from "./types";

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function validateTarget(target: MarginTarget): void {
  const { targetFraction, floorFraction } = target;
  if (!Number.isFinite(targetFraction) || targetFraction < 0 || targetFraction >= 1) {
    throw new RangeError(`targetFraction must be in [0, 1): ${targetFraction}`);
  }
  if (floorFraction !== undefined) {
    if (!Number.isFinite(floorFraction) || floorFraction < 0 || floorFraction >= 1) {
      throw new RangeError(`floorFraction must be in [0, 1): ${floorFraction}`);
    }
    if (floorFraction > targetFraction) {
      throw new RangeError(
        `floorFraction ${floorFraction} cannot exceed targetFraction ${targetFraction}`,
      );
    }
  }
}

/**
 * Score an actual margin fraction against a target.
 *   - null margin (no sell price) is treated as "critical" — you can't ship a
 *     priceless line and call it fine.
 *   - >= target            -> "above"    (green ✓)
 *   - floor <= x < target  -> "warn"     (amber)
 *   - x < floor            -> "critical" (red).  No floor => below target is "warn".
 */
export function evaluateGuardrail(
  actualFraction: number | null,
  target: MarginTarget,
): GuardrailVerdict {
  validateTarget(target);

  if (actualFraction === null) {
    return {
      status: "critical",
      actualFraction: null,
      target,
      gapFraction: null,
      message: "No sell price set — margin is undefined.",
    };
  }

  const gapFraction = actualFraction - target.targetFraction;
  let status: GuardrailStatus;
  let message: string;

  if (actualFraction >= target.targetFraction) {
    status = "above";
    message = `Margin ${pct(actualFraction)} meets target ${pct(target.targetFraction)}.`;
  } else if (target.floorFraction !== undefined && actualFraction < target.floorFraction) {
    status = "critical";
    message = `Margin ${pct(actualFraction)} is BELOW the ${pct(target.floorFraction)} floor.`;
  } else {
    status = "warn";
    message = `Margin ${pct(actualFraction)} is under target ${pct(target.targetFraction)}.`;
  }

  return { status, actualFraction, target, gapFraction, message };
}
