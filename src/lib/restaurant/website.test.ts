// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
import { restaurantManagementData } from "./management";
import { advanceTicket, restaurantState, setTicketItemStatus } from "./store";
import { cancelRestaurantPickup, restaurantMenuProof, restaurantPickupStatus, restaurantStorefront, reviewRestaurantPickup, submitRestaurantPickup } from "./website";
import { GET, POST } from "@/app/api/website/restaurant/route";
let directory: string, menu: string, slot: string;
const base = "https://kitchen.example.test", run = (action: string, input: unknown) => executeRestaurantCommand({ requestId: randomUUID(), action, input }, "Fixture owner");
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-online-order-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T17:00:00Z"));
  run("configure", { name: "Online Kitchen", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 1000, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Local supplier", email: "", phone: "", active: true }).id, ingredient = run("ingredient.save", { name: "Rice", unit: "g", reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true }).id;
  run("receive", { supplierId: supplier, invoiceReference: "RECEIPT", date: "2026-09-21", purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 300, cost: 300, expires: "2026-09-21" }] });
  menu = run("menu.save", { name: "Rice bowl", category: "Main", price: 1000, station: "Line", description: "Cooked rice", allergens: "Check with kitchen", recipe: [{ ingredientId: ingredient, quantity: 100 }], active: true }).id;
  run("website.configure", { revision: 1, enabled: true, origins: ["https://www.example.test"], instructions: "Pay on pickup at the front counter. Call the restaurant for assistance." });
  slot = run("pickup.save", { at: "2026-09-21T18:00:00Z", capacity: 2, enabled: true }).id;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
