/**
 * Pricing domain types — the vocabulary of the deal desk.
 * All money is in integer cents (see ../money). All fractions are 0..1.
 */
import type { Cents } from "../money";

/** Result of running cost + sell through the margin engine. */
export interface MarginResult {
  costCents: Cents;
  sellCents: Cents;
  /** sell - cost. Can be negative (selling below cost). */
  grossProfitCents: Cents;
  /**
   * Gross margin as a fraction of the SELL price (GP / sell).
   * null when sell is 0 — margin is undefined with no revenue.
   */
  marginFraction: number | null;
  /**
   * Markup as a fraction of COST (GP / cost) — the discount/markup lens.
   * null when cost is 0.
   */
  markupFraction: number | null;
}

/** How a sell price scores against the customer's margin policy. */
export type GuardrailStatus = "above" | "warn" | "critical";

export interface MarginTarget {
  /** Desired gross margin as a fraction (e.g. 0.4 for 40%). */
  targetFraction: number;
  /**
   * Optional hard floor as a fraction. A margin below this is "critical"
   * (red), between floor and target is "warn" (amber), at/above target is
   * "above" (green). Omit to make anything below target a plain "warn".
   */
  floorFraction?: number;
}

export interface GuardrailVerdict {
  status: GuardrailStatus;
  /** actual margin fraction that was evaluated (echoed for the UI). */
  actualFraction: number | null;
  target: MarginTarget;
  /** signed gap: actual - target (fraction). Negative means under target. */
  gapFraction: number | null;
  message: string;
}

/**
 * A single volume tier: quantity band -> price per unit (case).
 * maxQty null = open-ended top tier.
 */
export interface VolumeTier {
  minQty: number;
  maxQty: number | null;
  unitPriceCents: Cents;
}
