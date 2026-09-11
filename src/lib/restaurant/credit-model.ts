import { z } from "zod";
const cents = z.number().int().min(0).max(99_999_999);
const base = { id: z.uuid(), revision: z.number().int().positive(), reference: z.string().trim().min(1).max(100), reason: z.string().trim().min(3).max(1000), reviewed: z.literal(true) };
export const restaurantCreditInput = z.object({ ...base, lines: z.array(z.object({ menuId: z.uuid(), lineId: z.uuid().optional(), amount: cents.positive() }).strict()).max(100), tips: cents }).strict();
export const restaurantCancelCreditInput = z.object({ ...base, tips: cents }).strict();
export const restaurantRefundInput = z.object({ id: z.uuid(), revision: z.number().int().positive(), tenderId: z.uuid(), amount: cents.positive(), reference: z.string().trim().min(1).max(100), evidence: z.string().trim().min(3).max(1000), returned: z.literal(true) }).strict();
export interface RestaurantCredit {
  id: string; orderId: string; reference: string; date: string; at: string; actor: string; reason: string;
  kind: "sale" | "cancellation"; lines: { menuId: string; lineId?: string; name: string; amount: number }[];
  subtotal: number; tax: number; tips: number; deposit: number; total: number; receivableReduction: number; refundLiability: number;
}
export interface RestaurantRefund { id: string; orderId: string; tenderId: string; method: "cash" | "external_card"; amount: number; reference: string; evidence: string; date: string; at: string; actor: string }
/** Prorate the tax actually captured on the check, cumulatively, so the final
 * credit clears its exact remaining cents without recalculating today's rate. */
export function creditTaxDelta(subtotal: number, tax: number, previousSubtotal: number, previousTax: number, amount: number) {
  if (!amount || !tax) return 0;
  return Number((BigInt(previousSubtotal + amount) * BigInt(tax) + BigInt(subtotal) / BigInt(2)) / BigInt(subtotal)) - previousTax;
}
