import { describe, it, expect } from "vitest";
import { coverageGaps } from "./coverage";
import type { Customer, Order, Sku } from "../data/model";

const cust = (id: string, region: string): Customer => ({ id, company: id, region } as unknown as Customer);
const sku = (id: string, name: string): Sku => ({ id, name } as unknown as Sku);
const order = (customerId: string, lines: { skuId: string; lineTotalCents: number }[]): Order =>
  ({ customerId, createdAt: "2026-09-01T00:00:00.000Z", lines } as unknown as Order);

describe("coverageGaps", () => {
  const customers = [cust("joes", "MA"), cust("acme", "CA")];
  const skus = [sku("harissa", "Harissa"), sku("zhoug", "Zhoug"), sku("amba", "Amba")];
  // MA buys all three; CA buys only harissa → zhoug/amba are CA gaps.
  const orders = [
    order("joes", [{ skuId: "harissa", lineTotalCents: 5000 }, { skuId: "zhoug", lineTotalCents: 3000 }, { skuId: "amba", lineTotalCents: 1000 }]),
    order("acme", [{ skuId: "harissa", lineTotalCents: 4000 }]),
  ];
  const g = coverageGaps(customers, orders, skus);

  it("flags high-value products a region isn't buying", () => {
    const ca = g.regionGaps.find((r) => r.region === "CA")!;
    expect(ca.skusSold).toBe(1);
    expect(ca.missing.map((m) => m.skuId)).toEqual(["zhoug", "amba"]); // ranked by company revenue desc
  });

  it("shows no missing products for a fully-covered region", () => {
    const ma = g.regionGaps.find((r) => r.region === "MA")!;
    expect(ma.missing).toEqual([]);
  });

  it("reports product reach across territories", () => {
    const harissa = g.productReach.find((p) => p.skuId === "harissa")!;
    expect(harissa.regions).toBe(2);
    expect(harissa.totalRegions).toBe(2);
    const zhoug = g.productReach.find((p) => p.skuId === "zhoug")!;
    expect(zhoug.regions).toBe(1);
  });

  it("ranks the region with the biggest missed opportunity first", () => {
    expect(g.regionGaps[0].region).toBe("CA");
  });
});
