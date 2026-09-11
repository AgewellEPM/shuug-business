import { describe, it, expect } from "vitest";
import { composite, classifyTask, assessRole } from "./engine";
import { getBenchmark } from "./data";
import type { BenchmarkTask, TaskMetrics } from "./model";

const H: TaskMetrics = { accuracyPct: 96, throughputPerHr: 21, exceptionResolvedPct: 97, costPerTaskCents: 384, cycleTimeMin: 11, reworkPct: 6, humanSupervisionPct: 0, compliancePass: true, criticalErrorPass: true, trials: 500 };
const AI_WIN: TaskMetrics = { accuracyPct: 99, throughputPerHr: 143, exceptionResolvedPct: 92, costPerTaskCents: 31, cycleTimeMin: 2, reworkPct: 2, humanSupervisionPct: 6, compliancePass: true, criticalErrorPass: true, trials: 500 };
const task = (human: TaskMetrics, ai: TaskMetrics): BenchmarkTask => ({ id: "t", label: "t", weight: 1, human, ai });

describe("composite", () => {
  it("scores 0–100 and rewards the stronger side", () => {
    expect(composite(AI_WIN, H)).toBeGreaterThan(composite(H, AI_WIN));
    expect(composite(H, AI_WIN)).toBeGreaterThanOrEqual(0);
    expect(composite(AI_WIN, H)).toBeLessThanOrEqual(100);
  });
});

describe("classifyTask", () => {
  it("ai-ready when AI matches quality + beats cost/throughput with low supervision", () => {
    expect(classifyTask(task(H, AI_WIN))).toBe("ai-ready");
  });
  it("human-judgment when AI fails a hard gate — regardless of speed/cost", () => {
    const cheapButUngated = { ...AI_WIN, compliancePass: false };
    expect(classifyTask(task(H, cheapButUngated))).toBe("human-judgment");
  });
  it("human-better when the human clearly wins on edge cases", () => {
    const weakAi = { ...AI_WIN, accuracyPct: 88, exceptionResolvedPct: 60, humanSupervisionPct: 45 };
    expect(classifyTask(task(H, weakAi))).toBe("human-better");
  });
});

describe("assessRole (automation case)", () => {
  it("Fulfillment: strong automation case, gate task stays human, replaceable is bounded", () => {
    const c = assessRole(getBenchmark("Fulfillment")!);
    expect(c.aiChallenger).toBeGreaterThan(c.humanBaseline);
    expect(c.economics.costSavingPct).toBeGreaterThan(50);
    expect(c.economics.throughputMultiple).toBeGreaterThan(1);
    // The compliance task (AI fails gate) must NOT be counted ai-ready.
    const compliance = c.tasks.find((t) => t.taskId === "compliance")!;
    expect(compliance.subClass).toBe("human-judgment");
    // substitution percentages sum to ~100
    const sum = Object.values(c.substitution).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
    expect(["Automate", "Augment"]).toContain(c.recommendation);
  });

  it("a gate failure caps viability and never fabricates a full-automate", () => {
    const c = assessRole({ role: "X", provenance: "sample", tasks: [task(H, { ...AI_WIN, compliancePass: false })] });
    expect(c.gatesPass).toBe(false);
    expect(c.viabilityScore).toBeLessThanOrEqual(55);
    expect(c.recommendation).not.toBe("Automate");
  });

  it("confidence tracks the minimum trial count", () => {
    expect(assessRole(getBenchmark("Production")!).confidence).toBe("Medium"); // min trials 150
  });
});
