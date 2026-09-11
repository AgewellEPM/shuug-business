"use client";

/**
 * Time clock UI — big clock in/out per person (with an optional job), who's on the
 * clock now, the weekly timesheet with hours→pay + overtime, per-employee rate, and
 * a manual-entry fallback. Built for a phone by the back door or a shared terminal.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import type { TimeClockOverview } from "@/lib/timeclock/load";
import type { ActionResult } from "@/app/timeclock/actions";

interface Actions {
  clockInAction: (employeeId: string, job: { id: string; label: string } | null) => Promise<ActionResult>;
  clockOutAction: (employeeId: string, breakMinutes: number) => Promise<ActionResult>;
  addManualAction: (form: { employeeId: string; date: string; startHHMM: string; endHHMM: string; breakMinutes: number; jobId: string | null; jobLabel: string | null }) => Promise<ActionResult>;
  removeEntryAction: (id: string) => Promise<ActionResult>;
  setRateAction: (employeeId: string, dollarsPerHour: number) => Promise<ActionResult>;
}

const elapsed = (since: number) => { const m = Math.max(0, Math.floor((Date.now() - since) / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; };

export function TimeClock({ data, ...actions }: { data: TimeClockOverview } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [jobByEmp, setJobByEmp] = useState<Record<string, string>>({});
  const [manualFor, setManualFor] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult>) => start(async () => { const r = await fn(); setToast(r.ok ? "Saved" : r.error ?? "Failed"); router.refresh(); });
  const jobFromId = (id: string) => { const j = data.jobs.find((x) => x.id === id); return j ? { id: j.id, label: j.label } : null; };

  return (
    <div className="space-y-6">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      {/* Clock in/out grid */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Clock in / out</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.employees.map((e) => (
            <div key={e.id} className={`rounded-2xl border p-4 shadow-sm ${e.onClock ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{e.name}</p>
                  <p className="text-xs text-slate-500">{e.role} · {formatCents(e.hourlyRateCents)}/hr</p>
                </div>
                {e.onClock && <span className="flex-none rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">On clock</span>}
              </div>
              {!e.onClock && data.jobs.length > 0 && (
                <select value={jobByEmp[e.id] ?? ""} onChange={(ev) => setJobByEmp((m) => ({ ...m, [e.id]: ev.target.value }))} className="mt-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">No specific job</option>
                  {data.jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
                </select>
              )}
              <button
                type="button" disabled={pending}
                onClick={() => run(() => e.onClock ? actions.clockOutAction(e.id, 0) : actions.clockInAction(e.id, jobFromId(jobByEmp[e.id] ?? "")))}
                className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 ${e.onClock ? "bg-slate-900 hover:bg-black" : "bg-emerald-600 hover:bg-emerald-700"}`}
              >{e.onClock ? "Clock out" : "Clock in"}</button>
            </div>
          ))}
          {data.employees.length === 0 && <p className="text-sm text-slate-400">Add team members first.</p>}
        </div>
      </section>

      {/* On the clock now */}
      {data.onClock.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
          <h2 className="mb-2 text-sm font-semibold text-emerald-900">On the clock now</h2>
          <ul className="flex flex-wrap gap-2">
            {data.onClock.map((o) => (
              <li key={o.employeeId} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm">
                <span className="font-semibold text-slate-800">{o.name}</span> <span className="text-slate-400">· {elapsed(o.since)}{o.jobLabel ? ` · ${o.jobLabel}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Weekly timesheet */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="p-4 pb-2 text-sm font-semibold text-slate-900">This week&apos;s timesheet</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-4 py-2">Employee</th><th className="px-4 py-2 text-right">Reg</th><th className="px-4 py-2 text-right">OT</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Gross pay</th><th className="px-4 py-2">Jobs</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.summary.rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-2 font-medium text-slate-800">{r.name}{r.onClock && <span className="ml-1 text-emerald-600">•</span>}<span className="block text-[11px] font-normal text-slate-400">{r.role}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.regularHours.toFixed(1)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${r.overtimeHours > 0 ? "font-semibold text-amber-700" : "text-slate-400"}`}>{r.overtimeHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{r.totalHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" step="0.25" defaultValue={(r.hourlyRateCents / 100).toFixed(2)} disabled={pending}
                      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && Math.round(v * 100) !== r.hourlyRateCents) run(() => actions.setRateAction(r.employeeId, v)); }}
                      className="w-20 rounded border border-slate-200 px-1.5 py-1 text-right text-xs" />
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{formatCents(r.grossPayCents)}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-500">{r.jobs.slice(0, 3).map((j) => `${j.jobLabel} (${j.hours.toFixed(1)}h)`).join(", ") || "—"}</td>
                </tr>
              ))}
              {data.summary.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No hours yet this week. Clock someone in above.</td></tr>}
            </tbody>
            {data.summary.rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 font-semibold">
                <tr><td className="px-4 py-2 text-slate-900">Total</td><td /><td /><td className="px-4 py-2 text-right tabular-nums">{data.summary.totalHours.toFixed(1)}</td><td /><td className="px-4 py-2 text-right tabular-nums">{formatCents(data.summary.totalGrossPayCents)}</td><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Manual entry / corrections */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Add or fix a shift</h2>
          <select value={manualFor ?? ""} onChange={(e) => setManualFor(e.target.value || null)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Choose employee…</option>
            {data.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        {manualFor && <ManualEntry employeeId={manualFor} jobs={data.jobs} pending={pending} onSave={(f) => run(() => actions.addManualAction(f))} />}
      </section>
    </div>
  );
}

function ManualEntry({ employeeId, jobs, pending, onSave }: { employeeId: string; jobs: { id: string; label: string }[]; pending: boolean; onSave: (f: { employeeId: string; date: string; startHHMM: string; endHHMM: string; breakMinutes: number; jobId: string | null; jobLabel: string | null }) => void }) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [brk, setBrk] = useState("30");
  const [jobId, setJobId] = useState("");
  const save = () => { if (!date) return; const j = jobs.find((x) => x.id === jobId); onSave({ employeeId, date, startHHMM: start, endHHMM: end, breakMinutes: Number(brk) || 0, jobId: j?.id ?? null, jobLabel: j?.label ?? null }); };
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 text-sm">
      <label className="text-xs">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 block rounded border border-slate-300 px-2 py-1.5" /></label>
      <label className="text-xs">In<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block rounded border border-slate-300 px-2 py-1.5" /></label>
      <label className="text-xs">Out<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-0.5 block rounded border border-slate-300 px-2 py-1.5" /></label>
      <label className="text-xs">Break (min)<input type="number" value={brk} onChange={(e) => setBrk(e.target.value)} className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1.5" /></label>
      {jobs.length > 0 && <label className="text-xs">Job<select value={jobId} onChange={(e) => setJobId(e.target.value)} className="mt-0.5 block rounded border border-slate-300 px-2 py-1.5"><option value="">—</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>}
      <button type="button" disabled={pending || !date} onClick={save} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Add shift</button>
    </div>
  );
}
