/**
 * Order pricing engine — turns "how many cases of each SKU" into a priced
 * order, using the customer's agreed volume tiers and freight policy. Pure and
 * deterministic; price is captured per line at order time so history is stable
 * even if the agreement later changes.
 */
import { resolveTier } from "./tiers";
import type { VolumeTier } from "./types";
import type {
  FreightPolicy,
  OrderDraftLine,
  OrderLine,
  PriceAgreement,
  Sku,
} from "../data/model";

export interface OrderPricing {
  lines: OrderLine[];
  subtotalCents: number;
  freightCents: number;
  freightNote: string;
  totalCents: number;
}

/** Human label for a tier band, e.g. "10–24" or "50+". */
export function tierLabel(tier: VolumeTier): string {
  return tier.maxQty === null ? `${tier.minQty}+` : `${tier.minQty}–${tier.maxQty}`;
}

/** Freight charged for an order subtotal under a given policy. */
export function computeFreight(
  policy: FreightPolicy,
  subtotalCents: number,
): { freightCents: number; note: string } {
  switch (policy.kind) {
    case "customer_pays":
      return { freightCents: 0, note: "Customer arranges freight" };
    case "included":
      return { freightCents: 0, note: "Freight included" };
    case "flat":
      return { freightCents: policy.amountCents ?? 0, note: "Flat freight" };
    case "free_over": {
      const threshold = policy.amountCents ?? 0;
      if (subtotalCents >= threshold) return { freightCents: 0, note: "Free freight (over threshold)" };
      return { freightCents: policy.belowChargeCents ?? 0, note: "Freight (under threshold)" };
    }
    default:
      return { freightCents: 0, note: "" };
  }
}

/**
 * Price a draft order against an agreement. Lines may be ordered by the case or
 * by the bottle; bottle lines convert to a case-equivalent for tier lookup and
 * are priced per bottle (tier case price / bottles-per-case). Zero-qty lines are
 * dropped. Fail-fast on unknown SKUs, bad quantities, or a bottle order without
 * a known case size (pass `skus`).
 */
export function priceOrder(
  draft: OrderDraftLine[],
  agreement: PriceAgreement,
  skus: Sku[] = [],
): OrderPricing {
  const lineBySku = new Map(agreement.lines.map((l) => [l.skuId, l]));
  const unitsBySku = new Map(skus.map((s) => [s.id, s.unitsPerCase]));

  const lines: OrderLine[] = [];
  for (const d of draft) {
    const unit = d.unit ?? "case";
    const quantity = d.quantity ?? d.cases ?? 0;
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new RangeError(`quantity for ${d.skuId} must be a non-negative integer, got ${quantity}`);
    }
    if (quantity === 0) continue;

    const agreementLine = lineBySku.get(d.skuId);
    if (!agreementLine) throw new Error(`priceOrder: SKU ${d.skuId} is not on this agreement`);

    // Case-equivalent quantity: the tier band a bottle order falls into.
    let caseEquiv: number;
    let tierCaseQty: number;
    if (unit === "bottle") {
      const units = unitsBySku.get(d.skuId);
      if (!units || units < 1) {
        throw new Error(`priceOrder: bottle order for ${d.skuId} needs a known unitsPerCase (pass skus)`);
      }
      caseEquiv = quantity / units;
      tierCaseQty = Math.max(1, Math.floor(caseEquiv));
    } else {
      caseEquiv = quantity;
      tierCaseQty = quantity;
    }

    const override = d.overrideUnitPriceCents;
    const hasOverride = override !== undefined && override !== null;
    if (hasOverride && (!Number.isInteger(override) || override < 0)) {
      throw new RangeError(`override price for ${d.skuId} must be a non-negative integer`);
    }

    const tier = resolveTier(tierCaseQty, agreementLine.tiers);
    if (!tier) throw new Error(`priceOrder: no tier covers ${tierCaseQty} cases for ${d.skuId}`);

    // Unit price is per ORDERED unit: per case, or per bottle (case price / units).
    const units = unitsBySku.get(d.skuId) ?? 1;
    const tierUnitPrice = unit === "bottle" ? Math.round(tier.unitPriceCents / units) : tier.unitPriceCents;
    const unitPriceCents = hasOverride ? (override as number) : tierUnitPrice;
    const label = hasOverride ? "custom" : unit === "bottle" ? `${tierLabel(tier)}/btl` : tierLabel(tier);

    lines.push({
      skuId: d.skuId,
      unit,
      quantity,
      cases: caseEquiv,
      unitPriceCents,
      tierLabel: label,
      isOverride: hasOverride,
      lineTotalCents: unitPriceCents * quantity,
      ...(skus.some(s => s.id === d.skuId) ? { costAtOrderCents: Math.round(skus.find(s => s.id === d.skuId)!.costPerCaseCents * caseEquiv) } : {}),
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const { freightCents, note } = computeFreight(agreement.freight, subtotalCents);

  return {
    lines,
    subtotalCents,
    freightCents,
    freightNote: note,
    totalCents: subtotalCents + freightCents,
  };
}
