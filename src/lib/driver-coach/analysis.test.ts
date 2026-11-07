// @vitest-environment node
import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { analyzeCoach } from "./analysis";
import { answerCoach } from "./answers";
import { coachPeriod } from "./model";
import type { DriverRecord } from "../rideshare-driver/model";

type Trip = Extract<DriverRecord, { kind: "trip" }>["body"];
const period = { from: "2026-11-01", through: "2026-11-30" };
const trip = (body: Partial<Trip> = {}): DriverRecord => ({ id: randomUUID(), revision: 1, deleted: false, kind: "trip", body: {
  startedAt: "2026-11-06T12:00:00Z", endedAt: "2026-11-06T12:30:00Z", localDate: "2026-11-06", timeZoneId: "America/New_York",
  classification: "business", distanceMeters: 16093.44, purpose: "Recorded job", notes: "", source: "gps", hasGaps: false, sampleCount: 20,
  earningsCents: 3000, platformFeesCents: 500, platform: "Uber", workArea: "Downtown", rideRole: "ride", ...body,
} });
it("ranks actual net losses and best jobs without adding payouts or subtracting cash expenses twice", () => {
  const best = trip({ purpose: "Best job" }), loss = trip({ purpose: "Loss job", earningsCents: 400, platformFeesCents: 300, platform: "Lyft" });
  const unpaid = trip({ purpose: "To next pickup", rideRole: "reposition", distanceMeters: 6437.376, earningsCents: undefined, platformFeesCents: undefined });
  const missing = trip({ purpose: "Fee missing", platformFeesCents: undefined });
  const income: DriverRecord = { id: randomUUID(), revision: 1, deleted: false, kind: "income", body: { date: "2026-11-06", platform: "uber", description: "Payout covering rides", amountCents: 3000, currency: "USD", notes: "" } };
  const expense: DriverRecord = { id: randomUUID(), revision: 1, deleted: false, kind: "expense", body: { date: "2026-11-06", merchant: "Fuel", category: "fuel", amountCents: 1000, currency: "USD", classification: "business", businessUsePercent: 50, notes: "", receiptId: null } };
  const analysis = analyzeCoach([best, loss, unpaid, missing, income, expense], { vehicleCostCentsPerMile: 50 }, period);
  expect(analysis).toMatchObject({ grossCents: 3400, feesCents: 800, vehicleCents: 1200, netCents: 1400,
    incomeCents: 3000, businessExpenseCents: 500, cashFlowCents: 2500, unpaidMiles: 4, unpaidCostCents: 200 });
  expect(analysis.losses.map(row => row.id)).toEqual([loss.id, unpaid.id]);
  expect(analysis.best[0]).toMatchObject({ id: best.id, netCents: 2000, hourlyCents: 4000, netCentsPerMile: 200, hour: "07:00" });
  expect(analysis.jobs.find(row => row.id === missing.id)?.netCents).toBeUndefined();
  const reply = answerCoach("Where am I losing money and which jobs make the most?", analysis, { vehicleCostCentsPerMile: 50 }, {}, [], null);
  expect(reply.text).toContain("Loss job"); expect(reply.text).toContain("Best job"); expect(reply.text).toContain("$14.00 estimated net");
  expect(reply.text).toContain("3 of 4 completed business drives"); expect(reply.text).toContain("pickup waits and idle time");
  expect(reply.recordIds).toContain(loss.id); expect(reply.recordIds).toContain(best.id);
});
it("keeps missing operating cost unknown and excludes deleted, personal, open and out-of-period drives from job rankings", () => {
  const good = trip(), personal = trip({ classification: "personal" }), open = trip({ endedAt: null }), old = trip({ localDate: "2025-11-06" });
  const deleted = { ...trip(), deleted: true }, unclassified = trip({ classification: "unclassified" });
  const analysis = analyzeCoach([good, personal, open, old, deleted, unclassified], {}, period);
  expect(analysis.jobs).toHaveLength(1); expect(analysis.priced).toHaveLength(0);
  expect(analysis.jobs[0].missing).toContain("your operating cost per mile");
  expect(analysis.incompleteIds).toEqual([open.id]); expect(analysis.unclassifiedIds).toEqual([unclassified.id]);
  expect(answerCoach("Best jobs?", analysis, {}, {}, [], null).text).toContain("cannot rank net profit");
});
it("uses the saved local date/hour and weighted aggregate hourly rates without assuming unknown time zones", () => {
  const early = trip({ startedAt: "2027-01-01T02:00:00Z", endedAt: "2027-01-01T02:30:00Z", localDate: "2026-12-31" });
  const later = trip({ startedAt: "2027-01-01T02:00:00Z", endedAt: "2027-01-01T03:00:00Z", localDate: "2026-12-31", timeZoneId: "invalid-zone" });
  const analysis = analyzeCoach([early, later], { vehicleCostCentsPerMile: 50 }, { from: "2026-12-31", through: "2026-12-31" });
  expect(analysis.jobs.map(row => row.hour)).toEqual(["21:00", "Unknown time zone"]);
  expect(analysis.platforms[0].hourlyCents).toBeCloseTo(4000 / 1.5);
  expect(() => coachPeriod({ from: "2026-11-07", through: "2026-11-06" })).toThrow("ordered");
  expect(() => coachPeriod({ from: "2026-02-31" })).toThrow();
});
it("accepts explicit zero fees and cost while keeping zero-duration hourly and zero-distance per-mile rates unavailable", () => {
  const zero = trip({ endedAt: "2026-11-06T12:00:00Z", distanceMeters: 0, platformFeesCents: 0 });
  const missing = trip({ platformFeesCents: undefined });
  const analysis = analyzeCoach([zero, missing], { vehicleCostCentsPerMile: 0 }, period);
  expect(analysis.jobs[0]).toMatchObject({ grossCents: 3000, feesCents: 0, vehicleCents: 0, netCents: 3000 });
  expect(analysis.jobs[0].hourlyCents).toBeUndefined(); expect(analysis.jobs[0].netCentsPerMile).toBeUndefined();
  expect(analysis.jobs[1].netCents).toBeUndefined(); expect(analysis.priced).toHaveLength(1);
});
it("retains all known job net but withholds grouped and goal hourly rates when a contributing drive has sub-minute duration", () => {
  const short = trip({ endedAt: "2026-11-06T12:00:30Z" }), normal = trip();
  const preferences = { vehicleCostCentsPerMile: 50, targetHourlyCents: 2500 };
  const analysis = analyzeCoach([short, normal], preferences, period);
  for (const group of [analysis.platforms[0], analysis.areas[0], analysis.hours[0]]) {
    expect(group).toMatchObject({ count: 2, pricedCount: 2, isComplete: true, netCents: 4000, minutes: 30.5 });
    expect(group.hourlyCents).toBeUndefined();
  }
  expect(analysis.netCents).toBe(4000);
  const goal = answerCoach("How are my goals progressing?", analysis, preferences, {}, [], null);
  expect(goal.text).toContain("Hourly goal progress is unavailable"); expect(goal.text).not.toContain("priced drives average");
});
it("leaves unpriced daily progress unknown and prevents missing-input or GPS-gap jobs from making a group look complete", () => {
  const unknown = trip({ platformFeesCents: undefined });
  const preferences = { dailyNetCents: 10000 };
  const unpriced = analyzeCoach([unknown], preferences, period);
  const goal = answerCoach("Show my goal progress", unpriced, preferences, {}, [], null);
  expect(goal.text).toContain("Daily goal progress for 2026-11-06 is unavailable");
  expect(goal.text).not.toContain("$0.00 estimated net"); expect(goal.text).not.toContain("remaining");
  const cash = answerCoach("What are my income and costs?", unpriced, preferences, {}, [], null);
  expect(cash.text).toContain("Trip-level estimated net is unavailable");
  const complete = trip(), gap = trip({ hasGaps: true, earningsCents: 500000 });
  const partial = analyzeCoach([complete, unknown, gap], { vehicleCostCentsPerMile: 50 }, period);
  expect(partial.best.map(row => row.id)).toEqual([complete.id]);
  expect(partial.platforms[0]).toMatchObject({ count: 3, pricedCount: 1, isComplete: false, netCents: 2000 });
  expect(partial.platforms[0].hourlyCents).toBeUndefined();
  const partialGoal = answerCoach("Show my goal progress", partial, { vehicleCostCentsPerMile: 50, dailyNetCents: 10000 }, {}, [], null);
  expect(partialGoal.text).toContain("$20.00 known estimated net from 1 of 3 drives");
  expect(partialGoal.text).toContain("Full daily goal progress is unavailable");
});
