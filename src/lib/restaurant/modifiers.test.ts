// @vitest-environment node
import { sealSecret, openSecret } from "../connections/vault";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { modifierFixture, modifierCommand as run, modifierDraft as draft, modifierOrder as order } from "./modifier-fixture";
import { restaurantBusinessSnapshot as state } from "./business";
import { advanceTicket, restaurantState } from "./store";
import { restaurantCreditView } from "./credits";
import { restaurantSalesReport } from "./reporting";
import { isBalanced } from "../accounting/ledger";
import { restaurantMenuProof, reviewRestaurantPickup, submitRestaurantPickup, restaurantStorefront, restaurantPickupStatus, updateRestaurantCart, restaurantCartLines } from "./website";
let dir: string, f: ReturnType<typeof modifierFixture>;
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-modifier-domain-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T17:00:00Z")); f = modifierFixture(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const fire = (id: string, request = randomUUID()) => run("order.fire", { id, revision: order(id).revision, allergensReviewed: true }, request);
const pickup = (lines: { menuId: string; qty: number; options: string[] }[]) => ({ slotId: f.slot, name: "Fixture guest", phone: "555-0100", email: "", note: "Private dietary note", consent: true, lines });
it("captures different versions of one menu item through stock, kitchen, line credit and net menu reporting", () => {
  const id = draft(f.menu, [f.fries, f.extra], [{ menuId: f.menu, qty: 1, options: [f.salad] }]); expect(order(id).lines.map(l => l.unitPrice)).toEqual([1200, 1050]); expect(new Set(order(id).lines.map(l => l.id)).size).toBe(2); expect(order(id).total).toBe(2475);
  fire(id); expect(order(id).foodCost).toBe(370); const ticket = restaurantState.read().tickets[0]; expect(ticket.items[0].modifiers).toEqual(["Side: Fries", "Cheese choice: Extra cheese"]); expect(ticket.items[1].modifiers).toEqual(["Side: Salad"]); expect(ticket.items[0].allergens).toContain("Contains milk");
  advanceTicket(ticket.id, "cooking"); advanceTicket(ticket.id, "ready"); run("order.serve", { id, revision: order(id).revision });
  const credit = { id, revision: order(id).revision, reference: "LINE-CREDIT", reason: "Reviewed incorrect extra-cheese burger", tips: 0, reviewed: true, lines: [{ menuId: f.menu, lineId: order(id).lines[0].id, amount: 1200 }] }, requestId = randomUUID(); run("credit.issue", credit, requestId); run("credit.issue", credit, requestId);
  const check = restaurantCreditView(state())[0]; expect(check.lines.map(l => l.credited)).toEqual([1200, 0]); expect(check.balance.due).toBe(1155); expect(restaurantSalesReport(state()).items[0].sales).toBe(1050); expect(state().journals.every(isBalanced)).toBe(true);
  expect(() => run("credit.issue", { ...credit, revision: order(id).revision, reference: "AMBIGUOUS", lines: [{ menuId: f.menu, amount: 1 }] })).toThrow("line ID");
});
it("adjusts a removed ingredient without erasing the base allergen statement and returns only the resolved recipe on cancellation", () => {
  const id = draft(f.menu, [f.fries, f.omit]); expect(order(id).subtotal).toBe(900); expect(order(id).lines[0].recipe.some(r => r.ingredientId === f.cheese)).toBe(false); expect(order(id).lines[0].allergens).toContain("Contains wheat and milk"); fire(id); expect(order(id).foodCost).toBe(140); expect(state().lots.find(l => l.ingredientId === f.cheese)!.remainingQuantity).toBe(1000); run("order.cancel", { id, revision: order(id).revision, reason: "Cancelled before preparation" }); expect(state().lots.every(l => l.remainingQuantity === l.receivedQuantity)).toBe(true);
});
it.each(["missing", "too-many", "duplicate", "foreign", "unavailable", "negative-recipe", "free-price"])("rejects invalid option selection %s without creating an order", kind => {
  let options = [f.fries]; const m = state().menu[0];
  if (kind === "missing") options = [];
  if (kind === "too-many") options = [f.fries, f.salad];
  if (kind === "duplicate") options = [f.fries, f.fries];
  if (kind === "foreign") options = [f.fries, randomUUID()];
  if (kind === "unavailable") { m.modifierGroups![0].options[0].active = false; run("menu.save", m); }
  if (kind === "negative-recipe") { m.modifierGroups![1].options[1].recipe[0].quantity = -21; run("menu.save", m); options.push(f.omit); }
  if (kind === "free-price") { m.modifierGroups![1].options[1].priceDelta = -1000; run("menu.save", m); options.push(f.omit); }
  const before = JSON.stringify(state()); expect(() => draft(f.menu, options)).toThrow(); expect(JSON.stringify(state())).toBe(before);
});
it("rejects option ID collisions, impossible required groups, repeated adjustments and missing ingredients", () => {
  const original = state().menu[0];
  for (const kind of ["id", "minimum", "recipe", "ingredient"]) { const m = structuredClone(original); if (kind === "id") m.modifierGroups![1].id = m.modifierGroups![0].id; if (kind === "minimum") m.modifierGroups![0].min = 2; if (kind === "recipe") m.modifierGroups![0].options[0].recipe.push(m.modifierGroups![0].options[0].recipe[0]); if (kind === "ingredient") m.modifierGroups![0].options[0].recipe[0].ingredientId = randomUUID(); expect(() => run("menu.save", m)).toThrow(); }
  expect(state().menu[0]).toEqual(original);
});
it("keeps accepted options immutable and invalidates draft/menu reviews after an option change", () => {
  const a = draft(f.menu, [f.fries]), b = draft(f.menu, [f.salad]); fire(a);
  const m = state().menu[0]; m.modifierGroups![0].options[0].name = "New fries"; run("menu.save", m); expect(() => fire(b)).toThrow("changed"); expect(order(a).lines[0].modifiers![0].name).toBe("Fries"); expect(restaurantState.read().tickets[0].items[0].modifiers![0]).toBe("Side: Fries");
});
it("protects ingredient units used only by options and preserves options for older menu-save clients", () => {
  const i = state().ingredients.find(i => i.id === f.potato)!; expect(() => run("ingredient.save", { ...i, unit: "each" })).toThrow("fixed"); const m = state().menu[0], { modifierGroups, ...legacy } = m; run("menu.save", { ...legacy, description: "Legacy client revision" }); expect(state().menu[0].modifierGroups).toEqual(modifierGroups);
});
it("detects combined ingredient demand across variants at review and protects the last option stock at fire", () => {
  run("waste", { ingredientId: f.cheese, quantity: 970, date: "2026-09-21", reason: "Synthetic depletion", includeExpired: false });
  const lines = [{ menuId: f.menu, qty: 1, options: [f.fries, f.extra] }, { menuId: f.menu, qty: 1, options: [f.salad] }]; expect(() => reviewRestaurantPickup(restaurantMenuProof(), pickup(lines))).toThrow("Insufficient");
  const a = draft(f.menu, [f.fries, f.extra]), b = draft(f.menu, [f.fries, f.extra]); fire(a); const before = JSON.stringify(state()); expect(() => fire(b)).toThrow("Insufficient"); expect(JSON.stringify(state())).toBe(before);
});
it("retains menu option labels in private pickup receipts while excluding recipes and cost data from the storefront", () => {
  const menu = restaurantStorefront().menu[0]; expect(menu.modifierGroups[0].options[0]).not.toHaveProperty("recipe"); expect(JSON.stringify(menu)).not.toMatch(/ingredientId|remainingCost|supplier/);
  const r = reviewRestaurantPickup(restaurantMenuProof(), pickup([{ menuId: f.menu, qty: 1, options: [f.fries, f.extra] }])); expect(r.items[0].options).toContain("Cheese choice: Extra cheese"); const token = submitRestaurantPickup(r.quote); submitRestaurantPickup(r.quote); expect(state().orders).toHaveLength(1); expect(restaurantPickupStatus(token).lines[0].options).toContain("Cheese choice: Extra cheese");
});
it("merges identical cart choices, keeps different versions, binds sessions and expires safely without reserving stock", () => {
  const proof = restaurantMenuProof(), before = JSON.stringify(state()); let cart = updateRestaurantCart(proof, "", [{ menuId: f.menu, qty: 1, options: [f.fries, f.extra] }]); cart = updateRestaurantCart(proof, cart, [{ menuId: f.menu, qty: 2, options: [f.extra, f.fries] }, { menuId: f.menu, qty: 1, options: [f.salad] }]);
  expect(restaurantCartLines(proof, cart).map(l => l.qty)).toEqual([3, 1]); expect(JSON.stringify(state())).toBe(before); expect(() => restaurantCartLines(restaurantMenuProof(), cart)).toThrow("another menu session"); expect(() => restaurantCartLines(proof, "forged")).toThrow(); cart = updateRestaurantCart(proof, cart, [], 0); expect(restaurantCartLines(proof, cart)).toHaveLength(1); vi.setSystemTime(new Date("2026-09-21T17:16:00Z")); expect(() => restaurantCartLines(proof, cart)).toThrow("expired");
});
it("prices specials from the resolved recipe and preserves actual food contribution safeguards", () => {
  const special = run("special.save", { code: "EXTRA", name: "Fixture offer", description: "Synthetic offer", startDate: "2026-09-21", endDate: "2026-09-21", weekdays: [1], startTime: "00:00", endTime: "23:59", overnight: false, channels: ["takeaway"], menuIds: [f.menu], discountBasisPoints: 1000, maxOrders: 10, maxOrdersPerDate: 10, discountBudget: 10000, minimumFoodContribution: 700, advertisingBudget: 0 }).id;
  run("special.publish", { id: special, revision: 1, reviewed: true });
  expect(() => run("order.create", { ref: "LOW-CONTRIBUTION", channel: "takeaway", guest: "", covers: 1, reservationId: null, server: "Fixture", note: "", specialCode: "EXTRA", lines: [{ menuId: f.menu, qty: 1, options: [f.fries, f.omit] }] })).toThrow("contribution");
});

