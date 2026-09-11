import { modifierGroupsInput, restaurantOrderLineInput } from "./modifier-model";
import { prepRecipeInput, prepStartInput, prepCompleteInput, prepDiscardInput } from "./prep-model";
import { stocktakeStartInput, stocktakeRecordInput, stocktakeFoundInput, stocktakeRemoveFoundInput, stocktakeSubmitInput, stocktakePostInput, stocktakeReturnInput, stocktakeRestartInput } from "./stocktake-model";
import { restaurantCreditInput, restaurantCancelCreditInput, restaurantRefundInput } from "./credit-model";
import { z } from "zod";
import { openMinutesInput, serviceHoursInput } from "./report-model";
import { specialInput, specialCodeInput, specialVersionInput, specialPublishInput, specialSpendInput } from "./special-model";
import { restaurantWebsiteInput, pickupSlotInput } from "./website-model";

const id = z.uuid(), cents = z.number().int().min(0).max(99_999_999), quantity = z.number().int().min(1).max(1_000_000_000);
const edit = { id: id.optional(), revision: z.number().int().positive().optional() };
const version = { id, revision: z.number().int().positive() };
const name = z.string().trim().min(1).max(100), reference = z.string().trim().min(1).max(100), note = z.string().trim().max(2000);
const recipe = z.array(z.object({ ingredientId: id, quantity }).strict()).min(1).max(100);

export const restaurantActionSchemas = {
  "prep.recipe.save": prepRecipeInput, "prep.start": prepStartInput, "prep.complete": prepCompleteInput, "prep.discard": prepDiscardInput,
  "hours.review": serviceHoursInput,
  "credit.issue": restaurantCreditInput, "credit.cancel": restaurantCancelCreditInput, "refund.record": restaurantRefundInput,
  "stocktake.start": stocktakeStartInput, "stocktake.record": stocktakeRecordInput, "stocktake.found": stocktakeFoundInput, "stocktake.remove-found": stocktakeRemoveFoundInput, "stocktake.submit": stocktakeSubmitInput, "stocktake.post": stocktakePostInput, "stocktake.return": stocktakeReturnInput, "stocktake.cancel": stocktakeReturnInput, "stocktake.recount": stocktakeRestartInput,
  "special.save": specialInput, "special.publish": specialPublishInput, "special.pause": specialVersionInput, "special.archive": specialVersionInput, "special.spend": specialSpendInput,
  "website.configure": restaurantWebsiteInput,
  "pickup.save": pickupSlotInput,
  "order.allergens": z.object({ ...version, reviewed: z.literal(true) }).strict(),
  "configure": z.object({ name, timezone: z.string().min(1).max(80), taxBasisPoints: z.number().int().min(0).max(3000), taxReviewed: z.literal(true), businessDayStartHour: z.number().int().min(0).max(12) }).strict(),
  "supplier.save": z.object({ ...edit, name, email: z.union([z.email().max(160), z.literal("")]), phone: z.string().max(40), active: z.boolean() }).strict(),
  "ingredient.save": z.object({ ...edit, name, unit: z.enum(["g", "ml", "each"]), reorderAt: z.number().int().min(0).max(1_000_000_000), targetStock: z.number().int().min(0).max(1_000_000_000), supplierId: id.nullable(), active: z.boolean() }).strict(),
  "menu.save": z.object({ ...edit, name: name.max(80), category: name, price: cents.positive(), station: z.string().trim().min(1).max(40), description: note, allergens: z.string().trim().min(1).max(1000), recipe, modifierGroups: modifierGroupsInput.optional(), active: z.boolean() }).strict(),
  "purchase.save": z.object({ ...edit, supplierId: id, reference, lines: z.array(z.object({ ingredientId: id, quantity, expectedCost: cents }).strict()).min(1).max(100) }).strict(),
  "purchase.order": z.object(version).strict(),
  "purchase.cancel": z.object(version).strict(),
  "receive": z.object({ supplierId: id, invoiceReference: reference, date: z.iso.date(), purchaseId: id.nullable(), lines: z.array(z.object({ ingredientId: id, quantity, cost: cents.positive(), expires: z.iso.date().nullable() }).strict()).min(1).max(100) }).strict(),
  "waste": z.object({ ingredientId: id, quantity, date: z.iso.date(), reason: z.string().trim().min(3).max(1000), includeExpired: z.boolean() }).strict(),
  "order.create": z.object({ specialCode: specialCodeInput, ref: z.string().trim().min(1).max(40), channel: z.enum(["dine_in", "takeaway"]), guest: z.string().trim().max(100), covers: z.number().int().min(1).max(100), reservationId: id.nullable(), server: z.string().trim().min(1).max(60), note: z.string().max(200), lines: z.array(restaurantOrderLineInput).min(1).max(100) }).strict(),
  "order.fire": z.object({ ...version, allergensReviewed: z.literal(true) }).strict(),
  "order.serve": z.object(version).strict(),
  "order.close": z.object(version).strict(),
  "order.cancel": z.object({ ...version, reason: z.string().trim().min(3).max(1000) }).strict(),
  "tender": z.object({ ...version, method: z.enum(["cash", "external_card"]), amount: cents.positive(), tip: cents, reference, received: z.literal(true) }).strict(),
  "bill.pay": z.object({ id, amount: cents.positive(), reference, paid: z.literal(true) }).strict(),
  "drawer.transfer": z.object({ amount: cents.positive(), reference, direction: z.enum(["in", "out"]).optional(), fees: cents.optional(), method: z.enum(["cash", "bank"]).optional(), evidence: z.string().trim().min(3).max(1000), confirmed: z.literal(true) }).strict(),
  "processor.settle": z.object({ amount: cents.positive(), reference, direction: z.enum(["in", "out"]).optional(), fees: cents.optional(), method: z.enum(["cash", "bank"]).optional(), evidence: z.string().trim().min(3).max(1000), confirmed: z.literal(true) }).strict(),
  "tips.pay": z.object({ amount: cents.positive(), reference, direction: z.enum(["in", "out"]).optional(), fees: cents.optional(), method: z.enum(["cash", "bank"]).optional(), evidence: z.string().trim().min(3).max(1000), confirmed: z.literal(true) }).strict(),
  "close": z.object({ date: z.iso.date(), operated: z.boolean(), openMinutes: openMinutesInput.optional(), countedCash: cents, note: z.string().trim().min(3).max(2000), reviewed: z.literal(true) }).strict(),
} as const;

export function restaurantCommandCatalog() {
  return Object.entries(restaurantActionSchemas).map(([action, schema]) => ({ action, inputSchema: z.toJSONSchema(schema) }));
}
