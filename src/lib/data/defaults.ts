/**
 * Default commercial terms for a brand-new customer. One place so the
 * "add customer" flow and any future template share the same starting point.
 * The owner tunes prices/margins afterward on the agreement page.
 */
import { standardLadder } from "../pricing/ladder";
import type { PriceAgreement, Sku } from "./model";

export const DEFAULT_TARGET_MARGIN = 0.4;
export const DEFAULT_FLOOR_MARGIN = 0.3;

/** Build a starting agreement: every SKU priced at standard, 1-year validity. */
export function defaultAgreement(
  customerId: string,
  skus: Sku[],
  opts: {
    targetMarginFraction?: number;
    floorMarginFraction?: number | null;
    approvedBy: string;
    effectiveDate: string; // ISO date
    expirationDate: string; // ISO date
    /**
     * The customer's chosen item list + per-case price. When provided, only
     * these SKUs are carried (a per-customer item list). Omit to carry every
     * SKU at standard wholesale.
     */
    lines?: { skuId: string; unitPriceCents: number }[];
  },
): PriceAgreement {
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const chosen =
    opts.lines && opts.lines.length > 0
      ? opts.lines
      : skus.map((s) => ({ skuId: s.id, unitPriceCents: s.standardPriceCents }));

  return {
    id: `agr-${customerId}`,
    customerId,
    targetMarginFraction: opts.targetMarginFraction ?? DEFAULT_TARGET_MARGIN,
    floorMarginFraction:
      opts.floorMarginFraction === undefined ? DEFAULT_FLOOR_MARGIN : opts.floorMarginFraction,
    paymentTerms: "net30",
    creditLimitCents: null,
    minCasesPerOrder: 10,
    minOrderDollarsCents: 250_000,
    freight: { kind: "free_over", amountCents: 250_000, belowChargeCents: 7_500 },
    effectiveDate: opts.effectiveDate,
    expirationDate: opts.expirationDate,
    approvedBy: opts.approvedBy,
    lines: chosen.map((c) => {
      if (!skuById.has(c.skuId)) throw new Error(`defaultAgreement: unknown SKU ${c.skuId}`);
      return {
        skuId: c.skuId,
        unitPriceCents: c.unitPriceCents,
        tiers: standardLadder(c.unitPriceCents),
        minCasesPerSku: 0,
      };
    }),
  };
}
