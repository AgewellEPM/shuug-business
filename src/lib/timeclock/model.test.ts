import { describe, it, expect } from "vitest";
import { entryHours, summarizeTimesheet, hourlyFromSalary, OT_THRESHOLD_HOURS, type TimeEntry, type EmployeeMeta } from "./model";

const HOUR = 3_600_000;
const base = 1_700_000_000_000;
const entry = (over: Partial<TimeEntry>): TimeEntry => ({ id: Math.random().toString(36).slice(2), employeeId: "e1", clockInMs: base, clockOutMs: base + 8 * HOUR, breakMinutes: 0, jobId: null, jobLabel: null, note: "", ...over });
const meta = (rate: number): ((id: string) => EmployeeMeta) => () => ({ name: "Worker", role: "Cook", hourlyRateCents: rate });

describe("entryHours", () => {
  it("computes worked hours minus break", () => {
    expect(entryHours(entry({ clockOutMs: base + 8 * HOUR, breakMinutes: 30 }), base)).toBe(7.5);
  });
  it("an open shift counts up to now, never negative", () => {
    expect(entryHours(entry({ clockOutMs: null }), base + 2 * HOUR)).toBe(2);
    expect(entryHours(entry({ clockInMs: base + 5 * HOUR, clockOutMs: null }), base)).toBe(0);
  });
});

describe("summarizeTimesheet", () => {
  it("splits regular vs overtime at 40h and pays OT at 1.5×", () => {
    // 45 hours in the week at $20/hr → 40 reg + 5 OT
    const entries = [entry({ clockInMs: base, clockOutMs: base + 45 * HOUR })];
    const s = summarizeTimesheet(entries, meta(2000), base + 45 * HOUR);
    const row = s.rows[0];
    expect(row.totalHours).toBe(45);
    expect(row.regularHours).toBe(OT_THRESHOLD_HOURS);
    expect(row.overtimeHours).toBe(5);
    expect(row.regularPayCents).toBe(40 * 2000);
    expect(row.overtimePayCents).toBe(Math.round(5 * 2000 * 1.5));
    expect(row.grossPayCents).toBe(40 * 2000 + Math.round(5 * 2000 * 1.5));
  });

  it("aggregates hours by job and flags who is still on the clock", () => {
    const entries = [
      entry({ employeeId: "e1", clockInMs: base, clockOutMs: base + 3 * HOUR, jobId: "task:1", jobLabel: "Prep" }),
      entry({ employeeId: "e1", clockInMs: base + 4 * HOUR, clockOutMs: null, jobId: "task:1", jobLabel: "Prep" }),
    ];
    const s = summarizeTimesheet(entries, meta(1500), base + 5 * HOUR);
    expect(s.onClockCount).toBe(1);
    expect(s.rows[0].onClock).toBe(true);
    expect(s.rows[0].jobs[0]).toMatchObject({ jobId: "task:1", jobLabel: "Prep", hours: 4 });
  });

  it("sums total gross across employees", () => {
    const entries = [entry({ employeeId: "a", clockOutMs: base + 10 * HOUR }), entry({ employeeId: "b", clockOutMs: base + 10 * HOUR })];
    const s = summarizeTimesheet(entries, meta(1000), base + 10 * HOUR);
    expect(s.rows).toHaveLength(2);
    expect(s.totalGrossPayCents).toBe(2 * 10 * 1000);
  });
});

describe("hourlyFromSalary", () => {
  it("spreads an annual salary over a 2080-hour year", () => {
    expect(hourlyFromSalary(5_200_000)).toBe(2500); // $52k → $25/hr
  });
});
