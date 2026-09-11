import { describe, it, expect } from "vitest";
import { rollupAmazon, channelSales, roas, trailingChannelRevenueCents } from "./summary";
import type { CampaignReceipt } from "../amazon-ads/model";
import type { NamedRevenue } from "../analytics/metrics";
import type { Customer, Order } from "../data/model";

function receipt(status: CampaignReceipt["status"], dailyBudgetCents: number): CampaignReceipt {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    accountKey: "k",
    profile: {} as CampaignReceipt["profile"],
    plan: { dailyBudgetCents } as CampaignReceipt["plan"],
    status,
    step: "",
    message: "",
    adIds: [],
    targetIds: [],
    negativeIds: [],
    complete: false,
  };
}

describe("rollupAmazon", () => {
  it("counts campaigns and only sums budget for active ones", () => {
    const r = rollupAmazon([
      receipt("active", 5000),
      receipt("active", 3000),
      receipt("paused", 9999), // paused budget must NOT count — it isn't spending
      receipt("draft", 100),
    ]);
    expect(r.campaigns).toBe(4);
    expect(r.activeCampaigns).toBe(2);
    expect(r.dailyBudgetCents).toBe(8000);
  });

  it("surfaces campaigns that need attention", () => {
    const r = rollupAmazon([receipt("attention", 1000), receipt("active", 2000)]);
    expect(r.needsAttention).toBe(1);
  });

  it("is empty-safe", () => {
    const r = rollupAmazon([]);
    expect(r).toEqual({ campaigns: 0, activeCampaigns: 0, needsAttention: 0, dailyBudgetCents: 0 });
  });
});

describe("channelSales (website analytics pipe)", () => {
  const byChannel: NamedRevenue[] = [
    { key: "Online", label: "Online", revenueCents: 30000, orderCount: 4, cases: 12 },
    { key: "Amazon", label: "Amazon", revenueCents: 15000, orderCount: 3, cases: 6 },
  ];

  it("extracts website (Online) revenue, orders and avg order value", () => {
    expect(channelSales(byChannel, "Online")).toEqual({ revenueCents: 30000, orders: 4, aovCents: 7500 });
  });

  it("extracts Amazon marketplace sales separately", () => {
    expect(channelSales(byChannel, "Amazon")).toEqual({ revenueCents: 15000, orders: 3, aovCents: 5000 });
  });

  it("returns zeros for a channel with no orders", () => {
    expect(channelSales(byChannel, "Store")).toEqual({ revenueCents: 0, orders: 0, aovCents: 0 });
  });
});

describe("roas", () => {
  it("is revenue divided by spend", () => {
    expect(roas(30000, 10000)).toBe(3);
  });
  it("is null when spend is zero or negative — never divide by nothing", () => {
    expect(roas(30000, 0)).toBeNull();
    expect(roas(30000, -5)).toBeNull();
  });
});

describe("trailingChannelRevenueCents", () => {
  const now = new Date("2026-09-10T00:00:00.000Z");
  const customers = [
    { id: "amz", channel: "amazon" },
    { id: "web", channel: "online" },
  ] as unknown as Customer[];
  const order = (customerId: string, createdAt: string, subtotalCents: number) =>
    ({ customerId, createdAt, subtotalCents, lines: [] }) as unknown as Order;

  it("sums only the named channel's revenue inside the window", () => {
    const orders = [
      order("amz", "2026-09-01T00:00:00.000Z", 5000), // in window, amazon
      order("amz", "2026-09-05T00:00:00.000Z", 3000), // in window, amazon
      order("web", "2026-09-02T00:00:00.000Z", 9999), // in window, but wrong channel
    ];
    expect(trailingChannelRevenueCents(orders, customers, "Amazon", now)).toBe(8000);
    expect(trailingChannelRevenueCents(orders, customers, "Online", now)).toBe(9999);
  });

  it("excludes orders older than the window", () => {
    const orders = [
      order("amz", "2026-07-01T00:00:00.000Z", 5000), // >30 days ago
      order("amz", "2026-09-08T00:00:00.000Z", 2000), // recent
    ];
    expect(trailingChannelRevenueCents(orders, customers, "Amazon", now)).toBe(2000);
  });
});
