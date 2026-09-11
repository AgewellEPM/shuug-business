import { describe, it, expect } from "vitest";
import { pipelineSummary, defaultProbability, type Deal } from "./model";

const NOW = Date.parse("2026-09-11T00:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const deal = (over: Partial<Deal>): Deal => ({
  id: "d", title: "Deal", company: "Co", contact: "", customerId: null, stage: "new", assignedTo: null,
  expectedValueCents: 100000, probability: 10, source: "", nextAction: "", nextActionDate: null, lostReason: "",
  notes: "", createdAt: daysAgo(30), updatedAt: daysAgo(1), stageEnteredAt: daysAgo(1), ...over,
});

describe("defaultProbability", () => {
  it("rises by stage", () => {
    expect(defaultProbability("new")).toBe(10);
    expect(defaultProbability("proposal")).toBe(60);
    expect(defaultProbability("won")).toBe(100);
    expect(defaultProbability("lost")).toBe(0);
  });
});

describe("pipelineSummary", () => {
  const deals = [
    deal({ id: "a", stage: "new", expectedValueCents: 100000, probability: 10 }),
    deal({ id: "b", stage: "proposal", expectedValueCents: 200000, probability: 60 }),
    deal({ id: "c", stage: "won", expectedValueCents: 300000 }),
    deal({ id: "d", stage: "lost", expectedValueCents: 400000 }),
    deal({ id: "e", stage: "qualified", expectedValueCents: 50000, probability: 30, stageEnteredAt: daysAgo(40) }),
  ];
  const s = pipelineSummary(deals, NOW);

  it("weights the forecast by probability across open deals", () => {
    // open: a(100k*.1=10k) + b(200k*.6=120k) + e(50k*.3=15k) = 145k
    expect(s.weightedForecastCents).toBe(145000);
    expect(s.openCount).toBe(3);
    expect(s.openValueCents).toBe(350000);
  });

  it("computes win rate from closed deals", () => {
    expect(s.wonCount).toBe(1);
    expect(s.lostCount).toBe(1);
    expect(s.winRatePct).toBe(50);
    expect(s.wonValueCents).toBe(300000);
  });

  it("flags stalled open deals by days in stage", () => {
    expect(s.stalled.map((x) => x.id)).toEqual(["e"]); // 40 days in stage
  });

  it("rolls up by stage", () => {
    const proposal = s.byStage.find((b) => b.stage === "proposal")!;
    expect(proposal.count).toBe(1);
    expect(proposal.valueCents).toBe(200000);
  });
});
