// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { emptyRestaurantBusiness, type RestaurantBusiness, type RestaurantClose, type RestaurantOrder } from "./business-model";
import { restaurantSalesReport } from "./reporting";
import { restaurantReportCsv } from "./sales-report";
import { reportRequestQuery } from "./report-model";
import { executeRestaurantCommand, restaurantBusinessSnapshot } from "./business";
let dir: string;
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-report-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-21T17:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
function day(b: RestaurantBusiness, date: string, sales: number, covers: number, minutes?: number, more: Partial<RestaurantClose> = {}) {
  const c: RestaurantClose = { id: randomUUID(), date, operated: true, openingCash: 0, countedCash: 0, expectedCash: 0, variance: 0, cashCollected: 0, cardCollected: sales, sales, grossSales: sales, tax: 0, tips: 0, foodCost: 0, covers, orderCount: covers, note: "Private close evidence", actor: "Private accountant", at: new Date().toISOString(), revision: 1, ...more }; b.closes.push(c);
  if (minutes !== undefined) (b.serviceHours ??= []).push({ id: randomUUID(), closeId: c.id, revision: 1, openMinutes: minutes, evidence: "Private opening evidence", actor: "Private accountant", at: new Date().toISOString() }); return c;
}
function weekPattern() {
  const b = emptyRestaurantBusiness();
  for (const date of ["2026-08-03", "2026-08-10", "2026-08-17"]) day(b, date, 20000, 20, 120);
  for (const date of ["2026-08-04", "2026-08-11", "2026-08-18"]) day(b, date, 30000, 30, 600);
  return b;
}
const run = (action: string, input: unknown, requestId = randomUUID()) => executeRestaurantCommand({ action, input, requestId }, "Actual reviewer");
it("corrects the apparent quiet day when opening durations differ and weights by total exposure", () => {
  const b = weekPattern(), report = restaurantSalesReport(b);
  expect(report.quietest?.name).toBe("Tuesday"); expect(report.busiest?.name).toBe("Monday"); expect(report.weekdays[1]).toMatchObject({ observedDays: 3, openMinutes: 360, salesPerHour: 10000, coversPerHour: 10 });
  const raw = restaurantSalesReport(b, { basis: "open_day" }); expect(raw.quietest?.name).toBe("Monday"); expect(raw.busiest?.name).toBe("Tuesday");
  const uneven = emptyRestaurantBusiness(); for (const [date, minutes] of [["2026-08-03", 60], ["2026-08-10", 60], ["2026-08-17", 600]] as const) day(uneven, date, 10000, 10, minutes);
  expect(restaurantSalesReport(uneven).weekdays[1].salesPerHour).toBe(2500);
  for (const c of b.closes) c.sales = c.grossSales = 0; b.closes[0].sales = b.closes[0].grossSales = 1;
  const fractional = restaurantSalesReport(b, { basis: "open_day" }); expect(fractional.weekdays[1].averageSales).toBe(1 / 3); expect(fractional.busiestDays).toEqual(["Monday"]);
});
it("keeps zero-service demand, closed dates and unknown opening time distinct", () => {
  const b = weekPattern(); day(b, "2026-08-05", 0, 0, 480); day(b, "2026-08-06", 0, 0, undefined, { operated: false }); b.serviceHours!.shift();
  const report = restaurantSalesReport(b, { from: "2026-08-03", to: "2026-08-18" }); expect(report.period).toMatchObject({ openDays: 7, closedDays: 1, daysMissingHours: 1, unreviewedDays: 8 }); expect(report.weekdays[3].salesPerHour).toBe(0); expect(report.weekdays[4].salesPerHour).toBeNull(); expect(report.weekdays[1].comparable).toBe(false); expect(report.quietest).toBeNull();
  expect(report.days.find(d => d.date === "2026-08-06")?.openMinutes).toBe(0); expect(report.days.find(d => d.date === "2026-08-03")?.openMinutes).toBeNull();
});
it("shows ties without inventing a uniquely busiest or quietest weekday", () => {
  const b = weekPattern(); for (const c of b.closes) { c.sales = c.grossSales = 10000; c.covers = 10; } for (const h of b.serviceHours!) h.openMinutes = 120;
  const report = restaurantSalesReport(b); expect(report.quietest).toBeNull(); expect(report.busiest).toBeNull(); expect(report.quietestDays).toEqual(["Monday", "Tuesday"]); expect(report.guidance).toContain("are tied");
});
it("requires complete coverage for percentage comparisons and does not invent a zero baseline", () => {
  const b = emptyRestaurantBusiness();
  for (let n = 1; n <= 14; n++) { const open = n % 7 < 4 && n % 7 > 0; day(b, `2026-08-${String(n).padStart(2, "0")}`, open ? n <= 7 ? 10000 : 20000 : 0, open ? 10 : 0, open ? 120 : undefined, { operated: open }); }
  const report = restaurantSalesReport(b, { from: "2026-08-08", to: "2026-08-14" }); expect(report.previous).toMatchObject({ from: "2026-08-01", to: "2026-08-07", openDays: 3, unreviewedDays: 0 }); expect(report.comparison).toMatchObject({ comparable: true, salesPercent: 100, coversPercent: 0 });
  const removed = b.closes.pop()!; expect(restaurantSalesReport(b, { from: "2026-08-08", to: "2026-08-14" }).comparison.comparable).toBe(false); b.closes.push(removed);
  for (const c of b.closes.filter(c => c.date < "2026-08-08")) c.grossSales = 0;
  expect(restaurantSalesReport(b, { from: "2026-08-08", to: "2026-08-14" }).comparison.salesPercent).toBeNull();
});
it("filters service-date menu/hour/channel data and credits through the selected end date", () => {
  const b = emptyRestaurantBusiness(), id = randomUUID(), menuId = randomUUID(), lineId = randomUUID();
  const order: RestaurantOrder = { id, ref: "Private check", channel: "dine_in", guest: "Private guest", covers: 2, reservationId: "party", tableId: null, server: "Private server", note: "Private kitchen", status: "closed", revision: 1, date: "2026-08-03", createdAt: "2026-08-04T01:00:00Z", servedAt: "2026-08-04T01:10:00Z", saleDate: "2026-08-03", saleHour: 1, closedAt: "2026-08-04T01:20:00Z", ticketId: null, lines: [{ id: lineId, menuId, menuRevision: 1, name: "Rice", station: "Kitchen", qty: 1, unitPrice: 1000, subtotal: 1000, allergens: "Private notes", recipe: [] }], subtotal: 1000, tax: 100, taxBasisPoints: 1000, total: 1100, foodCost: 200, paid: 1100, consumed: [] };
  b.orders.push(order, { ...order, id: randomUUID(), lines: [{ ...order.lines[0], id: randomUUID() }] }, { ...order, id: randomUUID(), channel: "online", reservationId: null, covers: 1, date: "2026-08-04", saleDate: "2026-08-04" });
  day(b, "2026-08-03", 2000, 2, 120); day(b, "2026-08-04", 1000, 1, 120);
  b.credits = [{ id: randomUUID(), orderId: id, reference: "Private credit reference", date: "2026-08-05", at: "2026-08-05T12:00:00Z", actor: "Private approver", reason: "Private evidence", kind: "sale", lines: [{ menuId, lineId, name: "Rice", amount: 400 }], subtotal: 400, tax: 40, tips: 0, deposit: 0, total: 440, receivableReduction: 0, refundLiability: 440 }];
  day(b, "2026-08-05", 0, 0, undefined, { operated: false, credits: 400, sales: -400 });
  const before = restaurantSalesReport(b, { from: "2026-08-03", to: "2026-08-03" }); expect(before.items[0]).toMatchObject({ quantity: 2, sales: 2000 }); expect(before.hours[1]).toMatchObject({ orders: 2, sales: 2000 }); expect(before.channels[0]).toMatchObject({ orders: 2, covers: 2 }); expect(before.channels[2].orders).toBe(0);
  const after = restaurantSalesReport(b, { from: "2026-08-03", to: "2026-08-05" }); expect(after.items[0].sales).toBe(2600); expect(after.period.netSales).toBe(2600);
  const creditDay = restaurantSalesReport(b, { from: "2026-08-05", to: "2026-08-05" }); expect(creditDay.items).toEqual([]); expect(creditDay.period).toMatchObject({ sales: 0, credits: 400, netSales: -400 }); expect(JSON.stringify(after)).not.toContain("Private");
});
it("validates paired real dates, bounds, repeated filters and future business dates", () => {
  const b = emptyRestaurantBusiness();
  for (const q of [{ from: "2026-08-01" }, { from: "2026-08-02", to: "2026-08-01" }, { from: "2025-01-01", to: "2026-08-01" }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2026-09-22", to: "2026-09-22" }]) expect(() => restaurantSalesReport(b, q)).toThrow();
  expect(() => reportRequestQuery("https://test.invalid?basis=open_day&basis=open_hour")).toThrow("one value");
  b.config.timezone = "America/New_York"; b.config.businessDayStartHour = 4; vi.setSystemTime(new Date("2026-09-22T05:00:00Z")); expect(() => restaurantSalesReport(b, { from: "2026-09-22", to: "2026-09-22" })).toThrow("business date");
});
it("captures reviewed opening time atomically with close and appends correction evidence without financial changes", () => {
  const close = run("close", { date: "2026-09-21", operated: true, openMinutes: 480, countedCash: 0, note: "Door open 10 to 18, checked log", reviewed: true }).id;
  const original = restaurantBusinessSnapshot(), requestId = randomUUID(), input = { closeId: close, revision: 1, openMinutes: 450, evidence: "Deduct the documented 30-minute emergency closure", reviewed: true };
  run("hours.review", input, requestId); run("hours.review", input, requestId);
  const updated = restaurantBusinessSnapshot(); expect(updated.closes).toEqual(original.closes); expect(updated.journals).toEqual(original.journals); expect(updated.serviceHours?.map(h => h.openMinutes)).toEqual([480, 450]); expect(updated.serviceHours?.[1].actor).toBe("Actual reviewer");
  expect(() => run("hours.review", input)).toThrow("Opening time changed"); expect(restaurantBusinessSnapshot()).toEqual(updated);
});
it("leaves legacy opening time unknown and rejects invented duration for a closed day", () => {
  const open = run("close", { date: "2026-09-20", operated: true, countedCash: 0, note: "Old integration close", reviewed: true }).id;
  expect(restaurantSalesReport(restaurantBusinessSnapshot()).period.daysMissingHours).toBe(1);
  run("hours.review", { closeId: open, revision: 0, openMinutes: 1440, evidence: "Verified elapsed time for a full service day", reviewed: true });
  const before = restaurantBusinessSnapshot(); expect(() => run("close", { date: "2026-09-21", operated: false, openMinutes: 30, countedCash: 0, note: "No service", reviewed: true })).toThrow("Closed days"); expect(restaurantBusinessSnapshot()).toEqual(before);
  const closed = run("close", { date: "2026-09-21", operated: false, countedCash: 0, note: "No service", reviewed: true }).id;
  expect(() => run("hours.review", { closeId: closed, revision: 0, openMinutes: 60, evidence: "Invalid hours", reviewed: true })).toThrow("open for service");
  expect(() => run("hours.review", { closeId: open, revision: 1, openMinutes: 0, evidence: "Invalid hours", reviewed: true })).toThrow();
});
it("exports selected reviewed days with unknown hours blank and no private evidence", () => {
  const b = weekPattern(); b.serviceHours!.shift(); day(b, "2026-08-05", 0, 0, undefined, { operated: false });
  const csv = restaurantReportCsv(restaurantSalesReport(b, { from: "2026-08-03", to: "2026-08-05" })); expect(csv.split("\r\n")).toHaveLength(5); expect(csv).toContain("2026-08-03,yes,,20000"); expect(csv).toContain("2026-08-05,no,0,0"); expect(csv).not.toContain("Private"); expect(csv).not.toContain("2026-08-10");
});

it("bounds opening time by the actual DST business day and preserves the reporting calendar after a zero-sales close", () => {
  vi.setSystemTime(new Date("2026-11-02T17:00:00Z"));
  run("configure", { name: "DST fixture", timezone: "America/New_York", businessDayStartHour: 0, taxBasisPoints: 0, taxReviewed: true });
  expect(() => run("close", { date: "2026-03-08", operated: true, openMinutes: 1440, countedCash: 0, note: "Spring forward fixture", reviewed: true })).toThrow("elapsed length"); expect(restaurantBusinessSnapshot().closes).toHaveLength(0);
  run("close", { date: "2026-03-08", operated: true, openMinutes: 1380, countedCash: 0, note: "Verified 23-hour business day", reviewed: true });
  run("close", { date: "2026-11-01", operated: true, openMinutes: 1500, countedCash: 0, note: "Verified repeated hour in 25-hour day", reviewed: true });
  expect(restaurantBusinessSnapshot().serviceHours?.map(h => h.openMinutes)).toEqual([1380, 1500]);
  expect(() => run("configure", { name: "DST fixture", timezone: "UTC", businessDayStartHour: 0, taxBasisPoints: 0, taxReviewed: true })).toThrow("boundaries are fixed");
});
