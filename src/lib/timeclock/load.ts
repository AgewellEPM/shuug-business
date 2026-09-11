/**
 * Assemble the current week's timesheet: punches from the store, names/roles/rates
 * from the team (hourly override, else derived from salary, else a default wage),
 * plus the list of jobs employees can clock against (kanban tasks + sales jobs).
 */
import { listTeam } from "../team/store";
import { setting } from "../connections/vault";
import { listTasks } from "../tasks/store";
import { listDeals } from "../pipeline/store";
import { listEntries, openEntryFor, ratesMap } from "./store";
import { summarizeTimesheet, hourlyFromSalary, type EmployeeMeta, type TimesheetSummary, type TimeEntry } from "./model";

const DEFAULT_WAGE_CENTS = 1500; // $15/hr floor when nothing else is known

export interface JobOption { id: string; label: string }
export interface OnClock { employeeId: string; name: string; since: number; jobLabel: string | null }

export interface TimeClockOverview {
  summary: TimesheetSummary;
  weekStartMs: number;
  entries: TimeEntry[];
  employees: { id: string; name: string; role: string; onClock: boolean; hourlyRateCents: number }[];
  onClock: OnClock[];
  jobs: JobOption[];
}

/** Monday 00:00 (local-ish, UTC-based) of the week containing nowMs. */
export function weekStart(nowMs: number): number {
  const d = new Date(nowMs);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export function metaLookup(): (employeeId: string) => EmployeeMeta {
  const team = listTeam();
  const rates = ratesMap();
  const byId = new Map(team.map((m) => [m.id, m]));
  return (employeeId: string): EmployeeMeta => {
    const m = byId.get(employeeId);
    const rate = rates[employeeId] ?? (m?.salaryCents ? hourlyFromSalary(m.salaryCents) : Number(setting("TIMECLOCK_DEFAULT_WAGE_CENTS")) || DEFAULT_WAGE_CENTS);
    return { name: m?.name ?? employeeId, role: m?.role ?? "—", hourlyRateCents: rate };
  };
}

export function loadTimeClock(nowMs = Date.now()): TimeClockOverview {
  const ws = weekStart(nowMs);
  const all = listEntries();
  const weekEntries = all.filter((e) => (e.clockOutMs ?? e.clockInMs) >= ws || e.clockOutMs === null);
  const meta = metaLookup();
  const summary = summarizeTimesheet(weekEntries, meta, nowMs);

  const team = listTeam();
  const employees = team.map((m) => ({
    id: m.id, name: m.name, role: m.role, onClock: openEntryFor(m.id) !== null, hourlyRateCents: meta(m.id).hourlyRateCents,
  }));
  const onClock: OnClock[] = team
    .map((m) => { const o = openEntryFor(m.id); return o ? { employeeId: m.id, name: m.name, since: o.clockInMs, jobLabel: o.jobLabel } : null; })
    .filter((x): x is OnClock => x !== null);

  return { summary, weekStartMs: ws, entries: weekEntries, employees, onClock, jobs: jobOptions() };
}

/** Jobs to clock against: kanban tasks + open sales jobs. Guarded — a missing source just contributes none. */
function jobOptions(): JobOption[] {
  const jobs: JobOption[] = [];
  try { for (const t of listTasks()) jobs.push({ id: `task:${t.id}`, label: t.title }); } catch { /* no tasks */ }
  try { for (const d of listDeals()) jobs.push({ id: `deal:${d.id}`, label: d.title || d.company || d.id }); } catch { /* no pipeline */ }
  return jobs.slice(0, 200);
}
