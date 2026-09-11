/**
 * Order validation — enforces the agreement's commercial rules before an order
 * can be placed: minimum cases/order, minimum $/order, per-SKU minimums, and
 * the PO-number requirement. Pure; returns every violation (not just the first)
 * so the UI can show the buyer the whole gap at once.
 */
import { formatCents } from "../money";
import type { OrderPricing } from "./order";
import type { PriceAgreement } from "../data/model";

export type ViolationCode =
  | "empty"
  | "min_cases"
  | "min_dollars"
  | "min_cases_per_sku"
  | "po_required";

export interface Violation {
  code: ViolationCode;
  message: string;
}

export interface OrderValidation {
  ok: boolean;
  totalCases: number;
  violations: Violation[];
}

export interface ValidateOrderInput {
  pricing: OrderPricing;
  agreement: PriceAgreement;
  requiresPO: boolean;
  poNumber: string | null;
}

export function validateOrder({
  pricing,
  agreement,
  requiresPO,
  poNumber,
}: ValidateOrderInput): OrderValidation {
  const violations: Violation[] = [];
  const totalCases = pricing.lines.reduce((n, l) => n + l.cases, 0);

  if (pricing.lines.length === 0) {
    violations.push({ code: "empty", message: "Order is empty — add at least one case." });
  }

  if (totalCases < agreement.minCasesPerOrder) {
    violations.push({
      code: "min_cases",
      message: `Minimum ${agreement.minCasesPerOrder} cases/order (have ${totalCases}).`,
    });
  }

  if (pricing.subtotalCents < agreement.minOrderDollarsCents) {
    violations.push({
      code: "min_dollars",
      message: `Minimum ${formatCents(agreement.minOrderDollarsCents)}/order (have ${formatCents(pricing.subtotalCents)}).`,
    });
  }

  // Per-SKU minimums apply to any SKU actually ordered.
  const orderedBySku = new Map(pricing.lines.map((l) => [l.skuId, l.cases]));
  for (const line of agreement.lines) {
    if (line.minCasesPerSku <= 0) continue;
    const cases = orderedBySku.get(line.skuId);
    if (cases !== undefined && cases < line.minCasesPerSku) {
      violations.push({
        code: "min_cases_per_sku",
        message: `${line.skuId}: minimum ${line.minCasesPerSku} cases (have ${cases}).`,
      });
    }
  }

  if (requiresPO && !(poNumber && poNumber.trim())) {
    violations.push({ code: "po_required", message: "This customer requires a PO number." });
  }

  return { ok: violations.length === 0, totalCases, violations };
}
