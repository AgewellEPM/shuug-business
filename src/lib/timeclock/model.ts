/**
 * Time clock + timesheets (blue-collar and salaried alike). Employees clock in and
 * out against an optional job/board card; hours roll up per week with overtime, and
 * convert to gross pay. Pure + cents-only; the store holds the punches, the loader
 * supplies names + rates. Overtime = hours over 40 in the week, paid at 1.5×.
 */
export const OT_THRESHOLD_HOURS = 40;
export const OT_MULTIPLIER = 1.5;
const HOUR_MS = 3_600_000;

export interface TimeEntry {
  id: string;
  employeeId: string;
  /** open shift while clockOutMs is null. */
  clockInMs: number;
  clockOutMs: number | null;
  breakMinutes: number;
  /** optional link to a job / kanban card / tracker record. */
  jobId: string | null;
  jobLabel: string | null;
  note: string;
}

/** Worked hours for one entry (open shifts count up to `nowMs`), never negative. */
export function entryHours(entry: TimeEntry, nowMs: number): number {
  const end = entry.clockOutMs ?? nowMs;
  const raw = (end - entry.clockInMs) / HOUR_MS - entry.breakMinutes / 60;
  return Math.max(0, Math.round(raw * 100) / 100);
}

export interface JobHours { jobId: string; jobLabel: string; hours: number }

export interface TimesheetRow {
  employeeId: string;
  name: string;
  role: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRateCents: number;
  regularPayCents: number;
  overtimePayCents: number;
  grossPayCents: number;
  onClock: boolean;
  entryCount: number;
  jobs: JobHours[];
}

export interface TimesheetSummary {
  rows: TimesheetRow[];
  totalHours: number;
  totalGrossPayCents: number;
  onClockCount: number;
}

export interface EmployeeMeta { name: string; role: string; hourlyRateCents: number }

/**
 * Roll a pay period's entries into per-employee rows with OT + gross pay. Caller
 * passes the entries for the period (e.g. one week) and a lookup of name/role/rate.
 */
export function summarizeTimesheet(
  entries: TimeEntry[],
  meta: (employeeId: string) => EmployeeMeta,
  nowMs: number,
): TimesheetSummary {
  const byEmp = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, []);
    byEmp.get(e.employeeId)!.push(e);
  }

  const rows: TimesheetRow[] = [];
  for (const [employeeId, list] of byEmp) {
    const m = meta(employeeId);
    const totalHours = round2(list.reduce((n, e) => n + entryHours(e, nowMs), 0));
    const regularHours = Math.min(totalHours, OT_THRESHOLD_HOURS);
    const overtimeHours = round2(Math.max(0, totalHours - OT_THRESHOLD_HOURS));
    const regularPayCents = Math.round(regularHours * m.hourlyRateCents);
    const overtimePayCents = Math.round(overtimeHours * m.hourlyRateCents * OT_MULTIPLIER);

    const jobMap = new Map<string, JobHours>();
    for (const e of list) {
      if (!e.jobId) continue;
      const j = jobMap.get(e.jobId) ?? { jobId: e.jobId, jobLabel: e.jobLabel ?? e.jobId, hours: 0 };
      j.hours = round2(j.hours + entryHours(e, nowMs));
      jobMap.set(e.jobId, j);
    }

    rows.push({
      employeeId, name: m.name, role: m.role,
      totalHours, regularHours, overtimeHours, hourlyRateCents: m.hourlyRateCents,
      regularPayCents, overtimePayCents, grossPayCents: regularPayCents + overtimePayCents,
      onClock: list.some((e) => e.clockOutMs === null),
      entryCount: list.length,
      jobs: [...jobMap.values()].sort((a, b) => b.hours - a.hours),
    });
  }

  rows.sort((a, b) => Number(b.onClock) - Number(a.onClock) || b.totalHours - a.totalHours);
  return {
    rows,
    totalHours: round2(rows.reduce((n, r) => n + r.totalHours, 0)),
    totalGrossPayCents: rows.reduce((n, r) => n + r.grossPayCents, 0),
    onClockCount: rows.filter((r) => r.onClock).length,
  };
}

/** Salaried fallback: annual salary → an hourly rate over a standard 2,080-hour year. */
export function hourlyFromSalary(salaryCents: number): number {
  return Math.round(salaryCents / 2080);
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
