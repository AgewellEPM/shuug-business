// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
import { advanceTicket, restaurantState } from "./store";
import { availableSpecials, specialResults, specialServiceDate } from "./specials";
import { restaurantMenuProof, restaurantPickupStatus, restaurantStorefront, reviewRestaurantPickup, submitRestaurantPickup, cancelRestaurantPickup } from "./website";
import { GET, POST } from "@/app/api/website/restaurant/route";
let directory: string, menu: string, ingredient: string, supplier: string, pickup: string;
const run = (action: string, input: unknown, requestId = randomUUID()) => executeRestaurantCommand({ requestId, action, input }, "Fixture owner");
const state = restaurantBusinessSnapshot, special = (id: string) => state().specials!.find(s => s.id === id)!, order = (id: string) => state().orders.find(s => s.id === id)!;
const spec = () => ({ name: "Monday bowls", code: "MONDAY10", description: "Ten percent off our rice bowls during dinner.", startDate: "2026-09-21", endDate: "2026-09-28", weekdays: [1], startTime: "17:00", endTime: "21:00", overnight: false, channels: ["takeaway", "online"], menuIds: [menu], discountBasisPoints: 1000, minimumFoodContribution: 100, maxOrders: 4, maxOrdersPerDate: 2, discountBudget: 1000, advertisingBudget: 500 });
const publish = (changes: Record<string, unknown> = {}) => { const { id } = run("special.save", { ...spec(), ...changes }); run("special.publish", { id, revision: 1, reviewed: true }); return id; };
const create = (specialCode = "MONDAY10", qty = 1) => run("order.create", { specialCode, ref: randomUUID(), channel: "takeaway", guest: "Fixture guest", covers: 1, reservationId: null, server: "Fixture staff", note: "", lines: [{ menuId: menu, qty }] }).id;
const fire = (id: string, requestId = randomUUID()) => run("order.fire", { id, revision: order(id).revision, allergensReviewed: true }, requestId);
const serve = (id: string) => { advanceTicket(order(id).ticketId!, "cooking"); advanceTicket(order(id).ticketId!, "ready"); run("order.serve", { id, revision: order(id).revision }); };
const input = () => ({ specialCode: "MONDAY10", slotId: pickup, name: "Special guest", phone: "555-0100", email: "", note: "", consent: true, lines: [{ menuId: menu, qty: 1 }] });
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-special-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", "https://restaurant.example.test"); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T23:00:00Z"));
  run("configure", { name: "Special kitchen", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 1000, taxReviewed: true });
  supplier = run("supplier.save", { name: "Fixture supply", email: "", phone: "", active: true }).id; ingredient = run("ingredient.save", { name: "Rice", unit: "g", reorderAt: 0, targetStock: 2000, supplierId: supplier, active: true }).id;
  run("receive", { supplierId: supplier, invoiceReference: "INGREDIENTS", date: "2026-09-21", purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 1000, cost: 1000, expires: "2026-10-01" }] });
  menu = run("menu.save", { name: "Rice bowl", category: "Main", price: 1000, station: "Line", description: "Rice bowl", allergens: "Kitchen reviewed", recipe: [{ ingredientId: ingredient, quantity: 100 }], active: true }).id;
  run("website.configure", { revision: 1, enabled: true, origins: [], instructions: "Pay at the fixture pickup counter." }); pickup = run("pickup.save", { at: "2026-09-22T00:00:00Z", capacity: 20, enabled: true }).id;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("prices a selected special, records exact food cost, posts net sales/tax and counts served results", () => {
  const id = publish(), check = create(); expect(order(check)).toMatchObject({ listSubtotal: 1000, discount: 100, subtotal: 900, tax: 90, total: 990, special: { id, code: "MONDAY10" } }); fire(check); serve(check);
  run("tender", { id: check, revision: order(check).revision, method: "cash", amount: 990, tip: 0, reference: "CASH-1", received: true }); run("order.close", { id: check, revision: order(check).revision });
  expect(order(check).lines[0].foodCost).toBe(100); expect(specialResults(state())[0]).toMatchObject({ servedOrders: 1, listSales: 1000, discount: 100, sales: 900, foodCost: 100, beforeLaborContribution: 800 });
  const sale = state().journals.find(j => j.source === `restaurant-sale:${check}`)!; expect(sale.lines.find(l => l.accountNumber === 4000)?.creditCents).toBe(900); expect(sale.lines.find(l => l.accountNumber === 2200)?.creditCents).toBe(90);
});
it("keeps normal menu pricing unless an eligible code is selected and rejects invalid eligibility", () => {
  publish(); expect(order(create("")).total).toBe(1100); expect(() => create("UNKNOWN")).toThrow("not available");
  vi.setSystemTime(new Date("2026-09-22T23:00:00Z")); expect(() => create()).toThrow("not available");
  vi.setSystemTime(new Date("2026-09-21T20:00:00Z")); expect(availableSpecials(state(), "online")).toHaveLength(0);
});
it("preserves published terms and rejects invalid service windows, zero-cost evidence and contribution violations", () => {
  const id = publish(); expect(() => run("special.save", { ...spec(), id, revision: special(id).revision, discountBasisPoints: 2000 })).toThrow("Published"); expect(() => publish({ code: "OTHER", startTime: "23:00", endTime: "02:00" })).toThrow("window");
  expect(() => publish({ code: "TOOLOW", minimumFoodContribution: 900 })).toThrow("contribution");
  restaurantState.change(s => { s.business!.lots = []; }); expect(() => publish({ code: "UNKNOWNCOST" })).toThrow("recorded stock costs");
});
it("enforces per-date and total redemption caps at acceptance even for competing drafts and exact retries", () => {
  const id = publish({ maxOrders: 1, maxOrdersPerDate: 1 }), a = create(), b = create(), requestId = randomUUID(), action = { id: a, revision: 1, allergensReviewed: true };
  run("order.fire", action, requestId); run("order.fire", action, requestId); const before = JSON.stringify(state()); expect(() => fire(b)).toThrow("order limit"); expect(JSON.stringify(state())).toBe(before); expect(specialResults(state())[0].usage.orders).toBe(1);
  run("order.cancel", { id: a, revision: order(a).revision, reason: "Guest cancelled before cooking" }); fire(b); expect(specialResults(state()).find(s => s.id === id)?.usage.orders).toBe(1);
});
it("enforces the discount budget independently of the order cap and rejects stale paused/expired drafts", () => {
  const id = publish({ discountBudget: 150 }), a = create(), b = create(); fire(a); expect(() => fire(b)).toThrow("discount budget");
  run("special.pause", { id, revision: special(id).revision }); expect(() => create()).toThrow("not available"); expect(() => fire(b)).toThrow("changed or ended");
  run("special.publish", { id, revision: special(id).revision, reviewed: true }); run("order.cancel", { id: a, revision: order(a).revision, reason: "Cancelled" }); const c = create(); vi.setSystemTime(new Date("2026-09-21T23:16:00Z")); expect(() => fire(c)).toThrow("expired");
});
it("rolls back stock and accounting if actual FEFO cost fails the promoted portion contribution floor", () => {
  const id = publish({ minimumFoodContribution: 750 }), check = create(); expect(id).toBeTruthy();
  // Average price remains low, but the earliest-expiring lot is costly.
  run("receive", { supplierId: supplier, invoiceReference: "EXPENSIVE-LOT", date: "2026-09-21", purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 100, cost: 500, expires: "2026-09-22" }] });
  const before = JSON.stringify(state()); expect(() => fire(check)).toThrow("Current ingredient costs"); expect(JSON.stringify(state())).toBe(before); expect(restaurantState.read().tickets).toHaveLength(0);
});
it("honors accepted prices after pause and records prepared cancellation waste separately from discount usage", () => {
  const id = publish(), a = create(); fire(a); run("special.pause", { id, revision: special(id).revision }); serve(a); expect(order(a).total).toBe(990);
  run("special.publish", { id, revision: special(id).revision, reviewed: true }); const b = create(); fire(b); advanceTicket(order(b).ticketId!, "cooking"); run("order.cancel", { id: b, revision: order(b).revision, reason: "Prepared food discarded" });
  expect(specialResults(state())[0]).toMatchObject({ servedOrders: 1, cancelledOrders: 1, waste: 100, beforeLaborContribution: 700, usage: { orders: 1, discount: 100 } });
});
it("uses the starting service date for overnight specials and ends at the exclusive closing time", () => {
  const id = publish({ startTime: "22:00", endTime: "02:00", overnight: true, endDate: "2026-09-21" });
  vi.setSystemTime(new Date("2026-09-22T05:00:00Z")); expect(specialServiceDate(special(id))).toBe("2026-09-21"); expect(order(create()).special?.serviceDate).toBe("2026-09-21");
  vi.setSystemTime(new Date("2026-09-22T06:00:00Z")); expect(() => create()).toThrow("not available");
});
it("posts verified advertising once, explains budget overruns and leaves closed periods unchanged", () => {
  const id = publish(), requestId = randomUUID(), input = { id, date: "2026-09-21", amount: 500, provider: "Fixture newspaper", reference: "AD-BANK-1", evidence: "Synthetic paid invoice", paid: true };
  run("special.spend", input, requestId); run("special.spend", input, requestId); expect(state().specialSpend).toHaveLength(1); expect(state().journals.find(j => j.source === "restaurant-bank:AD-BANK-1")?.lines).toEqual([{ accountNumber: 6200, debitCents: 500, creditCents: 0 }, { accountNumber: 1000, debitCents: 0, creditCents: 500 }]);
  expect(() => run("special.spend", { ...input, reference: "AD-BANK-2" })).toThrow("overrun"); run("special.spend", { ...input, reference: "AD-BANK-2", overrunReason: "Additional verified placement" }); expect(specialResults(state())[0]).toMatchObject({ advertising: 1000, advertisingOverBudget: true, beforeLaborContribution: -1000 });
  run("close", { date: "2026-09-21", operated: true, countedCash: 0, note: "Fixture close", reviewed: true }); expect(() => run("special.spend", { ...input, reference: "AD-BANK-3" })).toThrow("closed");
});
it("applies the same accepted online discount and tax, protects its review, and releases capacity on customer cancellation", () => {
  publish({ channels: ["online"], maxOrders: 1, maxOrdersPerDate: 1 }); const a = reviewRestaurantPickup(restaurantMenuProof(), input()), b = reviewRestaurantPickup(restaurantMenuProof(), input()); expect(a.total).toBe(990);
  const token = submitRestaurantPickup(a.quote); submitRestaurantPickup(a.quote); expect(restaurantPickupStatus(token)).toMatchObject({ total: 990, discount: 100, special: { code: "MONDAY10" } }); expect(() => submitRestaurantPickup(b.quote)).toThrow("limit");
  cancelRestaurantPickup(token); expect(restaurantStorefront().specials).toHaveLength(1); expect(submitRestaurantPickup(b.quote)).toBeTruthy();
});
it("rejects an online review after the owner pauses the offer without accepting any order", () => {
  const id = publish(), q = reviewRestaurantPickup(restaurantMenuProof(), input()); run("special.pause", { id, revision: special(id).revision }); expect(() => submitRestaurantPickup(q.quote)).toThrow("not available"); expect(state().orders).toHaveLength(0);
});
it("shows the requested offer code and explicit discount on real public order forms", async () => {
  publish(); const html = await GET(new Request("https://restaurant.example.test/api/website/restaurant?special=MONDAY10")).text(); expect(html).toContain('name="specialCode" maxlength="30" value="MONDAY10"'); expect(html).not.toContain("minimumFoodContribution");
  const proof = html.match(/name="proof" value="([^"]+)"/)![1]; const r = await POST(new Request("https://restaurant.example.test/api/website/restaurant", { method: "POST", headers: { Origin: "https://restaurant.example.test", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "review", proof, specialCode: "MONDAY10", slotId: pickup, name: "Guest", phone: "555-0100", consent: "yes", "menu.0": menu, "qty.0": "1" }) }));
  expect(r.ok).toBe(true); const review = await r.text(); expect(review).toContain("Discount USD 1.00"); expect(review).toContain("Total due at pickup USD 9.90");
});
it("closes new online orders after daily close while keeping the configured website capability available", () => {
  publish(); const quote = reviewRestaurantPickup(restaurantMenuProof(), input()); run("close", { date: "2026-09-21", operated: true, countedCash: 0, note: "Service finished", reviewed: true });
  expect(restaurantStorefront()).toMatchObject({ enabled: true, accepting: false }); expect(() => submitRestaurantPickup(quote.quote)).toThrow("ordering is closed"); expect(state().orders).toHaveLength(0);
});
it("reduces special sales and contribution for a credit without releasing a served redemption or restoring ingredients", () => {
  const id = publish(), check = create(); fire(check); serve(check); run("tender", { id: check, revision: order(check).revision, method: "cash", amount: 990, tip: 0, reference: "SPECIAL-CREDIT-CASH", received: true });
  run("credit.issue", { id: check, revision: order(check).revision, reference: "SPECIAL-CREDIT", lines: [{ menuId: menu, amount: 400 }], tips: 0, reason: "Reviewed service correction", reviewed: true });
  expect(specialResults(state()).find(s => s.id === id)).toMatchObject({ sales: 500, discount: 100, credits: 400, foodCost: 100, beforeLaborContribution: 400, usage: { orders: 1 }, byChannel: expect.arrayContaining([expect.objectContaining({ channel: "takeaway", sales: 500 })]) });
  expect(state().lots[0].remainingQuantity).toBe(900);
});
