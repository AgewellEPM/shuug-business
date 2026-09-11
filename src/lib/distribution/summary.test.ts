import { describe, it, expect } from "vitest";
import { distributionOverview } from "./summary";
import type { Customer } from "../data/model";
import type { NamedRevenue } from "../analytics/metrics";

const cust = (id: string, region: string, channel: Customer["channel"], owner: string, shippingAddress = "1 Main St"): Customer =>
  ({ id, company: id, channel, accountOwner: owner, region, shippingAddress } as unknown as Customer);

const rev = (label: string, revenueCents: number, orderCount = 1): NamedRevenue => ({ key: label, label, revenueCents, orderCount, cases: 0 });

describe("distributionOverview", () => {
  const customers = [
    cust("joes", "MA", "store", "Dana"),
    cust("acme", "MA", "wholesale_bulk", "Dana"),
    cust("westco", "CA", "store", "Sam"),
    cust("shopsite", "CA", "online", "Sam"), // online = no route stop
  ];
  const byRegion = [rev("MA", 30000, 5), rev("CA", 20000, 3)];
  const byOwner = [rev("Dana", 30000), rev("Sam", 20000)];
  const byChannel = [rev("Store", 35000, 6), rev("Wholesale (bulk)", 10000, 1), rev("Online", 5000, 1)];

  const o = distributionOverview(customers, byRegion, byOwner, byChannel);

  it("counts accounts and regions", () => {
    expect(o.totalAccounts).toBe(4);
    expect(o.regionsCovered).toBe(2);
  });

  it("builds territories with account counts, owners, channel mix and joined revenue", () => {
    const ma = o.territories.find((t) => t.region === "MA")!;
    expect(ma.accounts).toBe(2);
    expect(ma.owners).toEqual(["Dana"]);
    expect(ma.channels).toEqual({ store: 1, wholesale_bulk: 1 });
    expect(ma.revenueCents).toBe(30000);
  });

  it("rolls rep load across territories", () => {
    const dana = o.reps.find((r) => r.owner === "Dana")!;
    expect(dana.accounts).toBe(2);
    expect(dana.regions).toEqual(["MA"]);
    expect(dana.revenueCents).toBe(30000);
  });

  it("lists only channels that have accounts, sorted by revenue", () => {
    expect(o.channels.map((c) => c.channel)).toEqual(["store", "wholesale_bulk", "online"]);
    expect(o.channels.find((c) => c.channel === "amazon")).toBeUndefined();
  });

  it("builds delivery routes by region, excluding online (carrier-shipped)", () => {
    const ca = o.routes.find((g) => g.region === "CA")!;
    expect(ca.stops.map((s) => s.customerId)).toEqual(["westco"]); // shopsite is online → excluded
    const ma = o.routes.find((g) => g.region === "MA")!;
    expect(ma.stops).toHaveLength(2);
  });
});
