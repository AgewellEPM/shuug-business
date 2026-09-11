import { describe, it, expect } from "vitest";
import { accountSummary, daysSinceLastOrder } from "./summary";
import type { Order } from "../data/model";

const order = (over: Partial<Order>): Order => ({
  id: "o", customerId: "c", status: "fulfilled", poNumber: null, createdAt: "2026-09-01T00:00:00.000Z",
  lines: [], subtotalCents: 0, freightCents: 0, totalCents: 0, note: "", ...over,
});

describe("accountSummary", () => {
  it("counts orders, lifetime spend, last order and open count; excludes cancelled", () => {
    const s = accountSummary([
      order({ id: "a", createdAt: "2026-08-01T00:00:00.000Z", totalCents: 5000, status: "fulfilled" }),
      order({ id: "b", createdAt: "2026-09-05T00:00:00.000Z", totalCents: 3000, status: "submitted" }),
      order({ id: "c", createdAt: "2026-09-09T00:00:00.000Z", totalCents: 9999, status: "cancelled" }),
    ]);
    expect(s.orderCount).toBe(2);
    expect(s.lifetimeSpendCents).toBe(8000);
    expect(s.openOrders).toBe(1);
    expect(s.lastOrderISO).toBe("2026-09-05T00:00:00.000Z");
    expect(s.avgOrderCents).toBe(4000);
  });
  it("is empty-safe", () => {
    expect(accountSummary([])).toEqual({ orderCount: 0, lifetimeSpendCents: 0, lastOrderISO: null, openOrders: 0, avgOrderCents: 0 });
  });
});

describe("daysSinceLastOrder", () => {
  it("computes whole days, null when never ordered", () => {
    expect(daysSinceLastOrder("2026-09-01T00:00:00.000Z", new Date("2026-09-11T00:00:00.000Z"))).toBe(10);
    expect(daysSinceLastOrder(null, new Date())).toBeNull();
  });
});