const input = (qty = 1) => ({ slotId: slot, name: "Website guest", phone: "555-0100", email: "guest@example.test", note: "Please review dietary notes", consent: true, lines: [{ menuId: menu, qty }] });
const review = (qty = 1) => reviewRestaurantPickup(restaurantMenuProof(), input(qty));
it("prices and allocates a pickup order once, requires kitchen review, then follows cooking through payment", () => {
  const r = review(2); expect(r.total).toBe(2200); const token = submitRestaurantPickup(r.quote); submitRestaurantPickup(r.quote);
  const b = restaurantBusinessSnapshot(), order = b.orders[0]; expect(b.orders).toHaveLength(1); expect(b.lots[0].remainingQuantity).toBe(100); expect(order.channel).toBe("online"); expect(order.paid).toBe(0);
  expect(restaurantPickupStatus(token).status).toContain("awaiting kitchen review"); expect(() => advanceTicket(order.ticketId!, "cooking")).toThrow("dietary"); expect(() => setTicketItemStatus(order.ticketId!, 0, "cooking")).toThrow("dietary");
  run("order.allergens", { id: order.id, revision: order.revision, reviewed: true }); advanceTicket(order.ticketId!, "cooking"); advanceTicket(order.ticketId!, "ready"); expect(restaurantPickupStatus(token).status).toBe("Ready for pickup");
  const current = () => restaurantBusinessSnapshot().orders[0]; run("order.serve", { id: order.id, revision: current().revision }); run("tender", { id: order.id, revision: current().revision, method: "cash", amount: 2200, tip: 0, reference: "PICKUP-CASH", received: true }); run("order.close", { id: order.id, revision: current().revision }); expect(restaurantPickupStatus(token).status).toBe("Completed");
});
it("enforces pickup capacity against competing reviews without partial stock or journal commits", () => {
  const a = review(), b = review(), c = review(); submitRestaurantPickup(a.quote); submitRestaurantPickup(b.quote); const before = JSON.stringify(restaurantBusinessSnapshot()); expect(() => submitRestaurantPickup(c.quote)).toThrow("pickup time"); expect(JSON.stringify(restaurantBusinessSnapshot())).toBe(before);
});
it("checks current stock on submission and rolls back a rejected online order", () => {
  const a = review(3), b = review(1); submitRestaurantPickup(a.quote); const before = JSON.stringify(restaurantBusinessSnapshot()); expect(() => submitRestaurantPickup(b.quote)).toThrow("quantity"); expect(JSON.stringify(restaurantBusinessSnapshot())).toBe(before); expect(restaurantState.read().tickets).toHaveLength(1);
});
it("releases stock and capacity on customer cancellation only before preparation", () => {
  const token = submitRestaurantPickup(review().quote); cancelRestaurantPickup(token); cancelRestaurantPickup(token); expect(restaurantBusinessSnapshot().lots[0].remainingQuantity).toBe(300); expect(restaurantPickupStatus(token).status).toBe("Cancelled");
  const next = submitRestaurantPickup(review().quote), order = restaurantBusinessSnapshot().orders[1]; run("order.allergens", { id: order.id, revision: order.revision, reviewed: true }); advanceTicket(order.ticketId!, "cooking"); expect(() => cancelRestaurantPickup(next)).toThrow("Preparation");
});
it("invalidates stale terms, forged prices, expired reviews and replayed identifiers with different contents", () => {
  const r = review(), originalMenu = restaurantBusinessSnapshot().menu[0]; run("menu.save", { ...originalMenu, price: 1200 }); expect(() => submitRestaurantPickup(r.quote)).toThrow("changed");
  expect(() => reviewRestaurantPickup(restaurantMenuProof(), { ...input(), total: 1 })).toThrow();
  const proof = restaurantMenuProof(), first = reviewRestaurantPickup(proof, input()), changed = reviewRestaurantPickup(proof, input(2)); submitRestaurantPickup(first.quote); expect(() => submitRestaurantPickup(changed.quote)).toThrow("different order");
  const expired = review(); vi.setSystemTime(new Date("2026-09-21T17:16:00Z")); expect(() => submitRestaurantPickup(expired.quote)).toThrow("expired"); expect(restaurantPickupStatus(submitRestaurantPickup(first.quote)).total).toBe(1320); expect(() => restaurantPickupStatus("forged")).toThrow();
});
it("uses the actual local calendar date for ingredient expiry across the business-day cutoff", () => {
  vi.setSystemTime(new Date("2026-09-22T05:00:00Z")); expect(restaurantManagementData(false).today).toBe("2026-09-21"); expect(restaurantManagementData(false).ingredients[0].expired).toBe(300); expect(restaurantStorefront().menu).toHaveLength(0);
});
it("rejects incompatible settings and preserves existing orders when new ordering is paused", () => {
  const token = submitRestaurantPickup(review().quote); expect(() => run("pickup.save", { id: slot, revision: 1, at: "2026-09-21T18:30:00Z", capacity: 2, enabled: true })).toThrow("cannot be moved");
  run("website.configure", { revision: 2, enabled: false, origins: [], instructions: "Contact the restaurant about your existing order." }); expect(restaurantStorefront().enabled).toBe(false); expect(restaurantPickupStatus(token).total).toBe(1100); cancelRestaurantPickup(token); expect(restaurantPickupStatus(token).status).toBe("Cancelled");
});
const post = (data: Record<string, string>, origin = base) => POST(new Request(base + "/api/website/restaurant", { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data) }));
it("renders a customer menu and review without recipes, costs or staff data, enforces CSRF and issues a private status link", async () => {
  const page = GET(new Request(base + "/api/website/restaurant")), html = await page.text(); expect(html).toContain("Rice bowl"); expect(html).not.toMatch(/ingredientId|remainingCost|Local supplier/); expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://www.example.test");
  const proof = html.match(/name="proof" value="([^"]+)"/)![1], form = { action: "review", proof, slotId: slot, name: "<script>alert(1)</script>", phone: "555-0100", email: "", note: "", consent: "yes", "menu.0": menu, "qty.0": "1" };
  expect((await post(form, "https://attacker.test")).status).toBe(403); const reviewed = await post(form), reviewHtml = await reviewed.text(); expect(reviewHtml).toContain("USD 11.00"); expect(reviewHtml).not.toContain("<script>");
  const quote = reviewHtml.match(/name="quote" value="([^"]+)"/)![1], submitted = await post({ action: "submit", quote, confirmed: "yes" }); expect(submitted.status).toBe(200); const receiptHtml = await submitted.text(); expect(receiptHtml).toContain("awaiting kitchen review"); expect(receiptHtml).toContain("Refresh order status"); expect(receiptHtml).not.toContain("remainingCost");
});
it("shows reviewed credits and verified refunds on the guest's private receipt without leaking finance evidence", async () => {
  const token = submitRestaurantPickup(review().quote), current = () => restaurantBusinessSnapshot().orders[0], id = current().id;
  run("order.allergens", { id, revision: current().revision, reviewed: true }); advanceTicket(current().ticketId!, "cooking"); advanceTicket(current().ticketId!, "ready"); run("order.serve", { id, revision: current().revision });
  const tender = run("tender", { id, revision: current().revision, method: "cash", amount: 1100, tip: 0, reference: "PRIVATE-PAYMENT", received: true }); run("order.close", { id, revision: current().revision });
  run("credit.issue", { id, revision: current().revision, reference: "PRIVATE-CREDIT", lines: [{ menuId: menu, amount: 500 }], tips: 0, reason: "Confidential manager evidence", reviewed: true });
  const response = await GET(new Request(`${base}/api/website/restaurant?receipt=${encodeURIComponent(token)}`)), html = await response.text(); expect(response.status).toBe(200); expect(html).toContain("Refund owed to you USD 5.50"); expect(html).toContain("Amount still due USD 0.00"); expect(html).not.toContain("Confidential manager evidence"); expect(html).not.toContain("PRIVATE-PAYMENT");
  run("refund.record", { id, revision: current().revision, tenderId: tender.id, amount: 550, reference: "PRIVATE-REFUND", evidence: "Confidential cash drawer evidence", returned: true }); expect(restaurantPickupStatus(token).balance).toMatchObject({ refunded: 550, refundDue: 0 });
});
