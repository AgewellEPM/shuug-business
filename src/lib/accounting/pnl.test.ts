import { describe, it, expect } from "vitest";
import { computePnl } from "./pnl";
import type { Order, Sku } from "../data/model";
import type { Expense } from "../expenses/model";

const sku: Sku = { id: "amba", name: "Amba", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 4000, standardPriceCents: 6000 };
const order = (subtotalCents: number, lines: { costAtOrderCents?: number; cases: number; skuId: string }[], status: Order["status"] = "fulfilled"): Order =>
  ({ id: "o", customerId: "c", status, poNumber: null, createdAt: "2026-09-01T00:00:00.000Z", subtotalCents, freightCents: 0, totalCents: subtotalCents, note: "", lines: lines as Order["lines"] });
const exp = (category: string, amountCents: number, kind: "expense" | "refund" = "expense", status = "recorded"): Expense =>
  ({ id: "e", status, updatedAt: "", fields: { category, amountCents, kind, currency: "USD", treatment: "operating" } } as unknown as Expense);

describe("computePnl", () => {
  it("does not turn foreign receipt amounts, inventory, equipment or card payments into USD operating costs", () => {
    const base = exp("Software", 500);
    const excluded = ["inventory", "asset", "transfer"].map(treatment => ({ ...base, fields: { ...base.fields, treatment } } as Expense));
    excluded.push({ ...base, fields: { ...base.fields, currency: "EUR" } });
    expect(computePnl([], [], [base, ...excluded]).totalOperatingExpensesCents).toBe(500);
  });
  it("computes income, COGS from captured cost, gross profit and margin", () => {
    const pnl = computePnl([order(10000, [{ costAtOrderCents: 4000, cases: 1, skuId: "amba" }])], [sku], []);
    expect(pnl.incomeCents).toBe(10000);
    expect(pnl.cogsCents).toBe(4000);
    expect(pnl.grossProfitCents).toBe(6000);
    expect(pnl.grossMarginFraction).toBeCloseTo(0.6, 5);
  });

  it("falls back to sku cost × cases when line cost is absent, excludes cancelled", () => {
    const pnl = computePnl([
      order(12000, [{ cases: 2, skuId: "amba" }]),               // COGS = 4000*2 = 8000
      order(9999, [{ costAtOrderCents: 1, cases: 1, skuId: "amba" }], "cancelled"), // excluded
    ], [sku], []);
    expect(pnl.incomeCents).toBe(12000);
    expect(pnl.cogsCents).toBe(8000);
  });

  it("rolls recorded operating expenses by category (refunds subtract), nets income", () => {
    const pnl = computePnl(
      [order(10000, [{ costAtOrderCents: 4000, cases: 1, skuId: "amba" }])],
      [sku],
      [exp("Shipping", 1000), exp("Shipping", 500), exp("Software", 2000), exp("Software", 500, "refund"), exp("Ignored", 9999, "expense", "draft")],
    );
    expect(pnl.operatingExpensesByCategory).toEqual([
      { label: "Shipping", cents: 1500 },
      { label: "Software", cents: 1500 },
    ]);
    expect(pnl.totalOperatingExpensesCents).toBe(3000);
    expect(pnl.netIncomeCents).toBe(6000 - 3000);
  });

  it("emits cost-lowering insights", () => {
    const pnl = computePnl([order(10000, [{ costAtOrderCents: 7000, cases: 1, skuId: "amba" }])], [sku], [exp("Freight", 1000)]);
    expect(pnl.insights.some((s) => /cost of goods/i.test(s))).toBe(true);
    expect(pnl.insights.some((s) => /Freight/.test(s))).toBe(true);
  });
});
