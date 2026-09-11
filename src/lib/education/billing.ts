/**
 * Tuition billing — turn class enrollments into a monthly invoice run. Each enrolled
 * class contributes its fee (priceCents) as a line; a student's monthly tuition is the
 * sum of the classes they're in. Pure: given students, classes and enrollments, produce
 * the run for a month. The store records generated invoices so a month is never
 * double-billed. Cents-only.
 */
import type { Student, EdClass, Enrollment } from "./store";

export interface TuitionLine { classId: string; className: string; amountCents: number }
export interface TuitionInvoiceDraft {
  studentId: string;
  studentName: string;
  lines: TuitionLine[];
  totalCents: number;
}

/** Build the tuition draft for every enrolled student (skips students with $0 total). */
export function buildTuitionRun(students: Student[], classes: EdClass[], enrollments: Enrollment[]): TuitionInvoiceDraft[] {
  const classById = new Map(classes.map((c) => [c.id, c]));
  const byStudent = new Map<string, TuitionLine[]>();

  for (const e of enrollments) {
    const cls = classById.get(e.classId);
    if (!cls || cls.priceCents <= 0) continue;
    const lines = byStudent.get(e.studentId) ?? [];
    lines.push({ classId: cls.id, className: cls.name, amountCents: cls.priceCents });
    byStudent.set(e.studentId, lines);
  }

  const nameById = new Map(students.map((s) => [s.id, s.name]));
  const drafts: TuitionInvoiceDraft[] = [];
  for (const [studentId, lines] of byStudent) {
    const totalCents = lines.reduce((n, l) => n + l.amountCents, 0);
    if (totalCents <= 0) continue;
    drafts.push({ studentId, studentName: nameById.get(studentId) ?? studentId, lines, totalCents });
  }
  return drafts.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

export function tuitionRunTotalCents(drafts: TuitionInvoiceDraft[]): number {
  return drafts.reduce((n, d) => n + d.totalCents, 0);
}

/** Validate a billing month (YYYY-MM). */
export function isBillingMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function currentBillingMonth(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}
