import { describe, it, expect } from "vitest";
import { computeAnalytics } from "./metrics";
import type { Customer, Order, Sku } from "../data/model";

const SKUS: Sku[] = [
  { id: "shuug-amba", name: "Amba Hot Sauce", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 3600, standardPriceCents: 7200 },
  { id: "shuug-zhoug", name: "Zhoug Hot Sauce", unitsPerCase: 12, retailPriceCents: 1199, costPerCaseCents: 3600, standardPriceCents: 7200 },
];

function cust(id: string, region: string, owner: string): Customer {
  return {
    id, company: id, channel: "store", buyerName: "b", buyerEmail: "b@x.co", website: null,
    accountOwner: owner, region, billingAddress: "", shippingAddress: "",
    quickbooksCustomerId: null, requiresPO: false,
  };
}

function order(id: string, customerId: string, createdAt: string, lines: { skuId: string; cases: number; unit: number }[]): Order {
  const orderLines = lines.map((l) => ({
    skuId: l.skuId, unit: "case" as const, quantity: l.cases, cases: l.cases,
    unitPriceCents: l.unit, tierLabel: "x", isOverride: false, lineTotalCents: l.unit * l.cases,
  }));
  const subtotal = orderLines.reduce((n, l) => n + l.lineTotalCents, 0);
  return {
    id, customerId, status: "fulfilled", poNumber: null, createdAt,
    lines: orderLines, subtotalCents: subtotal, freightCents: 0, totalCents: subtotal, note: "",
  };
}

const CUSTOMERS = [cust("joes", "MA", "Alex"), cust("bigy", "MA", "Alex"), cust("mart", "CT", "Jordan")];
const ORDERS = [
  order("O1", "joes", "2026-07-06T00:00:00.000Z", [{ skuId: "shuug-amba", cases: 10, unit: 6600 }]), // Mon, 66000
  order("O2", "bigy", "2026-08-03T00:00:00.000Z", [{ skuId: "shuug-amba", cases: 20, unit: 6300 }]), // Mon, 126000
  order("O3", "mart", "2026-09-05T00:00:00.000Z", [{ skuId: "shuug-zhoug", cases: 10, unit: 6900 }]), // Sat, 69000
];

describe("computeAnalytics", () => {
  const a = computeAnalytics(ORDERS, CUSTOMERS, SKUS);

  it("excludes cancelled orders from sales, counts and averages", () => {
    const result=computeAnalytics([...ORDERS,{...ORDERS[0],id:"cancelled-copy",status:"cancelled"}],CUSTOMERS,SKUS);
    expect(result.totalRevenueCents).toBe(a.totalRevenueCents);
    expect(result.orderCount).toBe(a.orderCount);
    expect(result.avgOrderCents).toBe(a.avgOrderCents);
  });

  it("totals revenue, orders, cases", () => {
    expect(a.totalRevenueCents).toBe(66000 + 126000 + 69000);
    expect(a.orderCount).toBe(3);
    expect(a.totalCases).toBe(40);
    expect(a.avgOrderCents).toBe(Math.round(261000 / 3));
  });

  it("ranks top products by revenue", () => {
    expect(a.topProducts[0].key).toBe("shuug-amba"); // 66000+126000=192000
    expect(a.topProducts[0].revenueCents).toBe(192000);
    expect(a.topProducts[1].key).toBe("shuug-zhoug");
  });

  it("rolls up by region and owner", () => {
    const ma = a.byRegion.find((r) => r.key === "MA");
    expect(ma?.revenueCents).toBe(192000);
    expect(a.byRegion[0].key).toBe("MA"); // MA > CT
    const alex = a.byOwner.find((o) => o.key === "Alex");
    expect(alex?.revenueCents).toBe(192000);
  });

  it("buckets by month ascending and computes MoM growth", () => {
    expect(a.byMonth.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    // last (Sep 69000) vs prev (Aug 126000)
    expect(a.momGrowth).toBeCloseTo((69000 - 126000) / 126000, 6);
  });

  it("finds the best sales day of week", () => {
    // Mondays: 66000+126000=192000; Saturday: 69000 -> best is Mon
    expect(a.bestDay?.label).toBe("Mon");
    expect(a.byDayOfWeek).toHaveLength(7);
  });

  it("forecasts next month from trailing average", () => {
    expect(a.forecastNextMonthCents).toBe(Math.round((66000 + 126000 + 69000) / 3));
  });

  it("computes average sale price per case and per bottle, and total bottles", () => {
    // total cases = 40 (all case orders); bottles = 40 * 12 = 480
    expect(a.totalBottles).toBe(480);
    expect(a.avgCasePriceCents).toBe(Math.round(261000 / 40));
    expect(a.avgBottlePriceCents).toBe(Math.round(261000 / 480));
  });

  it("rolls up revenue by sales channel", () => {
    // all seed customers are channel "store"
    expect(a.byChannel).toHaveLength(1);
    expect(a.byChannel[0].label).toBe("Store");
    expect(a.byChannel[0].revenueCents).toBe(261000);
  });

  it("handles empty input without dividing by zero", () => {
    const empty = computeAnalytics([], CUSTOMERS, SKUS);
    expect(empty.totalRevenueCents).toBe(0);
    expect(empty.avgOrderCents).toBe(0);
    expect(empty.momGrowth).toBeNull();
    expect(empty.forecastNextMonthCents).toBeNull();
    expect(empty.bestDay).toBeNull();
  });
});
