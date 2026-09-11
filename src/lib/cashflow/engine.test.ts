import { describe, it, expect } from "vitest";
import { computeCashFlow, ageReceivables, termDays, type CashItem } from "./engine";

const NOW = Date.parse("2026-09-11T00:00:00.000Z");
const day = (n: number) => NOW + n * 86_400_000;
const recv = (amountCents: number, dueMs: number): CashItem => ({ amountCents, dueMs, label: "inv", kind: "collection" });
const bill = (amountCents: number, dueMs: number): CashItem => ({ amountCents, dueMs, label: "bill", kind: "bill" });

describe("termDays", () => {
  it("maps terms to days; prepaid/card due now", () => {
    expect(termDays("net30")).toBe(30);
    expect(termDays("net45")).toBe(45);
    expect(termDays("prepaid")).toBe(0);
    expect(termDays("card")).toBe(0);
  });
});

describe("computeCashFlow", () => {
  it("runs a weekly balance from opening + collections − bills", () => {
    const f = computeCashFlow({
      openingCents: 100000,
      receivables: [recv(50000, day(3)), recv(30000, day(10))],
      payables: [bill(40000, day(5))],
      nowMs: NOW, weeks: 4,
    });
    // week 0: +50000 -40000 = +10000 → 110000; week 1: +30000 → 140000
    expect(f.weeks[0].endingBalanceCents).toBe(110000);
    expect(f.weeks[1].endingBalanceCents).toBe(140000);
    expect(f.totalExpectedInCents).toBe(80000);
    expect(f.totalExpectedOutCents).toBe(40000);
  });

  it("flags going negative and reports the lowest point", () => {
    const f = computeCashFlow({ openingCents: 10000, receivables: [], payables: [bill(25000, day(2))], nowMs: NOW, weeks: 4 });
    expect(f.goesNegative).toBe(true);
    expect(f.lowestBalanceCents).toBe(-15000);
  });

  it("collection-delay scenario pushes cash later (can turn a good week negative)", () => {
    const base = { openingCents: 0, receivables: [recv(50000, day(2))], payables: [bill(50000, day(3))], nowMs: NOW, weeks: 4 };
    const onTime = computeCashFlow(base);
    const late = computeCashFlow({ ...base, collectionDelayDays: 14 });
    expect(onTime.goesNegative).toBe(false);       // collection same week as bill
    expect(late.goesNegative).toBe(true);          // bill hits before the delayed collection
  });
});

describe("ageReceivables", () => {
  it("buckets by days overdue", () => {
    const a = ageReceivables([recv(1000, day(5)), recv(2000, day(-10)), recv(3000, day(-45)), recv(4000, day(-100))], NOW);
    expect(a.currentCents).toBe(1000);
    expect(a.d1_30Cents).toBe(2000);
    expect(a.d31_60Cents).toBe(3000);
    expect(a.d90plusCents).toBe(4000);
    expect(a.totalCents).toBe(10000);
  });
});
