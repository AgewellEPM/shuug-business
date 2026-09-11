import { describe, it, expect } from "vitest";
import { evaluate, passes, summarize, type AutomationRule, type Signal } from "./model";

const rule = (over: Partial<AutomationRule>): AutomationRule => ({
  id: "r1", name: "test", enabled: true, trigger: "document-expiring", operator: "lte",
  threshold: 30, action: "notify", channel: null, createdAt: "2026-01-01T00:00:00Z", ...over,
});
const sig = (over: Partial<Signal>): Signal => ({
  kind: "document-expiring", entityId: "d1", entityLabel: "COI", value: 10, detail: "", ...over,
});

describe("passes", () => {
  it("gte fires at or above the threshold, not below", () => {
    expect(passes("gte", 15, 15)).toBe(true);
    expect(passes("gte", 16, 15)).toBe(true);
    expect(passes("gte", 14, 15)).toBe(false);
  });
  it("lte fires at or below the threshold, not above", () => {
    expect(passes("lte", 30, 30)).toBe(true);
    expect(passes("lte", 5, 30)).toBe(true);
    expect(passes("lte", 31, 30)).toBe(false);
  });
});

describe("evaluate", () => {
  it("fires a rule for every matching signal of its trigger kind", () => {
    const rules = [rule({ trigger: "document-expiring", operator: "lte", threshold: 30 })];
    const signals = [
      sig({ entityId: "a", value: 5 }),   // expiring soon — matches
      sig({ entityId: "b", value: 45 }),  // far off — no match
      sig({ entityId: "c", value: -3 }),  // already expired — matches (below threshold)
    ];
    const fired = evaluate(rules, signals);
    expect(fired).toHaveLength(1);
    expect(fired[0].matches.map((m) => m.entityId)).toEqual(["a", "c"]);
  });

  it("ignores disabled rules", () => {
    const fired = evaluate([rule({ enabled: false })], [sig({ value: 1 })]);
    expect(fired).toHaveLength(0);
  });

  it("only matches signals of the rule's trigger kind", () => {
    const rules = [rule({ trigger: "invoice-overdue", operator: "gte", threshold: 15 })];
    const signals = [
      sig({ kind: "document-expiring", value: 100 }),               // wrong kind
      sig({ kind: "invoice-overdue", entityId: "inv", value: 20 }), // right kind, over threshold
    ];
    const fired = evaluate(rules, signals);
    expect(fired).toHaveLength(1);
    expect(fired[0].matches.map((m) => m.entityId)).toEqual(["inv"]);
  });

  it("does not fire a rule with zero matches", () => {
    const rules = [rule({ trigger: "large-order", operator: "gte", threshold: 10000 })];
    const signals = [sig({ kind: "large-order", value: 500 })];
    expect(evaluate(rules, signals)).toHaveLength(0);
  });
});

describe("summarize", () => {
  it("counts rules, enabled, fired, and queued actions", () => {
    const rules = [rule({ id: "r1" }), rule({ id: "r2", enabled: false }), rule({ id: "r3", trigger: "invoice-overdue", operator: "gte", threshold: 15 })];
    const signals = [
      sig({ entityId: "a", value: 5 }),
      sig({ entityId: "b", value: 10 }),
      sig({ kind: "invoice-overdue", entityId: "inv", value: 20 }),
    ];
    const fired = evaluate(rules, signals);
    const s = summarize(rules, fired);
    expect(s.totalRules).toBe(3);
    expect(s.enabledRules).toBe(2);
    expect(s.firedRules).toBe(2);       // r1 (2 docs) + r3 (1 invoice)
    expect(s.actionsQueued).toBe(3);    // 2 + 1
  });
});
