// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
import { advanceTicket, restaurantState } from "./store";
import { executeRestaurantCredit, restaurantCheckBalance } from "./credits";
import { restaurantFinanceData } from "./management";
import { restaurantSalesReport } from "./reporting";
import { validateEntry } from "../accounting/ledger";
import { creditTaxDelta } from "./credit-model";
let dir: string, menu: string, ingredient: string;
const date = "2026-09-21", actor = "Fixture accountant";
const run = (action: string, input: unknown, requestId = randomUUID(), by = actor) => executeRestaurantCommand({ requestId, action, input }, by);
const state = restaurantBusinessSnapshot, order = (id: string) => state().orders.find(o => o.id === id)!, version = (id: string) => ({ id, revision: order(id).revision });
const summary = (id: string) => restaurantCheckBalance(state(), order(id));
const balance = (account: number) => state().journals.flatMap(j => j.lines).filter(l => l.accountNumber === account).reduce((n, l) => n + l.debitCents - l.creditCents, 0);
const create = () => { const id = run("order.create", { ref: randomUUID(), channel: "takeaway", guest: "Private fixture guest", covers: 1, reservationId: null, server: "Fixture server", note: "Private kitchen notes", lines: [{ menuId: menu, qty: 1 }] }).id; run("order.fire", { ...version(id), allergensReviewed: true }); return id; };
const serve = (id: string) => { advanceTicket(order(id).ticketId!, "cooking"); advanceTicket(order(id).ticketId!, "ready"); run("order.serve", version(id)); };
const pay = (id: string, amount = 1100, method = "cash", tip = 0) => run("tender", { ...version(id), method, amount, tip, reference: randomUUID(), received: true }).id;
const issue = (id: string, amount = 1000, tips = 0) => run("credit.issue", { ...version(id), reference: randomUUID(), reason: "Reviewed guest service correction", reviewed: true, lines: amount ? [{ menuId: menu, amount }] : [], tips });
const cancel = (id: string, tips = 0) => run("credit.cancel", { ...version(id), reference: randomUUID(), reason: "Guest cancelled before service", reviewed: true, tips });
const refund = (id: string, tenderId: string, amount: number, reference: string = randomUUID()) => run("refund.record", { ...version(id), tenderId, amount, reference, evidence: "Verified cash or processor receipt", returned: true });
const closeDay = (day = date, cash = balance(1005), operated = true) => run("close", { date: day, operated, countedCash: cash, note: "Reviewed actual service day and drawer", reviewed: true });
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-credits-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T16:00:00Z"));
  run("configure", { name: "Credit fixture", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 1000, taxReviewed: true });
  const supplier = run("supplier.save", { name: "Fixture supplier", email: "", phone: "", active: true }).id; ingredient = run("ingredient.save", { name: "Rice", unit: "g", reorderAt: 0, targetStock: 2000, supplierId: supplier, active: true }).id;
  run("receive", { supplierId: supplier, invoiceReference: "FIXTURE-STOCK", date, purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 2000, cost: 2000, expires: null }] });
  menu = run("menu.save", { name: "Rice bowl", category: "Main", price: 1000, station: "Line", description: "", allergens: "Reviewed", recipe: [{ ingredientId: ingredient, quantity: 100 }], active: true }).id;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("credits a paid sale, records its refund separately and preserves original sale/payment/food cost", () => {
  const id = create(); serve(id); const tender = pay(id); run("order.close", version(id)); const sale = state().journals.find(j => j.source === `restaurant-sale:${id}`); issue(id, 400);
  expect(summary(id)).toMatchObject({ foodCredit: 400, taxCredit: 40, due: 0, refundDue: 440, refunded: 0 }); expect(balance(2150)).toBe(-440); expect(balance(4050)).toBe(400); expect(balance(2200)).toBe(-60);
  refund(id, tender, 440); expect(summary(id).refundDue).toBe(0); expect(balance(2150)).toBe(0); expect(balance(1005)).toBe(660); expect(balance(5000)).toBe(100); expect(state().lots[0].remainingQuantity).toBe(1900);
  expect(order(id)).toMatchObject({ total: 1100, subtotal: 1000, paid: 1100, status: "closed" }); expect(state().journals.find(j => j.source === `restaurant-sale:${id}`)).toEqual(sale); expect(state().journals.every(j => validateEntry(j) === null)).toBe(true);
});
it("reduces unpaid receivables without creating money that was never received", () => {
  const id = create(); serve(id); issue(id, 400); expect(summary(id)).toMatchObject({ due: 660, refundDue: 0 }); expect(balance(1200)).toBe(660); expect(balance(2150)).toBe(0);
  expect(() => pay(id, 1100)).toThrow("remaining check balance"); pay(id, 660); run("order.close", version(id)); expect(order(id).paid).toBe(660); expect(balance(1200)).toBe(0);
});
it("splits a credit between unpaid balance and refund liability for a partially paid check", () => {
  const id = create(); serve(id); const tender = pay(id, 550); issue(id, 800); expect(state().credits![0]).toMatchObject({ receivableReduction: 550, refundLiability: 330 }); expect(summary(id)).toMatchObject({ due: 0, refundDue: 330 });
  refund(id, tender, 330); run("order.close", version(id)); expect(balance(1200)).toBe(0); expect(balance(1005)).toBe(220); expect(balance(2150)).toBe(0);
});
it("closes a fully credited unpaid check with no fabricated receipt", () => {
  const id = create(); serve(id); issue(id); run("order.close", version(id)); expect(order(id).paid).toBe(0); expect(state().tenders).toHaveLength(0); expect(balance(1200)).toBe(0); expect(summary(id).refundDue).toBe(0);
});
it("caps each discounted original line and preserves all cumulative tax cents", () => {
  const old = state().menu[0]; run("menu.save", { ...old, price: 101 }); const id = create(); serve(id); pay(id, 111); issue(id, 33); issue(id, 33); issue(id, 35);
  expect(state().credits!.map(c => c.tax)).toEqual([3, 4, 3]); expect(summary(id)).toMatchObject({ foodCredit: 101, taxCredit: 10, refundDue: 111 }); expect(() => issue(id, 1)).toThrow("remaining net sale");
  expect(creditTaxDelta(101, 10, 66, 7, 35)).toBe(3);
});
it("rejects duplicate or foreign check lines and stale reviewer revisions without posting", () => {
  const id = create(); serve(id); const original = version(id), input = { ...original, reference: "CREDIT-A", reason: "Reviewed correction", reviewed: true, tips: 0, lines: [{ menuId: menu, amount: 100 }, { menuId: menu, amount: 100 }] };
  expect(() => run("credit.issue", input)).toThrow("once"); expect(() => run("credit.issue", { ...input, lines: [{ menuId: randomUUID(), amount: 100 }] })).toThrow("original check"); issue(id, 100); const before = JSON.stringify(state());
  expect(() => run("credit.issue", { ...input, lines: [{ menuId: menu, amount: 100 }] })).toThrow("Reload"); expect(JSON.stringify(state())).toBe(before);
});
it("uses captured tax and prices after configuration and menu changes", () => {
  const id = create(); serve(id); pay(id); run("order.close", version(id)); run("configure", { name: "Updated kitchen", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 2000, taxReviewed: true });
  issue(id, 500); expect(state().credits![0].tax).toBe(50); expect(order(id).tax).toBe(100);
});
it("cancels an untouched paid order by returning stock and moving its deposit to refunds payable", () => {
  const id = create(), tender = pay(id, 550); cancel(id); expect(order(id).status).toBe("cancelled"); expect(state().lots[0].remainingQuantity).toBe(2000); expect(balance(1320)).toBe(0); expect(balance(2100)).toBe(0); expect(balance(2150)).toBe(-550); expect(balance(4000)).toBe(0); expect(balance(2200)).toBe(0);
  expect(state().credits![0]).toMatchObject({ kind: "cancellation", deposit: 550, subtotal: 0, tax: 0 }); refund(id, tender, 550); expect(balance(1005)).toBe(0); expect(summary(id).due).toBe(0); expect(restaurantState.read().tickets).toHaveLength(0);
});
it("records prepared cancellation as waste, then refunds without restoring food or posting a sale", () => {
  const id = create(), tender = pay(id); advanceTicket(order(id).ticketId!, "cooking"); cancel(id); expect(state().lots[0].remainingQuantity).toBe(1900); expect(balance(6910)).toBe(100); expect(balance(1320)).toBe(0); expect(balance(4000)).toBe(0); refund(id, tender, 1100); expect(balance(2150)).toBe(0);
});
it("holds cancellation liability across daily close until the refund is actually returned", () => {
  const id = create(), tender = pay(id); cancel(id); closeDay(); expect(state().closes[0]).toMatchObject({ sales: 0, tax: 0, refundsOwed: 1100, expectedCash: 1100 });
  expect(() => refund(id, tender, 1100)).toThrow("closed"); vi.setSystemTime(new Date("2026-09-22T16:00:00Z")); refund(id, tender, 1100); closeDay("2026-09-22", 0, false); expect(state().closes[0].refundsOwed).toBe(1100); expect(state().closes[1]).toMatchObject({ refundsOwed: 0, cashRefunds: 1100, cashCollected: -1100 });
});
it("allows a tip-only credit for held tips and prevents paying them again to staff", () => {
  const id = create(); serve(id); const tender = pay(id, 1100, "cash", 200); issue(id, 0, 100); expect(balance(2400)).toBe(-100); expect(summary(id).refundDue).toBe(100);
  expect(() => run("tips.pay", { amount: 200, method: "cash", reference: "STAFF-TIPS", evidence: "Fixture payout", confirmed: true })).toThrow("tips payable"); refund(id, tender, 100); expect(summary(id).tipCredit).toBe(100); expect(balance(4000)).toBe(-1000);
});
it("does not refund tips already paid to staff without a reviewed payout correction", () => {
  const id = create(); serve(id); pay(id, 1100, "cash", 200); run("tips.pay", { amount: 200, method: "cash", reference: "STAFF-TIPS", evidence: "Fixture payout", confirmed: true }); expect(() => issue(id, 0, 200)).toThrow("payroll correction"); expect(state().credits ?? []).toHaveLength(0);
});
it("credits cancellation tips explicitly and permits a later held-tip correction", () => {
  const id = create(), tender = pay(id, 1100, "cash", 200); cancel(id, 100); issue(id, 0, 100); expect(summary(id).refundDue).toBe(1300); expect(balance(2400)).toBe(0); refund(id, tender, 1300); expect(balance(1005)).toBe(0); expect(() => issue(id, 1)).toThrow("no sale");
});
it("enforces original split-payment caps and the total credit liability", () => {
  const id = create(); serve(id); const cash = pay(id, 400), card = pay(id, 700, "external_card"); issue(id); expect(() => refund(id, cash, 1100)).toThrow("original payment"); refund(id, cash, 400); refund(id, card, 700); expect(() => refund(id, card, 1)).toThrow("exceeds"); expect(balance(2150)).toBe(0);
});
it("requires cash funding and supports a processor bank debit after an already-settled card refund", () => {
  const id = create(); serve(id); const tender = pay(id, 1100, "external_card"); run("processor.settle", { amount: 1100, fees: 20, reference: "SETTLE-IN", evidence: "Verified bank credit", confirmed: true }); issue(id, 500); refund(id, tender, 550);
  expect(balance(1010)).toBe(-550); run("processor.settle", { direction: "out", amount: 550, fees: 10, reference: "REFUND-DEBIT", evidence: "Verified processor bank debit", confirmed: true }); expect(balance(1010)).toBe(0); expect(balance(1000)).toBe(520); expect(balance(6400)).toBe(30);
  expect(() => run("processor.settle", { direction: "out", amount: 1, fees: 0, reference: "EXCESS-DEBIT", evidence: "Fixture", confirmed: true })).toThrow("refund clearing");
  const other = create(); serve(other); const cash = pay(other); run("drawer.transfer", { direction: "out", amount: 1100, reference: "DRAWER-EMPTY", evidence: "Banked drawer cash", confirmed: true }); issue(other); expect(() => refund(other, cash, 1100)).toThrow("drawer funding");
});
it("retries credits and refund payments exactly once and guards duplicate external references", () => {
  const id = create(); serve(id); const tender = pay(id), requestId = randomUUID(), input = { ...version(id), reference: "CREDIT-ONCE", reason: "Verified credit", lines: [{ menuId: menu, amount: 500 }], tips: 0, reviewed: true };
  run("credit.issue", input, requestId); run("credit.issue", input, requestId); expect(state().credits).toHaveLength(1);
  const refundId = randomUUID(), payout = { ...version(id), tenderId: tender, amount: 550, reference: "REFUND-ONCE", evidence: "Cash returned receipt", returned: true }; run("refund.record", payout, refundId); const before = JSON.stringify(state()); run("refund.record", payout, refundId); expect(JSON.stringify(state())).toBe(before); expect(state().refunds).toHaveLength(1); expect(() => run("refund.record", payout, refundId, "Another actor")).toThrow("another action");
  issue(id, 100); expect(() => refund(id, tender, 110, "REFUND-ONCE")).toThrow("already recorded"); expect(() => run("credit.issue", { ...input, ...version(id), reference: "credit-once" })).toThrow("unique");
});
it("posts later credits into the open day without rewriting the prior close or demand observations", () => {
  const id = create(); serve(id); const tender = pay(id); run("order.close", version(id)); closeDay(); const oldClose = state().closes[0]; vi.setSystemTime(new Date("2026-09-22T16:00:00Z")); issue(id, 400); refund(id, tender, 440); closeDay("2026-09-22", 660, false);
  expect(state().closes[0]).toEqual(oldClose); expect(state().closes[1]).toMatchObject({ grossSales: 0, credits: 400, sales: -400, tax: -40, cashRefunds: 440 }); const report = restaurantSalesReport(state()); expect(report.items[0]).toMatchObject({ quantity: 1, sales: 600 }); expect(report.weekdays[1].sales).toBe(1000); expect(report.recordedClosedDays).toBe(1);
});
it("records same-day net revenue, tax, tip credits and cash movement independently", () => {
  const id = create(); serve(id); const tender = pay(id, 1100, "cash", 200); issue(id, 400, 100); refund(id, tender, 540); run("order.close", version(id)); closeDay(); expect(state().closes[0]).toMatchObject({ grossSales: 1000, credits: 400, sales: 600, creditedTax: 40, tax: 60, creditedTips: 100, tips: 100, cashRefunds: 540, cashCollected: 760, expectedCash: 760, refundsOwed: 0 }); expect(restaurantSalesReport(state()).weekdays[1]).toMatchObject({ sales: 1000, credits: 400, netSales: 600 });
});
it("rolls back the credit and revision if journal posting fails", () => {
  const id = create(); serve(id); const before = JSON.stringify(state());
  expect(() => restaurantState.change(s => executeRestaurantCredit(s.business!, "credit.issue", { ...version(id), reference: "ROLLBACK", reason: "Fixture adjustment", reviewed: true, lines: [{ menuId: menu, amount: 100 }], tips: 0 }, actor, () => { throw new Error("Fixture journal failure"); }, () => {}))).toThrow("journal failure"); expect(JSON.stringify(state())).toBe(before);
});
it("returns finance evidence without guest contacts, kitchen notes or recipes", () => {
  const id = create(); serve(id); issue(id, 100); const data = restaurantFinanceData(); expect(data.financial!.checks[0].credits).toHaveLength(1); expect(JSON.stringify(data.financial!.checks)).not.toContain("Private fixture guest"); expect(JSON.stringify(data.financial!.checks)).not.toContain("Private kitchen notes"); expect(data.financial!.checks[0].lines[0]).not.toHaveProperty("recipe"); expect(data.orders).toEqual([]);
});
