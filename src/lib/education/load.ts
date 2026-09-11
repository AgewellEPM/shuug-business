/**
 * Assemble the childcare/education view: today's attendance and the live ratio (staff
 * present comes from the time clock — carers who are clocked in), the roster, and
 * classes with enrollment counts. Staff-present is read defensively so the ratio still
 * shows if the time clock is empty (it just reports 0 staff / needs attention).
 */
import { listStudents, listClasses, listEnrollments, listAttendance, type Student, type EdClass } from "./store";
import { ageGroupFor, ratioStatus, presentRecords, attendanceHours, type AgeGroup, type RatioStatus, type AttendanceRecord } from "./model";
import { buildTuitionRun, currentBillingMonth, tuitionRunTotalCents, type TuitionInvoiceDraft } from "./billing";
import { listTuition, tuitionSummary, type TuitionInvoice, type TuitionSummary } from "./tuition-store";
import { loadTimeClock } from "../timeclock/load";

export interface PresentChild { record: AttendanceRecord; name: string; ageGroup: AgeGroup | null; hours: number }
export interface ClassCard { cls: EdClass; enrolled: number; students: { id: string; name: string }[] }

export interface Billing {
  month: string;
  monthlyRecurringCents: number;   // total tuition if everyone were billed this month
  draftPreview: TuitionInvoiceDraft[];
  invoices: TuitionInvoice[];
  summary: TuitionSummary;
}

export interface EducationOverview {
  dateISO: string;
  students: Student[];
  classes: ClassCard[];
  present: PresentChild[];
  notHereYet: { id: string; name: string }[];
  ratio: RatioStatus;
  staffPresent: number;
  billing: Billing;
}

function staffOnClock(): number {
  // Carers clocked in = staff present for ratio. Guarded so childcare never depends on it.
  try { return loadTimeClock().summary.onClockCount; } catch { return 0; }
}

export function loadEducation(nowMs = Date.now(), staffOverride?: number): EducationOverview {
  const dateISO = new Date(nowMs).toISOString().slice(0, 10);
  const students = listStudents();
  const byId = new Map(students.map((s) => [s.id, s]));
  const attendance = listAttendance();
  const enrollments = listEnrollments();

  const presentRecs = presentRecords(attendance, dateISO);
  const presentIds = new Set(presentRecs.map((r) => r.studentId));

  const present: PresentChild[] = presentRecs.map((record) => {
    const s = byId.get(record.studentId);
    return { record, name: s?.name ?? record.studentId, ageGroup: s?.dobISO ? ageGroupFor(s.dobISO, dateISO) : null, hours: attendanceHours(record, nowMs) };
  });

  const presentByGroup: Partial<Record<AgeGroup, number>> = {};
  for (const p of present) if (p.ageGroup) presentByGroup[p.ageGroup] = (presentByGroup[p.ageGroup] ?? 0) + 1;

  const staffPresent = staffOverride ?? staffOnClock();

  const classes: ClassCard[] = listClasses().map((cls) => {
    const enrolled = enrollments.filter((e) => e.classId === cls.id);
    return { cls, enrolled: enrolled.length, students: enrolled.map((e) => ({ id: e.studentId, name: byId.get(e.studentId)?.name ?? e.studentId })) };
  });

  const month = currentBillingMonth(nowMs);
  const draftPreview = buildTuitionRun(students, listClasses(), enrollments);

  return {
    dateISO, students, classes, present,
    notHereYet: students.filter((s) => !presentIds.has(s.id)).map((s) => ({ id: s.id, name: s.name })),
    ratio: ratioStatus(presentByGroup, staffPresent),
    staffPresent,
    billing: {
      month,
      monthlyRecurringCents: tuitionRunTotalCents(draftPreview),
      draftPreview,
      invoices: listTuition(month),
      summary: tuitionSummary(month),
    },
  };
}
