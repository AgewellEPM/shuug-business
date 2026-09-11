/** Synthetic fixture for the modifier acceptance tests; never used by app routes. */
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
import type { ModifierGroup } from "./modifier-model";
export const modifierCommand = (action: string, input: unknown, requestId = randomUUID()) => executeRestaurantCommand({ requestId, action, input }, "Modifier fixture");
export function modifierFixture() {
  if (!process.env.DEALDESK_DATA_DIR?.includes("shuug-modifier")) throw new Error("Use disposable modifier fixture data.");
  const run = modifierCommand;
  run("configure", { name: "Modifier Kitchen", timezone: "UTC", businessDayStartHour: 0, taxBasisPoints: 1000, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Fixture supplier", email: "", phone: "", active: true }).id;
  const ingredient = (name: string, unit = "g") => run("ingredient.save", { name, unit, reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true }).id;
  const bun = ingredient("Buns", "each"), beef = ingredient("Beef"), cheese = ingredient("Cheese"), potato = ingredient("Potatoes"), lettuce = ingredient("Lettuce");
  run("receive", { supplierId: supplier, invoiceReference: "FIXTURE-STOCK", date: "2026-09-21", purchaseId: null, lines: [bun, beef, cheese, potato, lettuce].map(id => ({ ingredientId: id, quantity: id === bun ? 100 : 1000, cost: id === cheese ? 2000 : 1000, expires: "2026-10-01" })) });
  const fries = randomUUID(), salad = randomUUID(), extra = randomUUID(), omit = randomUUID();
  const groups: ModifierGroup[] = [{ id: randomUUID(), name: "Side", min: 1, max: 1, options: [{ id: fries, name: "Fries", priceDelta: 0, allergens: "Shared fryer", active: true, recipe: [{ ingredientId: potato, quantity: 30 }] }, { id: salad, name: "Salad", priceDelta: 50, allergens: "Kitchen reviewed dressing", active: true, recipe: [{ ingredientId: lettuce, quantity: 20 }] }] }, { id: randomUUID(), name: "Cheese choice", min: 0, max: 1, options: [{ id: extra, name: "Extra cheese", priceDelta: 200, allergens: "Contains milk", active: true, recipe: [{ ingredientId: cheese, quantity: 10 }] }, { id: omit, name: "Omit cheese", priceDelta: -100, allergens: "Shared preparation area; discuss dietary needs", active: true, recipe: [{ ingredientId: cheese, quantity: -20 }] }] }];
  const menu = run("menu.save", { name: "Burger", category: "Main", price: 1000, station: "Grill", description: "Fixture burger", allergens: "Contains wheat and milk; kitchen review required", active: true, recipe: [{ ingredientId: bun, quantity: 1 }, { ingredientId: beef, quantity: 100 }, { ingredientId: cheese, quantity: 20 }], modifierGroups: groups }).id;
  run("website.configure", { revision: 1, enabled: true, origins: [], instructions: "Synthetic pickup at the counter; pay at pickup." });
  const slot = run("pickup.save", { at: "2026-09-21T18:00:00Z", capacity: 20, enabled: true }).id;
  return { supplier, bun, beef, cheese, potato, lettuce, fries, salad, extra, omit, groups, menu, slot };
}
export function modifierDraft(menuId: string, options: string[], more: { menuId: string; qty: number; options: string[] }[] = []) {
  return modifierCommand("order.create", { ref: randomUUID(), channel: "takeaway", guest: "Guest", covers: 1, reservationId: null, server: "Fixture", note: "Review dietary needs", lines: [{ menuId, qty: 1, options }, ...more] }).id;
}
export const modifierOrder = (id: string) => restaurantBusinessSnapshot().orders.find(o => o.id === id)!;
