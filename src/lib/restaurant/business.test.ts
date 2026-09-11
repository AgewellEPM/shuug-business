// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand, restaurantBusinessSnapshot, restaurantJournalEntries, restaurantMenuAvailability } from "./business";
import { saveRestaurantTable, addReservation, setReservationStatus, advanceTicket, setTicketItemStatus, restaurantState } from "./store";
import { restaurantSalesReport, restaurantStock } from "./reporting";
import { restaurantManagementData } from "./management";
import { isBalanced, accountBalance, trialBalance, ledgerIncomeStatement } from "../accounting/ledger";
import { loadLedger } from "../accounting/ledger-load";
let dir: string;
const now = "2026-09-21T17:00:00Z";
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-restaurant-business-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false"); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const run = (action: string, input: unknown, requestId = randomUUID()) => executeRestaurantCommand({ requestId, action, input }, "Fixture owner");
const state = () => restaurantBusinessSnapshot();
const order = (id: string) => state().orders.find(o => o.id === id)!;
function settings() { run("configure", { name: "Test Kitchen", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 1000, taxReviewed: true }); }
function setup() {
  settings();
  const supplier = run("supplier.save", { name: "Test supplier", email: "supplier@example.test", phone: "", active: true }).id;
  const ingredient = (name: string) => run("ingredient.save", { name, unit: "g", reorderAt: 100, targetStock: 1000, supplierId: supplier, active: true }).id;
  const rice = ingredient("Rice"), beans = ingredient("Beans");
  const receipt = run("receive", { supplierId: supplier, invoiceReference: "INV-001", date: state().config ? restaurantManagementData(false).today : "", purchaseId: null, lines: [{ ingredientId: rice, quantity: 1000, cost: 1000, expires: "2026-12-31" }, { ingredientId: beans, quantity: 500, cost: 1500, expires: "2026-12-31" }] }).id;
  const menu = run("menu.save", { name: "Rice bowl", category: "Main", price: 1500, station: "Line", description: "Rice and beans", allergens: "Reviewed kitchen information", recipe: [{ ingredientId: rice, quantity: 100 }, { ingredientId: beans, quantity: 50 }], active: true }).id;
  return { supplier, rice, beans, menu, receipt };
}
function draft(menuId: string, qty = 2, ref = "CHK-1", reservationId: string | null = null) { return run("order.create", { ref, channel: reservationId ? "dine_in" : "takeaway", guest: "Guest", covers: 2, reservationId, server: "Sam", note: "", lines: [{ menuId, qty }] }).id; }
function fire(id: string, requestId = randomUUID()) { const o = order(id); const input = { id, revision: o.revision, allergensReviewed: true }; run("order.fire", input, requestId); return input; }
function serve(id: string) { const o = order(id); advanceTicket(o.ticketId!, "cooking"); advanceTicket(o.ticketId!, "ready"); run("order.serve", { id, revision: o.revision }); }
function pay(id: string, amount: number, method = "cash", tip = 0, reference: string = randomUUID()) { run("tender", { id, revision: order(id).revision, method, amount, tip, reference, received: true }); }
function close(id: string) { run("order.close", { id, revision: order(id).revision }); }
it("connects receiving, kitchen stock, split tenders, tips, deposits, daily close and the shared ledger", async () => {
  const fixture = setup(); run("drawer.transfer", { amount: 10000, direction: "in", reference: "opening-float", evidence: "Bank withdrawal", confirmed: true });
  const check = draft(fixture.menu); fire(check); expect(order(check).foodCost).toBe(500); expect(restaurantStock(state()).find(i => i.id === fixture.rice)?.available).toBe(800);
  pay(check, 1000, "cash", 200, "cash-1"); expect(accountBalance(trialBalance(restaurantJournalEntries()), 2100)).toBe(1000);
  serve(check); expect(accountBalance(trialBalance(restaurantJournalEntries()), 2100)).toBe(0);
  pay(check, 2300, "external_card", 300, "terminal-1"); close(check);
  run("bill.pay", { id: fixture.receipt, amount: 2500, reference: "supplier-bank-1", paid: true });
  run("tips.pay", { amount: 500, method: "cash", reference: "staff-tips-1", evidence: "Staff allocations and signatures", confirmed: true });
  run("processor.settle", { amount: 2600, fees: 100, reference: "settlement-1", evidence: "Matched 2500 net deposit", confirmed: true });
  run("drawer.transfer", { amount: 10700, direction: "out", reference: "bank-deposit-1", evidence: "Bank deposit slip", confirmed: true });
  run("close", { date: "2026-09-21", operated: true, countedCash: 0, note: "Drawer counted and deposits matched", reviewed: true });
  expect(state().closes[0]).toMatchObject({ sales: 3000, tax: 300, tips: 500, foodCost: 500, variance: 0, covers: 2, orderCount: 1 });
  const entries = restaurantJournalEntries(); expect(entries.every(isBalanced)).toBe(true); const tb = trialBalance(entries); expect(accountBalance(tb, 1010)).toBe(0); expect(accountBalance(tb, 1200)).toBe(0); expect(accountBalance(tb, 1320)).toBe(0); expect(accountBalance(tb, 2400)).toBe(0); expect(ledgerIncomeStatement(tb).netIncomeCents).toBe(2400);
  const ledger = await loadLedger(); expect(ledger.entries.filter(e => e.id.startsWith("restaurant:"))).toHaveLength(entries.length); expect(ledger.trialBalance.balanced).toBe(true);
});
it("does not duplicate stock, tickets or journal entries when a command is retried", () => {
  const f = setup(), check = draft(f.menu), requestId = randomUUID(), input = fire(check, requestId), first = JSON.stringify(state());
  run("order.fire", input, requestId); expect(JSON.stringify(state())).toBe(first); expect(restaurantState.read().tickets).toHaveLength(1);
  expect(() => run("order.fire", { ...input, id: randomUUID() }, requestId)).toThrow("another action");
});
it("rolls back earlier ingredient deductions if any recipe ingredient is short", () => {
  const f = setup(), check = draft(f.menu, 11), before = JSON.stringify(state()); expect(() => fire(check)).toThrow("Insufficient"); expect(JSON.stringify(state())).toBe(before); expect(restaurantState.read().tickets).toHaveLength(0);
});
it("reserves the last portions only once across competing orders", () => {
  const f = setup(), a = draft(f.menu, 10, "A"), b = draft(f.menu, 1, "B"); fire(a); expect(() => fire(b)).toThrow("Insufficient"); expect(order(a).status).toBe("fired"); expect(order(b).status).toBe("draft"); expect(state().lots.every(l => l.remainingQuantity === 0 && l.remainingCost === 0)).toBe(true);
});
it("uses the earliest unexpired lots and conserves integer-cent value", () => {
  const f = setup(); run("receive", { supplierId: f.supplier, invoiceReference: "INV-002", date: "2026-09-21", purchaseId: null, lines: [{ ingredientId: f.rice, quantity: 300, cost: 301, expires: "2026-09-22" }, { ingredientId: f.beans, quantity: 500, cost: 1, expires: "2026-09-20" }] });
  const a = draft(f.menu, 1, "A"), b = draft(f.menu, 2, "B"); fire(a); fire(b); const depleted = state().lots.find(l => l.invoiceReference === "INV-002" && l.ingredientId === f.rice)!; expect(depleted.remainingCost).toBe(0); expect(depleted.remainingQuantity).toBe(0); expect(order(a).consumed.filter(l => l.ingredientId === f.rice)[0].lotId).toBe(depleted.id);
  expect(restaurantStock(state()).find(i => i.id === f.beans)?.expired).toBe(500);
});
it("returns only unstarted food to stock and costs prepared cancellations as waste", () => {
  const f = setup(), a = draft(f.menu); fire(a); run("order.cancel", { id: a, revision: order(a).revision, reason: "Guest left before cooking" }); expect(restaurantStock(state()).find(i => i.id === f.rice)?.available).toBe(1000);
  const b = draft(f.menu, 2, "B"); fire(b); advanceTicket(order(b).ticketId!, "cooking"); run("order.cancel", { id: b, revision: order(b).revision, reason: "Prepared order abandoned" });
  expect(restaurantStock(state()).find(i => i.id === f.rice)?.available).toBe(800); expect(accountBalance(trialBalance(restaurantJournalEntries()), 6910)).toBe(500); expect(accountBalance(trialBalance(restaurantJournalEntries()), 1320)).toBe(0);
});
it("requires ready kitchen items and releases a table only after its check closes", () => {
  const f = setup(), table = saveRestaurantTable({ name: "T1", seats: 4, area: "Main" }), visit = addReservation({ name: "Guest", partySize: 4, dateISO: "2026-09-21", time: "13:00", tableId: table.id }); setReservationStatus(visit.id, "seated");
  const check = draft(f.menu, 2, "T1 check", visit.id); fire(check); expect(order(check).covers).toBe(4); expect(() => run("order.serve", { id: check, revision: order(check).revision })).toThrow("ready"); expect(() => setReservationStatus(visit.id, "completed")).toThrow("Close or cancel");
  const ticket = order(check).ticketId!; advanceTicket(ticket, "cooking"); advanceTicket(ticket, "ready"); expect(() => setTicketItemStatus(ticket, 0, "served")).toThrow("priced order"); expect(() => advanceTicket(ticket, "served")).toThrow("priced order");
  run("order.serve", { id: check, revision: order(check).revision }); expect(() => close(check)).toThrow("remaining balance"); pay(check, 3300); close(check); expect(setReservationStatus(visit.id, "completed").status).toBe("completed");
});
it("keeps captured menu prices and requires a new review if the draft menu changes", () => {
  const f = setup(), a = draft(f.menu), menu = state().menu[0]; run("menu.save", { ...menu, price: 2000 }); expect(() => fire(a)).toThrow("menu item changed"); run("order.cancel", { id: a, revision: order(a).revision, reason: "Review new price" });
  const b = draft(f.menu, 1, "B"); fire(b); run("menu.save", { ...state().menu[0], price: 3000 }); serve(b); expect(order(b).subtotal).toBe(2000); expect(order(b).tax).toBe(200);
});
it("rejects excessive payments, duplicate references, unsupported provider claims and closed-period changes", () => {
  const f = setup(), check = draft(f.menu); fire(check); expect(() => pay(check, 3301)).toThrow("exceeds"); pay(check, 1000, "cash", 0, "same-ref"); expect(() => pay(check, 1000, "cash", 0, "same-ref")).toThrow("already recorded"); expect(() => run("tender", { id: check, revision: order(check).revision, method: "external_card", amount: 2300, tip: 0, reference: "unverified", received: false })).toThrow();
  expect(() => run("close", { date: "2026-09-21", operated: true, countedCash: 1000, note: "Counted", reviewed: true })).toThrow("every open check"); serve(check); pay(check, 2300); close(check); run("close", { date: "2026-09-21", operated: true, countedCash: 3200, note: "Cash short by 100", reviewed: true }); expect(state().closes[0].variance).toBe(-100); expect(accountBalance(trialBalance(restaurantJournalEntries()), 6920)).toBe(100);
  expect(() => draft(f.menu, 1, "Closed day")).toThrow("closed"); expect(() => run("waste", { ingredientId: f.rice, quantity: 1, date: "2026-09-20", reason: "Backdated", includeExpired: false })).toThrow("closed");
});
it("tracks partial purchase receipts and rejects over-receipts and duplicate supplier invoices atomically", () => {
  const f = setup(), purchaseId = run("purchase.save", { supplierId: f.supplier, reference: "PO-1", lines: [{ ingredientId: f.rice, quantity: 100, expectedCost: 100 }] }).id;
  run("purchase.order", { id: purchaseId, revision: 1 }); run("receive", { supplierId: f.supplier, invoiceReference: "PARTIAL", date: "2026-09-21", purchaseId, lines: [{ ingredientId: f.rice, quantity: 40, cost: 45, expires: null }] }); expect(state().purchases[0].status).toBe("partial");
  const before = JSON.stringify(state()); expect(() => run("receive", { supplierId: f.supplier, invoiceReference: "TOO-MUCH", date: "2026-09-21", purchaseId, lines: [{ ingredientId: f.rice, quantity: 61, cost: 50, expires: null }] })).toThrow("outstanding"); expect(JSON.stringify(state())).toBe(before);
  expect(() => run("receive", { supplierId: f.supplier, invoiceReference: "PARTIAL", date: "2026-09-21", purchaseId, lines: [{ ingredientId: f.rice, quantity: 10, cost: 20, expires: null }] })).toThrow("already received");
  run("receive", { supplierId: f.supplier, invoiceReference: "FINAL", date: "2026-09-21", purchaseId, lines: [{ ingredientId: f.rice, quantity: 60, cost: 70, expires: null }] }); expect(state().purchases[0].status).toBe("received");
});
it("does not silently convert stock units or use missing costs as zero", () => {
  setup(); const ingredient = state().ingredients[0]; expect(() => run("ingredient.save", { ...ingredient, unit: "each" })).toThrow("fixed");
  const snapshot = state(); snapshot.lots = []; expect(restaurantMenuAvailability(snapshot, snapshot.menu[0])).toBe(0); expect(restaurantSalesReport(snapshot).specialCandidates).toHaveLength(0);
});
it("reports quiet days using reviewed open days, preserving zero-sales days and excluding closed days", () => {
  vi.setSystemTime(new Date("2026-08-03T17:00:00Z")); const f = setup();
  for (const date of ["2026-08-03", "2026-08-04", "2026-08-10", "2026-08-11", "2026-08-17", "2026-08-18", "2026-08-19"]) {
    vi.setSystemTime(new Date(`${date}T17:00:00Z`));
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === 2) { const check = draft(f.menu, 1, date); fire(check); serve(check); pay(check, order(check).total); close(check); }
    run("close", { date, operated: date !== "2026-08-19", ...(date !== "2026-08-19" ? { openMinutes: 480 } : {}), countedCash: restaurantManagementData(true).financial!.drawer, note: "Verified service close", reviewed: true });
  }
  const report = restaurantSalesReport(state()); expect(report.observedOpenDays).toBe(6); expect(report.recordedClosedDays).toBe(1); expect(report.quietest?.name).toBe("Monday"); expect(report.busiest?.name).toBe("Tuesday"); expect(report.weekdays[1].averageSales).toBe(0); expect(report.weekdays[3].averageSales).toBeNull(); expect(report.hours[13].orders).toBe(3);
});
it("keeps operational projections free of bank references and financial journals", () => {
  setup(); const publicToStaff = restaurantManagementData(false); expect(publicToStaff.financial).toBeNull(); expect(JSON.stringify(publicToStaff)).not.toContain("restaurant-receipt:"); expect(JSON.stringify(publicToStaff)).not.toContain("commands");
});
