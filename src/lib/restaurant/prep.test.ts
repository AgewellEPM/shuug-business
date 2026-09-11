// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
import { restaurantManagementData, restaurantFinanceData } from "./management";
import { restaurantCommandCatalog } from "./commands";
import { accountBalance, trialBalance } from "../accounting/ledger";
import { advanceTicket } from "./store";

let directory: string;
const state = () => restaurantBusinessSnapshot();
const run = (action: string, input: unknown, requestId = randomUUID()) => executeRestaurantCommand({ action, input, requestId }, "Prep fixture cook");
const batch = (id: string) => state().prepBatches!.find(b => b.id === id)!;
const balance = (account: number) => accountBalance(trialBalance(state().journals), account);
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-prep-`); vi.stubEnv("DEALDESK_DATA_DIR", directory);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T17:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { force: true, recursive: true }); });
function setup() {
  run("configure", { name: "Prep kitchen", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 0, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Prep supply", email: "", phone: "", active: true }).id;
  const ingredient = (name: string) => run("ingredient.save", { name, unit: "g", reorderAt: 0, targetStock: 2000, supplierId: null, active: true }).id;
  const raw = ingredient("Tomatoes"), salt = ingredient("Salt"), output = ingredient("Prepared sauce");
  run("receive", { supplierId: supplier, invoiceReference: "RAW-1", date: "2026-09-21", purchaseId: null, lines: [
    { ingredientId: raw, quantity: 1000, cost: 1001, expires: "2026-09-30" }, { ingredientId: salt, quantity: 100, cost: 100, expires: null },
  ] });
  const inputs = [{ ingredientId: raw, quantity: 500 }, { ingredientId: salt, quantity: 10 }];
  const recipe = run("prep.recipe.save", { name: "House sauce", outputIngredientId: output, expectedQuantity: 400, inputs, instructions: "Fixture instructions", active: true }).id;
  return { supplier, raw, salt, output, inputs, recipe };
}
function start(f: ReturnType<typeof setup>, reference = "SAUCE-1", requestId = randomUUID()) {
  return run("prep.start", { recipeId: f.recipe, recipeRevision: 1, batches: 1, reference, inputs: f.inputs, evidence: "Measured inputs on kitchen scale", reviewed: true }, requestId).id;
}
function finish(id: string, quantity = 350, expires = "2026-09-22") { return run("prep.complete", { id, revision: batch(id).revision, quantity, expires, evidence: "Measured yield and reviewed release", reviewed: true }); }

it("carries raw ingredient costs through actual prep yield into menu sale and shared accounting", () => {
  const f = setup(), id = start(f);
  expect(batch(id).foodCost).toBe(511); expect(balance(1320)).toBe(511); expect(balance(1300)).toBe(590);
  expect(state().lots.some(l => l.ingredientId === f.output)).toBe(false);
  finish(id);
  const lot = state().lots.find(l => l.prepBatchId === id)!;
  expect(lot).toMatchObject({ receivedQuantity: 350, remainingCost: 511, ingredientId: f.output, expires: "2026-09-22" });
  expect(balance(1320)).toBe(0); expect(balance(1300)).toBe(1101); expect(state().bills).toHaveLength(1);
  const menu = run("menu.save", { name: "Sauce bowl", category: "Main", price: 1000, station: "Line", description: "Fixture", allergens: "Reviewed fixture notes", active: true, recipe: [{ ingredientId: f.output, quantity: 50 }] }).id;
  expect(restaurantManagementData(false).menu[0]).toMatchObject({ available: 7, estimatedCost: 73 });
  const orderId = run("order.create", { ref: "SAUCE-CHECK", channel: "takeaway", guest: "Fixture", covers: 1, reservationId: null, server: "Cook", note: "", lines: [{ menuId: menu, qty: 7 }] }).id;
  run("order.fire", { id: orderId, revision: 1, allergensReviewed: true });
  const order = state().orders[0]; expect(order.foodCost).toBe(511);
  advanceTicket(order.ticketId!, "cooking"); advanceTicket(order.ticketId!, "ready"); run("order.serve", { id: orderId, revision: order.revision });
  expect(balance(1320)).toBe(0); expect(balance(1300)).toBe(590); expect(trialBalance(state().journals).balanced).toBe(true);
  expect(state().prepBatches![0]).toEqual(batch(id)); expect(batch(id).consumed.every(c => state().lots.some(l => l.id === c.lotId))).toBe(true);
});
it("rejects competing batch starts, short inputs and changed retry payloads without partial consumption", () => {
  const f = setup(); start(f); const id = start(f, "SAUCE-2"), before = JSON.stringify(state());
  expect(() => start(f, "SAUCE-3")).toThrow("Insufficient"); expect(JSON.stringify(state())).toBe(before);
  expect(batch(id).foodCost).toBe(510); expect(balance(1320)).toBe(1021);
});
it("rolls back a deduction of the first input when the second input is short", () => {
  const f = setup(), before = JSON.stringify(state());
  expect(() => start({ ...f, inputs: [f.inputs[0], { ingredientId: f.salt, quantity: 101 }] })).toThrow("Insufficient");
  expect(JSON.stringify(state())).toBe(before);
});
it("keeps exact command retries and whole-cent allocation without another lot or journal", () => {
  const f = setup(), requestId = randomUUID(), id = start(f, "EXACT", requestId), before = JSON.stringify(state());
  expect(start(f, "EXACT", requestId)).toBe(id); expect(JSON.stringify(state())).toBe(before);
  expect(() => start(f, "CHANGED", requestId)).toThrow("another action");
  const finishRequest = randomUUID(), input = { id, revision: 1, quantity: 349, expires: "2026-09-23", evidence: "Measured and reviewed", reviewed: true };
  run("prep.complete", input, finishRequest); const completed = JSON.stringify(state()); run("prep.complete", input, finishRequest);
  expect(JSON.stringify(state())).toBe(completed); expect(() => run("prep.complete", input)).toThrow("already finished");
});
it("preserves recipe snapshots and stock units and requires a fresh recipe review", () => {
  const f = setup(), id = start(f), captured = batch(id).recipe;
  run("prep.recipe.save", { ...state().prepRecipes![0], expectedQuantity: 800, instructions: "New future process" });
  expect(batch(id).recipe).toEqual(captured); expect(() => start(f, "STALE")).toThrow("recipe changed");
  expect(() => run("ingredient.save", { ...state().ingredients.find(i => i.id === f.output), unit: "ml" })).toThrow("fixed");
  expect(() => run("prep.recipe.save", { ...state().prepRecipes![0], inputs: [{ ingredientId: f.output, quantity: 5 }] })).toThrow("own output");
});
it("records a full prep loss with retained input history and no finished stock or duplicate bill", () => {
  const f = setup(), id = start(f);
  run("prep.discard", { id, revision: 1, evidence: "Entire batch spilled during preparation", reviewed: true });
  expect(batch(id)).toMatchObject({ status: "discarded", actualQuantity: 0, completedBy: "Prep fixture cook" });
  expect(balance(6910)).toBe(511); expect(balance(1320)).toBe(0); expect(state().lots.filter(l => l.ingredientId === f.output)).toHaveLength(0);
  expect(state().bills).toHaveLength(1); expect(() => finish(id)).toThrow("already finished");
});
it("excludes expired inputs at the restaurant calendar date even before the business-day cutoff", () => {
  const f = setup();
  run("receive", { supplierId: f.supplier, invoiceReference: "EXPIRES-TODAY", date: "2026-09-21", purchaseId: null, lines: [{ ingredientId: f.raw, quantity: 500, cost: 99, expires: "2026-09-21" }] });
  vi.setSystemTime(new Date("2026-09-22T06:00:00Z"));
  const id = start(f); expect(batch(id).foodCost).toBe(511);
  expect(batch(id).consumed.some(c => state().lots.find(l => l.id === c.lotId)?.invoiceReference === "EXPIRES-TODAY")).toBe(false);
  expect(() => finish(id, 350, "2026-09-21")).toThrow("calendar date"); finish(id, 350, "2026-09-22");
});
it("keeps preparation in progress across close dates and posts completion only in an open period", () => {
  const f = setup(), id = start(f);
  run("close", { date: "2026-09-21", operated: false, countedCash: 0, note: "Prep-only day reviewed", reviewed: true });
  const close = structuredClone(state().closes[0]); expect(() => finish(id)).toThrow("closed");
  vi.setSystemTime(new Date("2026-09-22T17:00:00Z")); finish(id);
  expect(state().closes[0]).toEqual(close); expect(state().journals.find(j => j.source === `restaurant-prep-complete:${id}`)?.date).toBe("2026-09-22");
});
it("invalidates physical counts when prep consumes their lots and excludes recipes from the finance projection", () => {
  const f = setup(); run("stocktake.start", { reference: "PREP-COUNT", ingredientIds: [f.raw], note: "Started physical count" }); start(f);
  expect(restaurantManagementData(false).stocktakes[0].stale).toBe(true);
  expect(restaurantFinanceData().prepBatches).toEqual([]); expect(restaurantFinanceData().prepRecipes).toEqual([]);
  expect(restaurantCommandCatalog().filter(c => c.action.startsWith("prep.")).map(c => c.action)).toEqual(["prep.recipe.save", "prep.start", "prep.complete", "prep.discard"]);
});
it("requires complete measured inputs, valid output quantities, reviewed evidence and active ingredients", () => {
  const f = setup(); expect(() => start({ ...f, inputs: [f.inputs[0]] })).toThrow("exactly once");
  expect(() => start({ ...f, inputs: [f.inputs[0], f.inputs[0]] })).toThrow("exactly once");
  const id = start(f); expect(() => finish(id, 0)).toThrow(); expect(() => finish(id, 1.5)).toThrow();
  expect(() => run("prep.discard", { id, revision: 1, evidence: "Reviewed", reviewed: false })).toThrow();
  const output = state().ingredients.find(i => i.id === f.output)!; run("ingredient.save", { ...output, active: false });
  expect(() => finish(id)).toThrow("Restore"); expect(batch(id).status).toBe("preparing");
});
