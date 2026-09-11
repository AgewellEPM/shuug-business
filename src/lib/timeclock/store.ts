/** Shared transactional time clock. Imports the legacy file once and keeps
 * scheduling, punches and retry receipts in one database transaction. */
import { readFileSync } from "node:fs";
import { persistentState } from "../workspace/state";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { getMember } from "../team/store";
import type { TimeEntry } from "./model";

export interface TimeClockState { entries: TimeEntry[]; rates: Record<string, number>; schedule?: import("./schedule-model").ScheduleState }
export const timeClockState = persistentState<TimeClockState>("timeclock", () => {
  try {
    const value = JSON.parse(readFileSync(path.join(dataDirectory(), "timeclock.json"), "utf8"));
    if (!value || !Array.isArray(value.entries) || value.entries.some((e: TimeEntry) => !e.id || !e.employeeId || !Number.isFinite(e.clockInMs) || (e.clockOutMs !== null && !Number.isFinite(e.clockOutMs)))) throw new Error("Invalid entries");
    return { entries: value.entries, rates: value.rates ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Existing time clock data could not be imported. Repair or restore it first; the original file has not been replaced.");
    return { entries: [], rates: {} };
  }
});
const state = () => timeClockState.read();
function finiteTime(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new Error("Choose a valid time."); }
function validBreak(value: number, start: number, end: number) { if (!Number.isInteger(value) || value < 0 || value * 60000 > end - start) throw new Error("Break duration exceeds the recorded time."); }
function noOverlap(s: TimeClockState, employeeId: string, start: number, end: number, ignore?: string) { if (s.entries.some(e => e.id !== ignore && e.employeeId === employeeId && e.clockInMs < end && (e.clockOutMs ?? Infinity) > start)) throw new Error("This employee already has time recorded in that interval."); }

export function listEntries(sinceMs = 0): TimeEntry[] {
  return state().entries.filter((e) => (e.clockOutMs ?? e.clockInMs) >= sinceMs || e.clockOutMs === null).map((e) => ({ ...e }));
}
export function openEntryFor(employeeId: string): TimeEntry | null {
  return state().entries.find((e) => e.employeeId === employeeId && e.clockOutMs === null) ?? null;
}
export function ratesMap(): Record<string, number> {
  return { ...state().rates };
}

export function clockIn(employeeId: string, job?: { id: string; label: string } | null, nowMs = Date.now()): TimeEntry {
  finiteTime(nowMs); if (!getMember(employeeId)) throw new Error("Team member unavailable.");
  return timeClockState.change(s => {
    if (s.entries.some(e => e.employeeId === employeeId && e.clockOutMs === null)) throw new Error("Already clocked in — clock out first.");
    noOverlap(s, employeeId, nowMs, Infinity);
    const entry: TimeEntry = { id: randomUUID(), employeeId, clockInMs: nowMs, clockOutMs: null, breakMinutes: 0, jobId: job?.id ?? null, jobLabel: job?.label ?? null, note: "" };
    s.entries.push(entry); return entry;
  });
}
export function clockOut(employeeId: string, breakMinutes = 0, nowMs = Date.now()): TimeEntry {
  finiteTime(nowMs);
  return timeClockState.change(s => {
    const open = s.entries.find(e => e.employeeId === employeeId && e.clockOutMs === null); if (!open) throw new Error("Not clocked in.");
    if (nowMs <= open.clockInMs) throw new Error("Clock-out must be after clock-in."); validBreak(breakMinutes, open.clockInMs, nowMs); noOverlap(s, employeeId, open.clockInMs, nowMs, open.id);
    Object.assign(open, { clockOutMs: nowMs, breakMinutes }); return open;
  });
}
export interface ManualEntry { employeeId: string; clockInMs: number; clockOutMs: number; breakMinutes?: number; jobId?: string | null; jobLabel?: string | null; note?: string }
export function addManualEntry(input: ManualEntry): TimeEntry {
  if (!getMember(input.employeeId)) throw new Error("Team member unavailable.");
  finiteTime(input.clockInMs); finiteTime(input.clockOutMs); if (input.clockOutMs <= input.clockInMs) throw new Error("Clock-out must be after clock-in."); validBreak(input.breakMinutes ?? 0, input.clockInMs, input.clockOutMs);
  return timeClockState.change(s => {
    noOverlap(s, input.employeeId, input.clockInMs, input.clockOutMs);
    const entry: TimeEntry = { id: randomUUID(), employeeId: input.employeeId, clockInMs: input.clockInMs, clockOutMs: input.clockOutMs, breakMinutes: input.breakMinutes ?? 0, jobId: input.jobId ?? null, jobLabel: input.jobLabel ?? null, note: (input.note ?? "").slice(0, 300) };
    s.entries.push(entry); return entry;
  });
}
export function removeEntry(id: string): void {
  timeClockState.change(s => { if (s.entries.find(e => e.id === id)?.jobId?.startsWith("shift:")) throw new Error("Scheduled attendance must retain its audit record. Use a reviewed correction from staff scheduling."); s.entries = s.entries.filter(e => e.id !== id); });
}
export function setRate(employeeId: string, centsPerHour: number): void {
  if (!getMember(employeeId)) throw new Error("Team member unavailable.");
  if (!Number.isInteger(centsPerHour) || centsPerHour < 0 || centsPerHour > 999999) throw new Error("Enter a valid hourly rate.");
  timeClockState.change(s => { s.rates[employeeId] = centsPerHour; });
}
