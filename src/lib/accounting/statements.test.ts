import { describe, it, expect } from "vitest";
import { computeBalanceSheet } from "./balance-sheet";
import { computeSalesTax } from "./sales-tax";
import type { Customer, Order } from "../data/model";

describe("computeBalanceSheet", () => {
  it("always balances (owner's equity plugs the equation)", () => {
    const bs = computeBalanceSheet({
      accountsReceivableCents: 5000, inventoryValueCents: 12000, cashCents: 3000,
      accountsPayableCents: 2000, salesTaxPayableCents: 500, retainedEarningsCents: 9000,
    });
    expect(bs.assets.totalCents).toBe(20000);
    expect(bs.liabilities.totalCents).toBe(2500);
    expect(bs.equity.totalCents).toBe(20000 - 2500); // A - L
    expect(bs.equity.ownersEquityCents).toBe(17500 - 9000);
    expect(bs.balanced).toBe(true);
    expect(bs.assets.totalCents).toBe(bs.liabilities.totalCents + bs.equity.totalCents);
  });
});

describe("computeSalesTax", () => {
  const customers = [
    { id: "ma", region: "MA", channel: "store" },
    { id: "amz", region: "CA", channel: "amazon" },
  ] as unknown as Customer[];
  const order = (customerId: string, subtotalCents: number, status: Order["status"] = "fulfilled"): Order =>
    ({ id: "o", customerId, status, subtotalCents, freightCents: 0, totalCents: subtotalCents, lines: [], poNumber: null, createdAt: "", note: "" });

  it("estimates tax at the configured rate, excludes Amazon + cancelled", () => {
    const s = computeSalesTax([order("ma", 10000), order("amz", 9999), order("ma", 5000, "cancelled")], customers, 700);
    expect(s.taxableSalesCents).toBe(10000); // only MA store order
    expect(s.estimatedTaxCents).toBe(700);   // 7%
    expect(s.byRegion).toEqual([{ region: "MA", taxableCents: 10000, taxCents: 700 }]);
  });

  it("is zero with no rate set", () => {
    const s = computeSalesTax([order("ma", 10000)], customers, 0);
    expect(s.estimatedTaxCents).toBe(0);
    expect(s.note).toMatch(/set your rate|Set SALES_TAX/i);
  });
});
