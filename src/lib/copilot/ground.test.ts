import { describe, it, expect } from "vitest";
import { groundingFacts } from "./ground";
import { computeAnalytics } from "../analytics/metrics";
import type { Customer, Order, Sku } from "../data/model";

const SKUS: Sku[] = [
  { id: "shuug-amba", name: "Amba Hot Sauce", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 3600, standardPriceCents: 7200 },
];
const CUSTOMERS: Customer[] = [
  { id: "joes", company: "Joe's Market", channel: "store", buyerName: "b", buyerEmail: "b@x.co", website: null, accountOwner: "Alex", region: "MA", billingAddress: "", shippingAddress: "", quickbooksCustomerId: null, requiresPO: false },
];
const ORDERS: Order[] = [
  {
    id: "O1", customerId: "joes", status: "fulfilled", poNumber: null, createdAt: "2026-08-03T00:00:00.000Z",
    lines: [{ skuId: "shuug-amba", unit: "case", quantity: 10, cases: 10, unitPriceCents: 6600, tierLabel: "10–24", isOverride: false, lineTotalCents: 66000 }],
    subtotalCents: 66000, freightCents: 0, totalCents: 66000, note: "",
  },
];

describe("groundingFacts", () => {
  const facts = groundingFacts(computeAnalytics(ORDERS, CUSTOMERS, SKUS));

  it("includes formatted totals and named rollups the model must cite", () => {
    expect(facts).toContain("Total revenue: $660.00");
    expect(facts).toContain("Amba Hot Sauce");
    expect(facts).toContain("Joe's Market");
    expect(facts).toContain("Alex"); // owner
    expect(facts).toContain("MA"); // region
    expect(facts).toContain("2026-08");
  });

  it("labels the block as authoritative", () => {
    expect(facts).toMatch(/authoritative/i);
  });
});
