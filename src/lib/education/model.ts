/**
 * Childcare & education core. The safety-critical piece a daycare runs on is the
 * staff-to-child RATIO — how many carers must be present for the children who are
 * checked in, by age. This engine computes required staff, ratio compliance, live
 * "who's here", and attendance hours. Pure + fully tested. Dates are YYYY-MM-DD.
 */

export type AgeGroup = "infant" | "toddler" | "preschool" | "school-age";

/** Typical U.S. licensing max children-per-staff by age (sensible defaults; configurable). */
export const DEFAULT_RATIOS: Record<AgeGroup, number> = { infant: 4, toddler: 6, preschool: 10, "school-age": 15 };

export const AGE_GROUP_LABEL: Record<AgeGroup, string> = { infant: "Infant (0–1)", toddler: "Toddler (1–3)", preschool: "Preschool (3–5)", "school-age": "School-age (5+)" };

/** Age group from date of birth on a reference date. */
export function ageGroupFor(dobISO: string, onISO: string): AgeGroup {
  const years = ageYears(dobISO, onISO);
  if (years < 1) return "infant";
  if (years < 3) return "toddler";
  if (years < 5) return "preschool";
  return "school-age";
}

export function ageYears(dobISO: string, onISO: string): number {
  const dob = new Date(`${dobISO}T00:00:00Z`), on = new Date(`${onISO}T00:00:00Z`);
  let y = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) y--;
  return Math.max(0, y);
}

/** Required staff = sum over age groups of ceil(children in group ÷ that group's max ratio). */
export function requiredStaff(presentByGroup: Partial<Record<AgeGroup, number>>, ratios: Record<AgeGroup, number> = DEFAULT_RATIOS): number {
  let staff = 0;
  for (const group of Object.keys(DEFAULT_RATIOS) as AgeGroup[]) {
    const n = presentByGroup[group] ?? 0;
    if (n > 0) staff += Math.ceil(n / ratios[group]);
  }
  return staff;
}

export interface RatioStatus {
  childrenPresent: number;
  staffPresent: number;
  requiredStaff: number;
  compliant: boolean;
  shortfall: number;   // extra staff needed (0 when compliant)
  byGroup: { group: AgeGroup; present: number; ratio: number; requiredForGroup: number }[];
}

export function ratioStatus(presentByGroup: Partial<Record<AgeGroup, number>>, staffPresent: number, ratios: Record<AgeGroup, number> = DEFAULT_RATIOS): RatioStatus {
  const required = requiredStaff(presentByGroup, ratios);
  const childrenPresent = (Object.values(presentByGroup) as number[]).reduce((a, b) => a + (b ?? 0), 0);
  return {
    childrenPresent, staffPresent, requiredStaff: required,
    compliant: staffPresent >= required,
    shortfall: Math.max(0, required - staffPresent),
    byGroup: (Object.keys(DEFAULT_RATIOS) as AgeGroup[])
      .filter((g) => (presentByGroup[g] ?? 0) > 0)
      .map((group) => ({ group, present: presentByGroup[group] ?? 0, ratio: ratios[group], requiredForGroup: Math.ceil((presentByGroup[group] ?? 0) / ratios[group]) })),
  };
}

// ---- Attendance ----
export interface AttendanceRecord {
  id: string;
  studentId: string;
  dateISO: string;
  checkInMs: number;
  checkOutMs: number | null;
  checkedInBy: string;   // guardian / staff who dropped off
  checkedOutBy: string;  // who picked up (authorized)
}

const HOUR_MS = 3_600_000;
export function attendanceHours(rec: AttendanceRecord, nowMs: number): number {
  const end = rec.checkOutMs ?? nowMs;
  return Math.max(0, Math.round(((end - rec.checkInMs) / HOUR_MS) * 100) / 100);
}

/** Currently checked in (no check-out) for a date. */
export function presentRecords(records: AttendanceRecord[], dateISO: string): AttendanceRecord[] {
  return records.filter((r) => r.dateISO === dateISO && r.checkOutMs === null);
}
