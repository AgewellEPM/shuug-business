import { z } from "zod";
const id = z.uuid(), quantity = z.number().int().min(0).max(1_000_000_000), cents = z.number().int().min(0).max(99_999_999), reference = z.string().trim().min(1).max(100), note = z.string().trim().min(3).max(1000);
export const stocktakeStartInput = z.object({ reference, ingredientIds: z.array(id).min(1).max(100), note }).strict();
export const stocktakeVersionInput = z.object({ id, revision: z.number().int().positive() }).strict();
export const stocktakeRecordInput = stocktakeVersionInput.extend({ lineId: id, quantity, reason: z.string().trim().max(1000) }).strict();
export const stocktakeFoundInput = stocktakeVersionInput.extend({ foundId: id.optional(), ingredientId: id, supplierId: id, lotReference: reference, quantity: quantity.positive(), cost: cents.positive(), expires: z.iso.date().nullable(), evidence: note, owned: z.literal(true) }).strict();
export const stocktakeRemoveFoundInput = stocktakeVersionInput.extend({ foundId: id, reason: note }).strict();
export const stocktakeSubmitInput = stocktakeVersionInput.extend({ confirmed: z.literal(true) }).strict();
export const stocktakePostInput = stocktakeVersionInput.extend({ reviewed: z.literal(true), evidence: note }).strict();
export const stocktakeReturnInput = stocktakeVersionInput.extend({ reason: note }).strict();
export const stocktakeRestartInput = stocktakeVersionInput.extend({ reference, reason: note }).strict();
export interface StocktakeLine { id: string; ingredientId: string; ingredientName: string; unit: "g" | "ml" | "each"; lotId: string; lotReference: string; supplierId: string; expires: string | null; expectedQuantity: number; expectedCost: number; basisQuantity: number; basisCost: number; countedQuantity: number | null; reason: string; counter: string | null; countedAt: string | null }
export interface FoundStock { id: string; ingredientId: string; supplierId: string; lotReference: string; quantity: number; cost: number; expires: string | null; evidence: string; counter: string; countedAt: string }
export interface RestaurantStocktake {
  id: string; revision: number; reference: string; date: string; timezone: string; status: "counting" | "submitted" | "posted" | "cancelled";
  scope: { id: string; name: string; unit: "g" | "ml" | "each" }[]; fingerprint: string; lines: StocktakeLine[]; found: FoundStock[];
  startedAt: string; startedBy: string; note: string; submittedAt: string | null; submittedBy: string | null; postedAt: string | null; postedBy: string | null; postingEvidence: string; recountOf: string | null;
  history: { at: string; actor: string; action: string; note: string; lineId?: string; before?: unknown; after?: unknown }[];
}
