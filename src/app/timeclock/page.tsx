import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadTimeClock } from "@/lib/timeclock/load";
import { formatCents } from "@/lib/money";
import { TimeClock } from "@/components/TimeClock";
import { clockInAction, clockOutAction, addManualAction, removeEntryAction, setRateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TimeClockPage() {
  await requireSectionAccess("team", "view");

  const data = loadTimeClock();

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Every hour, tracked to the job</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Time clock &amp; timesheets</h1>
        <p className="mt-2 text-sm text-slate-500">
          Clock in and out, track hours against a job or board card, and roll it straight into payroll — overtime
          over 40h paid at 1.5×. Works for hourly (blue-collar) and salaried staff alike.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="On the clock now" value={String(data.summary.onClockCount)} tone={data.summary.onClockCount > 0 ? "text-emerald-700" : undefined} />
        <Stat label="Hours this week" value={data.summary.totalHours.toFixed(1)} />
        <Stat label="Payroll this week" value={formatCents(data.summary.totalGrossPayCents)} />
        <Stat label="Team" value={String(data.employees.length)} />
      </div>

      <TimeClock
        data={data}
        clockInAction={clockInAction}
        clockOutAction={clockOutAction}
        addManualAction={addManualAction}
        removeEntryAction={removeEntryAction}
        setRateAction={setRateAction}
      />

      <p className="mt-6 text-xs text-slate-400">
        Hours feed <Link href="/performance" className="font-semibold text-emerald-700 hover:underline">performance</Link> and can export to your payroll provider (ADP) from <Link href="/team" className="font-semibold text-emerald-700 hover:underline">Team</Link>. <Link href="/api/v1/timeclock" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
