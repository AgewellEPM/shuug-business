// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { addMember } from "../team/store";
import { clockIn, clockOut, listEntries, removeEntry } from "./store";
import { executeScheduleCommand, scheduleView } from "./schedule";
import { instantForLocal, localDateTime } from "./zoned-time";
let directory: string, employee: { memberId: string; name: string }, other: { memberId: string; name: string };
const manager = { memberId: "owner", name: "Owner" };
const run = (action: string, input: unknown, actor = manager, requestId: string = randomUUID()) => executeScheduleCommand({ action, input, requestId }, actor, actor === manager);
beforeEach(() => { directory = mkdtempSync(`${tmpdir()}/shuug-schedule-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DEMO_DATA", "false"); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T12:00:00Z")); employee = { memberId: addMember({ name: "Kitchen employee", email: "kitchen@example.test", role: "Employee" }).id, name: "Kitchen employee" }; other = { memberId: addMember({ name: "Other employee", email: "other@example.test", role: "Employee" }).id, name: "Other employee" }; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
function shift(overrides = {}) { return run("shift.save", { employeeId: employee.memberId, role: "Cook", station: "Line", start: "2026-09-21T12:00:00Z", end: "2026-09-21T20:00:00Z", breakMinutes: 30, hourlyRate: 2000, note: "Open prep station", ...overrides }).id; }
const find = (id: string) => scheduleView(undefined, true).shifts.find(s => s.id === id)!;
it("publishes an assigned shift to only its employee and captures real attendance with retry protection", () => {
  const id = shift(); expect(scheduleView(employee.memberId).shifts).toHaveLength(0); run("shift.publish", { id, revision: 1 }); expect(scheduleView(employee.memberId).shifts).toHaveLength(1); expect(scheduleView(other.memberId).shifts).toHaveLength(0); expect(scheduleView(employee.memberId).shifts[0].hourlyRate).toBeNull();
  run("shift.acknowledge", { id, revision: 2 }, employee); const requestId = randomUUID(); run("clock.in", { shiftId: id }, employee, requestId); run("clock.in", { shiftId: id }, employee, requestId); expect(listEntries()).toHaveLength(1);
  vi.setSystemTime(new Date("2026-09-21T20:00:00Z")); run("clock.out", { breakMinutes: 30 }, employee);
  expect(find(id)).toMatchObject({ scheduledMinutes: 450, actualMinutes: 450, plannedCost: 15000, actualCost: 15000, attendanceComplete: true }); expect(listEntries()[0].jobId).toBe(`shift:${id}`);
  expect(() => removeEntry(listEntries()[0].id)).toThrow("audit record");
});
it("rejects cross-employee clock actions and forged manager commands", () => {
  const id = shift(); run("shift.publish", { id, revision: 1 }); expect(() => run("clock.in", { shiftId: id }, other)).toThrow("your own"); expect(() => run("shift.acknowledge", { id, revision: 2 }, other)).toThrow("your own"); expect(() => run("shift.cancel", { id, revision: 2 }, employee)).toThrow("role");
  expect(() => run("clock.in", { shiftId: id, employeeId: other.memberId }, employee)).toThrow(); expect(scheduleView(other.memberId).entries).toHaveLength(0);
});
it("checks overlapping assignments, stale revisions and republishing changed schedules", () => {
  const id = shift(); expect(() => shift()).toThrow("overlapping"); run("shift.publish", { id, revision: 1 });
  const current = find(id); const edited = { id, revision: current.revision, employeeId: current.employeeId, role: current.role, station: "Prep", start: current.start, end: current.end, breakMinutes: 30, hourlyRate: 2000, note: "Changed station" };
  run("shift.save", edited); expect(scheduleView(employee.memberId).shifts).toHaveLength(0); expect(() => run("shift.save", edited)).toThrow("changed"); run("shift.publish", { id, revision: 3 }); expect(find(id).station).toBe("Prep");
  expect(() => shift({ id: randomUUID() })).toThrow("changed");
});
it("requires conflicts to be resolved before approving time away, then blocks reassignment into that absence", () => {
  const id = shift(), absenceId = run("absence.request", { start: "2026-09-21T11:00:00Z", end: "2026-09-21T21:00:00Z", reason: "Unavailable for this day" }, employee).id;
  expect(() => run("absence.review", { id: absenceId, revision: 1, status: "approved" })).toThrow("Reassign"); run("shift.cancel", { id, revision: 1 }); run("absence.review", { id: absenceId, revision: 1, status: "approved" }); expect(() => shift()).toThrow("approved time away"); expect(scheduleView(other.memberId).absences).toHaveLength(0);
  expect(() => run("absence.cancel", { id: absenceId, revision: 2 }, other)).toThrow("your own"); run("absence.cancel", { id: absenceId, revision: 2 }, employee); expect(shift()).toBeTruthy();
});
it("retains original attendance when reviewed corrections are made and rejects stale corrections", () => {
  const id = shift(); run("shift.publish", { id, revision: 1 }); run("clock.in", { shiftId: id }, employee); vi.setSystemTime(new Date("2026-09-21T20:00:00Z")); run("clock.out", { breakMinutes: 30 }, employee);
  const entry = scheduleView().entries[0], correction = { id: entry.id, revision: entry.revision, clockIn: "2026-09-21T12:15:00Z", clockOut: "2026-09-21T19:45:00Z", breakMinutes: 30, reason: "Reviewed employee signed time record" }; run("attendance.correct", correction); expect(find(id).actualMinutes).toBe(420); expect(scheduleView().audit[0].before).toMatchObject({ clockInMs: Date.parse("2026-09-21T12:00:00Z"), clockOutMs: Date.parse("2026-09-21T20:00:00Z") }); expect(() => run("attendance.correct", correction)).toThrow("changed");
  expect(() => run("shift.cancel", { id, revision: 2 })).toThrow("attended");
});
it("keeps missing rates unknown and rejects impossible punches and excessive breaks", () => {
  const id = shift({ hourlyRate: null }); run("shift.publish", { id, revision: 1 }); vi.setSystemTime(new Date("2026-09-21T10:00:00Z")); expect(() => run("clock.in", { shiftId: id }, employee)).toThrow("30 minutes"); vi.setSystemTime(new Date("2026-09-21T12:00:00Z")); run("clock.in", { shiftId: id }, employee); expect(() => clockIn(employee.memberId)).toThrow("Already"); vi.setSystemTime(new Date("2026-09-21T13:00:00Z")); expect(() => clockOut(employee.memberId, 61)).toThrow("Break"); run("clock.out", { breakMinutes: 0 }, employee); expect(find(id).actualCost).toBeNull();
});
it("imports legacy punches once and fails closed on malformed originals", () => {
  writeFileSync(`${directory}/timeclock.json`, "{malformed"); expect(() => listEntries()).toThrow("could not be imported");
  writeFileSync(`${directory}/timeclock.json`, JSON.stringify({ entries: [{ id: "legacy", employeeId: employee.memberId, clockInMs: 1, clockOutMs: 2, breakMinutes: 0, jobId: null, jobLabel: null, note: "" }], rates: {} })); expect(listEntries()[0].id).toBe("legacy"); writeFileSync(`${directory}/timeclock.json`, "{malformed"); expect(listEntries()[0].id).toBe("legacy");
});
it("converts workspace times independently of host timezone and rejects spring DST gaps", () => {
  expect(instantForLocal("2026-09-21T08:00", "America/New_York")).toBe("2026-09-21T12:00:00.000Z"); expect(localDateTime("2026-09-21T12:00:00Z", "America/New_York")).toBe("2026-09-21T08:00");
  expect(() => instantForLocal("2026-03-08T02:30", "America/New_York")).toThrow("does not exist"); expect(instantForLocal("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z"); expect(() => instantForLocal("2026-02-30T08:00", "UTC")).toThrow("calendar");
});