it("retries a successful pre-modifier checkout using its original signed payload hash", () => {
  const m = state().menu[0]; run("menu.save", { ...m, modifierGroups: [] });
  const r = reviewRestaurantPickup(restaurantMenuProof(), pickup([{ menuId: f.menu, qty: 1, options: [] }])); submitRestaurantPickup(r.quote);
  const oldQuote = JSON.parse(openSecret(Buffer.from(r.quote, "base64url").toString())); delete oldQuote.input.lines[0].options;
  const token = Buffer.from(sealSecret(JSON.stringify(oldQuote))).toString("base64url");
  restaurantState.change(s => { s.business!.website!.orders[0].request = createHash("sha256").update(JSON.stringify(oldQuote)).digest("hex"); delete s.business!.orders[0].lines[0].id; delete s.business!.orders[0].lines[0].modifiers; });
  const before = JSON.stringify(state()); vi.setSystemTime(new Date("2026-09-21T17:16:00Z"));
  expect(restaurantPickupStatus(submitRestaurantPickup(token)).total).toBe(1100); expect(JSON.stringify(state())).toBe(before);
});
it("credits a stored legacy check without a line ID and rejects mixing identifiers from different lines", () => {
  const id = draft(f.menu, [f.fries]); fire(id); const ticket = order(id).ticketId!; advanceTicket(ticket, "cooking"); advanceTicket(ticket, "ready"); run("order.serve", { id, revision: order(id).revision });
  restaurantState.change(s => { delete s.business!.orders.find(o => o.id === id)!.lines[0].id; });
  const input = { id, revision: order(id).revision, reference: "LEGACY-CREDIT", reason: "Legacy imported check adjustment", tips: 0, reviewed: true, lines: [{ menuId: f.menu, amount: 500 }] }; run("credit.issue", input);
  expect(restaurantCreditView(state())[0].lines[0].credited).toBe(500);
  expect(() => run("credit.issue", { ...input, revision: order(id).revision, reference: "WRONG-LINE", lines: [{ menuId: f.menu, lineId: randomUUID(), amount: 1 }] })).toThrow("original check");
});
