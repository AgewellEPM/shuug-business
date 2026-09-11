import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadWorkStatus } from "@/lib/worktrack/load";
import type { WorkState } from "@/lib/worktrack/engine";

export const dynamic = "force-dynamic";

const STATE: Record<WorkState, { label: string; badge: string; bar: string }> = {
  "on-track": { label: "On track", badge: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  behind: { label: "Behind", badge: "bg-amber-100 text-amber-900", bar: "bg-amber-500" },
  "at-risk": { label: "At risk", badge: "bg-orange-100 text-orange-900", bar: "bg-orange-500" },
  stalled: { label: "Stalled", badge: "bg-red-100 text-red-800", bar: "bg-red-500" },
  idle: { label: "Idle", badge: "bg-slate-200 text-slate-600", bar: "bg-slate-400" },
};
const ORDER: WorkState[] = ["stalled", "idle", "at-risk", "behind", "on-track"];

export default async function WorkTrackPage() {
  await requireSectionAccess("team", "edit");

  const { statuses, counts } = loadWorkStatus();
  const cards = [...statuses].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || b.pointsLast7 - a.pointsLast7);

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Remote work — judged on results, not surveillance</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Work &amp; goals</h1>
        <p className="mt-2 text-sm text-slate-500">
          Who’s hitting their goals, whether jobs are taking about as long as estimated, and — when someone’s
          behind — why, and how to help. Output-based, so remote and in-office are measured the same way.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ORDER.slice().reverse().map((s) => (
          <div key={s} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400">{STATE[s].label}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{counts[s]}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((s) => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500">{s.role}</p>
              </div>
              <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATE[s.state].badge}`}>{STATE[s.state].label}</span>
            </div>

            {/* Weekly goal progress */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Weekly goal</span>
                <span className="tabular-nums">{s.pointsLast7}/{s.weeklyTargetPoints} pts · {s.goalAttainmentPct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${STATE[s.state].bar}`} style={{ width: `${Math.min(100, s.goalAttainmentPct)}%` }} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <Mini label="Active" value={String(s.activeTasks)} />
              <Mini label="Overdue" value={String(s.overdueTasks)} tone={s.overdueTasks > 0 ? "text-red-600" : undefined} />
              <Mini label="Pace vs est." value={s.efficiency === null ? "—" : `${s.efficiency}×`} tone={s.efficiency !== null && s.efficiency < 0.7 ? "text-red-600" : s.efficiency !== null && s.efficiency >= 1 ? "text-emerald-600" : undefined} />
            </div>
            {s.avgCycleHours !== null && (
              <p className="mt-2 text-[11px] text-slate-400">Avg job {s.avgCycleHours}h vs ~{s.expectedCycleHours}h estimated{s.daysSinceActivity !== null && ` · last done ${s.daysSinceActivity}d ago`}</p>
            )}

            {s.reasons.length > 0 && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.state === "on-track" ? "Status" : "Why"}</p>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{s.reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
                {s.state !== "on-track" && (
                  <>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">How to help</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-emerald-800">{s.help.map((r, i) => <li key={i}>→ {r}</li>)}</ul>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Estimates come from story points × hours/point (set WORK_HOURS_PER_POINT / WORK_WEEKLY_HOURS). This measures
        output and pace, not keystrokes — pair it with the <Link href="/performance" className="font-semibold text-emerald-700 hover:underline">ROI scorecards</Link>. <Link href="/api/v1/worktrack" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link>
      </p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2">
      <p className={`text-base font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
