import { z } from "zod";
export interface StaffShift { id: string; revision: number; employeeId: string | null; role: string; station: string; start: string; end: string; breakMinutes: number; hourlyRate: number | null; note: string; status: "draft" | "published" | "cancelled"; acknowledgedAt: string | null }
export interface StaffAbsence { id: string; revision: number; employeeId: string; start: string; end: string; reason: string; status: "requested" | "approved" | "declined" | "cancelled" }
export interface ScheduleState { shifts: StaffShift[]; absences: StaffAbsence[]; audit: { at: string; actor: string; action: string; id: string; before?: unknown }[]; commands: Record<string, { request: string; result: { id: string } }> }
export const emptySchedule = (): ScheduleState => ({ shifts: [], absences: [], audit: [], commands: {} });
const id = z.uuid(), version = { id, revision: z.number().int().positive() }, instant = z.iso.datetime({ offset: true });
export const scheduleCommandSchema = z.object({ requestId: id, action: z.enum(["shift.save", "shift.publish", "shift.cancel", "shift.acknowledge", "absence.request", "absence.review", "absence.cancel", "clock.in", "clock.out", "attendance.correct"]), input: z.record(z.string(), z.unknown()) }).strict();
export const shiftInput = z.object({ id: id.optional(), revision: z.number().int().positive().optional(), employeeId: z.string().min(1).max(100).nullable(), role: z.string().trim().min(1).max(80), station: z.string().trim().min(1).max(80), start: instant, end: instant, breakMinutes: z.number().int().min(0).max(600), hourlyRate: z.number().int().min(0).max(999999).nullable(), note: z.string().trim().max(1000) }).strict();
export const versionInput = z.object(version).strict();
export const absenceInput = z.object({ start: instant, end: instant, reason: z.string().trim().min(3).max(500) }).strict();
export const absenceReviewInput = z.object({ ...version, status: z.enum(["approved", "declined"]) }).strict();
export const clockInInput = z.object({ shiftId: id }).strict();
export const clockOutInput = z.object({ breakMinutes: z.number().int().min(0).max(600) }).strict();
export const correctionInput = z.object({ id, revision: z.string().regex(/^[a-f0-9]{64}$/), clockIn: instant, clockOut: instant, breakMinutes: z.number().int().min(0).max(600), reason: z.string().trim().min(10).max(1000) }).strict();
export const selfScheduleActions = new Set(["shift.acknowledge", "absence.request", "absence.cancel", "clock.in", "clock.out"]);
export function scheduleCommandCatalog() {
  const schemas = { "shift.save": shiftInput, "shift.publish": versionInput, "shift.cancel": versionInput, "shift.acknowledge": versionInput, "absence.request": absenceInput, "absence.review": absenceReviewInput, "absence.cancel": versionInput, "clock.in": clockInInput, "clock.out": clockOutInput, "attendance.correct": correctionInput };
  return Object.entries(schemas).map(([action, schema]) => ({ action, inputSchema: z.toJSONSchema(schema), authority: selfScheduleActions.has(action) ? "Authenticated employee's own records" : "Team editing permission" }));
}
export function overlap(a: { start: string; end: string }, b: { start: string; end: string }) { return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end); }
export function interval(start: string, end: string, maxDays: number, breakMinutes = 0) { const ms = Date.parse(end) - Date.parse(start); if (ms <= 0 || ms > maxDays * 86400000 || breakMinutes * 60000 >= ms) throw new Error("Choose an end after the start and a break shorter than the shift."); }
