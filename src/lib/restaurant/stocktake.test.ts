// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
import { restaurantState } from "./store";
import { restaurantManagementData, restaurantFinanceData } from "./management";
import { stocktakeViews } from "./stocktake";
import { validateEntry } from "../accounting/ledger";
let dir: string, ingredient: string, supplier: string;
const date = "2026-09-21", actor = "Fixture counter", reviewer = "Fixture accountant";
const run = (action: string, input: unknown, requestId = randomUUID(), by = actor) => executeRestaurantCommand({ requestId, action, input }, by);
const state = restaurantBusinessSnapshot, count = (id: string) => state().stocktakes!.find(c => c.id === id)!, version = (id: string) => ({ id, revision: count(id).revision });
const start = (reference: string = randomUUID(), ingredients = [ingredient]) => run("stocktake.start", { reference, ingredientIds: ingredients, note: "Storage isolated from kitchen work" }).id;
const record = (id: string, quantity: number, reason = "Second physical count confirmed difference", lineId = count(id).lines[0].id) => run("stocktake.record", { ...version(id), lineId, quantity, reason });
const submit = (id: string) => run("stocktake.submit", { ...version(id), confirmed: true });
const post = (id: string) => run("stocktake.post", { ...version(id), reviewed: true, evidence: "Compared physical count and ownership evidence" }, randomUUID(), reviewer);
const found = (id: string, changes: Record<string, unknown> = {}) => run("stocktake.found", { ...version(id), ingredientId: ingredient, supplierId: supplier, lotReference: "FOUND-1", quantity: 20, cost: 40, expires: null, evidence: "Already paid purchase ledger reference FIXTURE-1", owned: true, ...changes });
const receive = (quantity = 100, cost = 200, expires: string | null = null, ingr = ingredient) => run("receive", { supplierId: supplier, invoiceReference: randomUUID(), date, purchaseId: null, lines: [{ ingredientId: ingr, quantity, cost, expires }] });
const balance = (account: number) => state().journals.flatMap(j => j.lines).filter(l => l.accountNumber === account).reduce((n, l) => n + l.debitCents - l.creditCents, 0);
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-stocktake-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T16:00:00Z"));
  run("configure", { name: "Count fixture", timezone: "America/New_York", businessDayStartHour: 4, taxBasisPoints: 0, taxReviewed: true });
  supplier = run("supplier.save", { name: "Fixture supplier", email: "", phone: "", active: true }).id;
  ingredient = run("ingredient.save", { name: "Rice", unit: "g", reorderAt: 50, targetStock: 500, supplierId: supplier, active: true }).id;
  receive();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("preserves observations and posts exact reductions with a distinct reviewer and balanced ledger", () => {
  const id = start(); expect(count(id).lines[0].countedQuantity).toBeNull(); record(id, 90); expect(state().lots[0].remainingQuantity).toBe(100); submit(id); post(id);
  expect(state().lots[0]).toMatchObject({ remainingQuantity: 90, remainingCost: 180 }); expect(count(id)).toMatchObject({ status: "posted", startedBy: actor, submittedBy: actor, postedBy: reviewer });
  expect(count(id).lines[0]).toMatchObject({ expectedQuantity: 100, expectedCost: 200, countedQuantity: 90, counter: actor });
  expect(balance(1300)).toBe(180); expect(balance(6930)).toBe(20); expect(balance(2000)).toBe(-200); expect(validateEntry(state().journals.at(-1)!)).toBeNull();
  expect(state().movements.at(-1)).toMatchObject({ kind: "count", quantity: -10, cost: -20, reference: id }); expect(stocktakeViews(state())[0].stale).toBe(false);
});
it("requires each actual lot count and an explanation for discrepancies", () => {
  const id = start(); expect(() => submit(id)).toThrow("actual quantity"); expect(() => record(id, 0, "")).toThrow("Explain"); expect(() => post(id)).toThrow("Submit");
  record(id, 100, ""); submit(id); post(id); expect(count(id).status).toBe("posted"); expect(state().journals).toHaveLength(1); expect(state().movements).toHaveLength(1);
});
it("requires explicit ownership and cost evidence for found stock without creating another payable", () => {
  const id = start(); record(id, 90); expect(() => found(id, { owned: false })).toThrow(); expect(() => found(id, { cost: 0 })).toThrow(); found(id); submit(id); post(id);
  const lot = state().lots.find(l => l.stocktakeId === id)!; expect(lot).toMatchObject({ remainingQuantity: 20, remainingCost: 40, purchaseId: null });
  expect(balance(1300)).toBe(220); expect(balance(6930)).toBe(-20); expect(state().bills).toHaveLength(1); expect(balance(2000)).toBe(-200); expect(stocktakeViews(state())[0]).toMatchObject({ gains: 40, losses: 20, netValue: 20 });
});
it("returns a submitted sheet for correction and retains the original counter's evidence", () => {
  const id = start(); record(id, 90); submit(id); expect(() => record(id, 95)).toThrow("Return"); run("stocktake.return", { ...version(id), reason: "Please recount the rear shelf" }, randomUUID(), reviewer); record(id, 95); submit(id); post(id);
  expect(count(id).history.map(h => h.action)).toEqual(["started", "count recorded", "submitted", "returned for correction", "count recorded", "submitted", "posted"]);
  expect(count(id).history[4].before).toMatchObject({ quantity: 90, counter: actor }); expect(balance(6930)).toBe(10);
});
it("detects intervening receiving and starts a new sheet without carrying old observations forward", () => {
  const id = start(); record(id, 90); receive(); const before = JSON.stringify(state()); expect(() => submit(id)).toThrow("recount"); expect(JSON.stringify(state())).toBe(before);
  const next = run("stocktake.recount", { ...version(id), reference: "FRESH-COUNT", reason: "Delivery arrived during counting" }).id;
  expect(count(id).status).toBe("cancelled"); expect(count(next).recountOf).toBe(id); expect(count(next).lines).toHaveLength(2); expect(count(next).lines.every(l => l.countedQuantity === null)).toBe(true);
});
it("detects kitchen allocation then exact return even when the lot balance is restored", () => {
  const menu = run("menu.save", { name: "Rice bowl", category: "Main", price: 1000, station: "Line", description: "", allergens: "Reviewed", recipe: [{ ingredientId: ingredient, quantity: 10 }], active: true }).id;
  const id = start(), check = run("order.create", { ref: "STOCK-MOVED", channel: "takeaway", guest: "", covers: 1, reservationId: null, server: actor, note: "", lines: [{ menuId: menu, qty: 1 }] }).id;
  run("order.fire", { id: check, revision: 1, allergensReviewed: true }); run("order.cancel", { id: check, revision: 2, reason: "Cancelled before kitchen preparation" });
  expect(state().lots[0].remainingQuantity).toBe(100); expect(state().lots[0].remainingCost).toBe(200); expect(stocktakeViews(state())[0].stale).toBe(true); expect(() => record(id, 100)).toThrow("recount");
});
it("allows independent ingredient counts and ignores unrelated inventory changes", () => {
  const other = run("ingredient.save", { name: "Oil", unit: "ml", reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true }).id;
  const id = start(), otherId = start("OIL-COUNT", [other]); receive(100, 200, null, other); expect(stocktakeViews(state()).find(c => c.id === id)?.stale).toBe(false); expect(stocktakeViews(state()).find(c => c.id === otherId)?.stale).toBe(true);
  record(id, 100); submit(id); post(id); expect(count(id).status).toBe("posted");
});
it("rejects overlapping scopes, duplicate references and stale editor revisions atomically", () => {
  const id = start("RICE-COUNT"), old = version(id); expect(() => start("SECOND")).toThrow("open stocktake"); record(id, 90);
  const before = JSON.stringify(state()); expect(() => run("stocktake.record", { ...old, lineId: count(id).lines[0].id, quantity: 80, reason: "Other counter" })).toThrow("Reload"); expect(JSON.stringify(state())).toBe(before);
  expect(() => run("stocktake.recount", { ...version(id), reference: "rice-count", reason: "Recount evidence" })).toThrow("unique"); expect(count(id).status).toBe("counting");
});
it("replays the identical posting once and forbids reuse by another actor or another adjustment", () => {
  const id = start(); record(id, 90); submit(id); const input = { ...version(id), reviewed: true, evidence: "Verified before posting" }, requestId = randomUUID();
  run("stocktake.post", input, requestId, reviewer); const before = JSON.stringify(state()); run("stocktake.post", input, requestId, reviewer); expect(JSON.stringify(state())).toBe(before);
  expect(() => run("stocktake.post", input, requestId, actor)).toThrow("another action"); expect(() => post(id)).toThrow("closed"); expect(state().journals.filter(j => j.source === `restaurant-stocktake:${id}`)).toHaveLength(1);
});
it("rolls back changed lots and movements when the journal cannot post", () => {
  const id = start(); record(id, 90); found(id); submit(id);
  restaurantState.change(s => { s.business!.journals.push({ id: "conflict", source: `restaurant-stocktake:${id}`, date, memo: "Synthetic conflict", lines: [{ accountNumber: 1300, debitCents: 1, creditCents: 0 }, { accountNumber: 6930, debitCents: 0, creditCents: 1 }] }); });
  const before = JSON.stringify(state()); expect(() => post(id)).toThrow("already posted"); expect(JSON.stringify(state())).toBe(before);
});
it("requires resolving open counts before closing the day and prohibits backdated count posting", () => {
  const id = start(); record(id, 90); submit(id); const close = () => run("close", { date, operated: true, countedCash: 0, note: "Synthetic reviewed close", reviewed: true }); expect(() => close()).toThrow("physical inventory");
  vi.setSystemTime(new Date("2026-09-22T09:00:00Z")); expect(() => post(id)).toThrow("recount"); run("stocktake.cancel", { ...version(id), reason: "Recount in new business day" }); close();
  vi.setSystemTime(new Date("2026-09-21T16:00:00Z")); expect(() => start()).toThrow("closed");
});
it("snapshots expired and inactive stored lots without making them sellable", () => {
  receive(30, 90, "2026-09-20"); const old = state().ingredients[0]; run("ingredient.save", { id: old.id, revision: old.revision, name: old.name, unit: old.unit, reorderAt: old.reorderAt, targetStock: old.targetStock, supplierId: supplier, active: false });
  const id = start(); const view = stocktakeViews(state())[0]; expect(view.lines).toHaveLength(2); expect(view.expiredLots).toHaveLength(1);
  for (const line of count(id).lines) record(id, line.expectedQuantity, "", line.id); submit(id); post(id); expect(restaurantManagementData(false).ingredients[0]).toMatchObject({ active: false, available: 100, expired: 30 });
});
it("writes off the exact residual cents when a rounded, partially used lot counts to zero", () => {
  run("waste", { ingredientId: ingredient, quantity: 100, date, reason: "Clear fixture baseline", includeExpired: false }); receive(3, 100); run("waste", { ingredientId: ingredient, quantity: 1, date, reason: "One unit used in fixture", includeExpired: false });
  const id = start(); expect(count(id).lines[0].expectedCost).toBe(67); record(id, 0); submit(id); post(id); expect(balance(1300)).toBe(0); expect(balance(6930)).toBe(67); expect(state().lots.every(l => l.remainingCost === 0 && l.remainingQuantity === 0)).toBe(true);
});
it("values positive existing-lot differences at original receipt cost", () => {
  const id = start(); record(id, 125); submit(id); post(id); expect(state().lots[0]).toMatchObject({ receivedQuantity: 100, receivedCost: 200, remainingQuantity: 125, remainingCost: 250 }); expect(balance(6930)).toBe(-50);
});
it("handles confirmed zero stock and discovered lots with no starting inventory", () => {
  run("waste", { ingredientId: ingredient, quantity: 100, date, reason: "Empty storage fixture", includeExpired: false }); const id = start(); expect(count(id).lines).toHaveLength(0); submit(id); post(id); expect(balance(1300)).toBe(0);
  const next = start(); found(next); submit(next); post(next); expect(balance(1300)).toBe(40);
});
it("retains corrected and removed found-stock observations and rejects foreign scope", () => {
  const id = start(); expect(() => found(id, { ingredientId: randomUUID() })).toThrow("selected"); found(id); const f = count(id).found[0]; expect(() => found(id)).toThrow("already"); found(id, { foundId: f.id, quantity: 25, cost: 50 });
  run("stocktake.remove-found", { ...version(id), foundId: f.id, reason: "Actually another supplier's consigned stock" }); expect(count(id).found).toHaveLength(0); expect(count(id).history.at(-1)?.before).toMatchObject({ quantity: 25, cost: 50 });
});
it("keeps finance count evidence available while excluding guest records, recipes and fingerprints", () => {
  start(); const data = restaurantFinanceData(); expect(data.stocktakes).toHaveLength(1); expect(data.stocktakes[0]).not.toHaveProperty("fingerprint"); expect(data.stocktakes[0].lines[0].expectedCost).toBe(200); expect(data.menu).toEqual([]); expect(data.orders).toEqual([]); expect(data.lots).toEqual([]);
});
