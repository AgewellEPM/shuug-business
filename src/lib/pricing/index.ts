/** Pricing engine public surface. Import from "@/lib/pricing". */
export * from "./types";
export { computeMargin, discountFraction, sellForTargetMargin } from "./margin";
export { evaluateGuardrail, validateTarget } from "./guardrail";
export { resolveTier, validateTiers } from "./tiers";
export { standardLadder } from "./ladder";
export { priceOrder, computeFreight, tierLabel, type OrderPricing } from "./order";
export {
  validateOrder,
  type OrderValidation,
  type Violation,
  type ViolationCode,
} from "./order-validation";
