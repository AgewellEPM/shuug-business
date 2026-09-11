import { createHash, randomUUID } from "node:crypto";
import { getMember, listTeam } from "../team/store";
import { clockIn, clockOut, timeClockState } from "./store";
import { restaurantState } from "../restaurant/store";
import { emptySchedule, scheduleCommandSchema, shiftInput, versionInput, absenceInput, absenceReviewInput, clockInInput, clockOutInput, correctionInput, overlap, interval, selfScheduleActions, type StaffShift, type ScheduleState } from "./schedule-model";
const entryRevision = (entry: unknown) => createHash("sha256").update(JSON.stringify(entry)).digest("hex");
function must(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function conflicts(state: ScheduleState, shift: StaffShift) {
  if (!shift.employeeId) return;
  must(getMember(shift.employeeId), "Choose an existing team member.");
  must(!state.shifts.some(s => s.id !== shift.id && s.status !== "cancelled" && s.employeeId === shift.employeeId && overlap(s, shift)), "This employee has an overlapping shift.");
  must(!state.absences.some(a => a.employeeId === shift.employeeId && a.status === "approved" && overlap(a, shift)), "This employee has approved time away during the shift.");
}
export function executeScheduleCommand(raw: unknown, actor: { memberId: string; name: string }, manager: boolean) {
  const command = scheduleCommandSchema.parse(raw), hash = createHash("sha256").update(JSON.stringify({ command, actor })).digest("hex");
  must(manager || selfScheduleActions.has(command.action), "Your role cannot manage staff schedules.");
  must(getMember(actor.memberId), "Team member unavailable.");
  return timeClockState.change(t => {
    const s = t.schedule ??= emptySchedule(), prior = s.commands[command.requestId]; if (prior) { must(prior.request === hash, "Request identifier already used for another action."); return prior.result; }
    let id = "", before: unknown; const now = Date.now(), at = new Date(now).toISOString();
    if (command.action === "shift.save") {
      const input = shiftInput.parse(command.input); interval(input.start, input.end, 1, input.breakMinutes);
      const old = s.shifts.find(v => v.id === input.id); must(!input.id || (old && old.revision === input.revision), "Shift changed. Reload before saving.");
      must(!old || (old.status !== "cancelled" && !t.entries.some(e => e.jobId === `shift:${old.id}`)), "An attended or cancelled shift cannot be rewritten.");
      before = old ? structuredClone(old) : undefined;
      const next: StaffShift = { ...input, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1, status: "draft", acknowledgedAt: null }; conflicts(s, next);
      s.shifts = [...s.shifts.filter(v => v.id !== next.id), next]; id = next.id;
    } else if (["shift.publish", "shift.cancel", "shift.acknowledge"].includes(command.action)) {
      const v = versionInput.parse(command.input), shift = s.shifts.find(vv => vv.id === v.id); must(shift && shift.revision === v.revision, "Shift changed. Reload before continuing."); before = structuredClone(shift);
      if (command.action === "shift.publish") { must(shift.status === "draft" && Date.parse(shift.end) > now, "Publish a current or future draft shift."); conflicts(s, shift); shift.status = "published"; }
      else if (command.action === "shift.cancel") { must(shift.status !== "cancelled" && !t.entries.some(e => e.jobId === `shift:${shift.id}`), "An attended shift cannot be cancelled."); shift.status = "cancelled"; }
      else { must(shift.status === "published" && shift.employeeId === actor.memberId, "Only your own published shift can be acknowledged."); shift.acknowledgedAt = at; }
      shift.revision++; id = shift.id;
    } else if (command.action === "absence.request") {
      const v = absenceInput.parse(command.input); interval(v.start, v.end, 90); must(Date.parse(v.end) > now, "Request current or future time away.");
      const existing = s.absences.find(a => a.employeeId === actor.memberId && ["requested", "approved"].includes(a.status) && overlap(a, v)); must(!existing, "An overlapping time-away request already exists.");
      id = randomUUID(); s.absences.push({ ...v, id, revision: 1, employeeId: actor.memberId, status: "requested" });
    } else if (command.action === "absence.review" || command.action === "absence.cancel") {
      const v = command.action === "absence.review" ? absenceReviewInput.parse(command.input) : versionInput.parse(command.input), absence = s.absences.find(a => a.id === v.id);
      must(absence && absence.revision === v.revision, "Time-away request changed."); before = structuredClone(absence);
      if ("status" in v) { const status = absenceReviewInput.parse(command.input).status; must(absence.status === "requested", "Only pending time away can be reviewed."); if (status === "approved") must(!s.shifts.some(shift => shift.status !== "cancelled" && shift.employeeId === absence.employeeId && overlap(shift, absence)), "Reassign or cancel conflicting shifts before approving time away."); absence.status = status; }
      else { must(absence.employeeId === actor.memberId && ["requested", "approved"].includes(absence.status), "Only your own open time-away request can be cancelled."); absence.status = "cancelled"; }
      absence.revision++; id = absence.id;
    } else if (command.action === "clock.in") {
      const v = clockInInput.parse(command.input), shift = s.shifts.find(vv => vv.id === v.shiftId);
      must(shift && shift.status === "published" && shift.employeeId === actor.memberId, "Choose your own published shift.");
      must(now >= Date.parse(shift.start) - 30 * 60000 && now < Date.parse(shift.end), "Clock in from 30 minutes before your shift until its scheduled end. Ask a manager to correct missed time.");
      id = clockIn(actor.memberId, { id: `shift:${shift.id}`, label: `${shift.role} · ${shift.station}` }, now).id;
    } else if (command.action === "clock.out") {
      const v = clockOutInput.parse(command.input); id = clockOut(actor.memberId, v.breakMinutes, now).id;
    } else {
      const v = correctionInput.parse(command.input), entry = t.entries.find(e => e.id === v.id); must(entry, "Attendance entry unavailable."); must(entryRevision(entry) === v.revision, "Attendance changed. Reload before correcting it.");
      interval(v.clockIn, v.clockOut, 2, v.breakMinutes); must(Date.parse(v.clockOut) <= now, "Actual time cannot end in the future.");
      const start = Date.parse(v.clockIn), end = Date.parse(v.clockOut);
      must(!t.entries.some(e => e.id !== entry.id && e.employeeId === entry.employeeId && e.clockInMs < end && (e.clockOutMs ?? Infinity) > start), "Corrected attendance overlaps another time entry.");
      before = structuredClone(entry); Object.assign(entry, { clockInMs: start, clockOutMs: end, breakMinutes: v.breakMinutes, note: v.reason }); id = entry.id;
    }
    s.audit.push({ at, actor: `${actor.name} (${actor.memberId})`, action: command.action, id, ...(before ? { before } : {}) }); const result = { id }; s.commands[command.requestId] = { request: hash, result }; return result;
  });
}
export function scheduleView(memberId?: string, financial = false) {
  const team = listTeam().map(m => ({ id: m.id, name: m.name }));
  const timezone = restaurantState.read().business?.config.timezone ?? "UTC";
  return timeClockState.change(t => {
    const s = t.schedule ??= emptySchedule(), shifts = s.shifts.filter(v => memberId ? v.employeeId === memberId && v.status !== "draft" : true), entries = t.entries.filter(e => memberId ? e.employeeId === memberId : e.jobId?.startsWith("shift:"));
    return { timezone, team: memberId ? team.filter(m => m.id === memberId) : team,
      shifts: shifts.map(shift => { const punches = t.entries.filter(e => e.jobId === `shift:${shift.id}`), scheduledMinutes = (Date.parse(shift.end) - Date.parse(shift.start)) / 60000 - shift.breakMinutes, closed = punches.filter(e => e.clockOutMs !== null), actualMinutes = closed.reduce((total, e) => total + (e.clockOutMs! - e.clockInMs) / 60000 - e.breakMinutes, 0), complete = punches.length > 0 && punches.every(e => e.clockOutMs !== null); return { ...shift, hourlyRate: financial ? shift.hourlyRate : null, scheduledMinutes, actualMinutes, attendanceComplete: complete, onClock: punches.some(e => e.clockOutMs === null), plannedCost: financial && shift.hourlyRate !== null ? Math.round(scheduledMinutes / 60 * shift.hourlyRate) : null, actualCost: financial && complete && shift.hourlyRate !== null ? Math.round(actualMinutes / 60 * shift.hourlyRate) : null }; }),
      entries: entries.map(e => ({ ...e, revision: entryRevision(e) })), absences: s.absences.filter(a => !memberId || a.employeeId === memberId), openEntry: memberId ? t.entries.find(e => e.employeeId === memberId && e.clockOutMs === null) ?? null : null, audit: memberId ? [] : s.audit.slice(-100).reverse() };
  });
}
