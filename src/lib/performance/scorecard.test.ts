import { describe, it, expect } from "vitest";
import { computeScorecards, type PerfInput } from "./scorecard";

const base: PerfInput = {
  members: [
    { id: "alex", name: "Alex Rivera", role: "Sales", salaryCents: 6000000 },
    { id: "sam", name: "Sam Cohen", role: "Production", salaryCents: 5000000 },
    { id: "mia", name: "Mia Alvarez", role: "Fulfillment", salaryCents: 4800000 },
    { id: "nopay", name: "Pat Lee", role: "Sales", salaryCents: null },
  ],
  accounts: [
    { customerId: "c1", accountOwner: "Alex Rivera" },
    { customerId: "c2", accountOwner: "alex rivera" }, // case-insensitive
    { customerId: "c3", accountOwner: "Someone Else" },
  ],
  orders: [
    { customerId: "c1", subtotalCents: 20000000, cancelled: false },
    { customerId: "c2", subtotalCents: 12000000, cancelled: false },
    { customerId: "c1", subtotalCents: 5000000, cancelled: true }, // excluded
    { customerId: "c3", subtotalCents: 9999, cancelled: false },   // not Alex's
  ],
  tasks: [
    { assigneeId: "sam", done: true, storyPoints: 8, xp: 50 },
    { assigneeId: "sam", done: true, storyPoints: 5, xp: 25 },
    { assigneeId: "sam", done: false, storyPoints: 3, xp: 0 },
    { assigneeId: "mia", done: true, storyPoints: 2, xp: 10 },
  ],
};

describe("computeScorecards", () => {
  const cards = computeScorecards(base);
  const alex = cards.find((c) => c.id === "alex")!;
  const sam = cards.find((c) => c.id === "sam")!;
  const mia = cards.find((c) => c.id === "mia")!;
  const nopay = cards.find((c) => c.id === "nopay")!;

  it("attributes revenue to the account owner (case-insensitive, excludes cancelled)", () => {
    expect(alex.revenueAttributedCents).toBe(32000000); // 20M + 12M
    expect(alex.accountsOwned).toBe(2);
    expect(alex.ordersCount).toBe(2);
  });

  it("computes value multiple, ROI% and profit contribution for revenue roles", () => {
    expect(alex.valueMultiple).toBeCloseTo(32000000 / 6000000, 4); // ~5.33×
    expect(alex.roiPct).toBe(Math.round(((32000000 - 6000000) / 6000000) * 100));
    expect(alex.profitContributionCents).toBe(32000000 - 6000000);
    expect(alex.verdict.tier).toBe("star"); // >5×
  });

  it("judges revenue role with no salary as set-salary", () => {
    expect(nopay.valueMultiple).toBeNull();
    expect(nopay.verdict.tier).toBe("set-salary");
  });

  it("scores support roles on throughput, not revenue (never underwater)", () => {
    expect(sam.isRevenueRole).toBe(false);
    expect(sam.supportScore).toBe(100); // highest support throughput
    expect(sam.valueMultiple).toBeNull();
    expect(sam.verdict.tier).toBe("star");
    expect(mia.supportScore).toBeLessThan(100);
    expect(["underwater", "set-salary"]).not.toContain(mia.verdict.tier);
  });

  it("counts done tasks + story points per member", () => {
    expect(sam.tasksDone).toBe(2);
    expect(sam.storyPointsDone).toBe(13);
    expect(sam.tasksOpen).toBe(1);
  });
});
