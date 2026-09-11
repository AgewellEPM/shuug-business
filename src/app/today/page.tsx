import { requireOwnerAccess } from "@/lib/auth/identity";
import Link from "next/link";
import { loadAlerts } from "@/lib/alerts/load";
import type { AlertSeverity } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";

const SEV_STYLE: Record<AlertSeverity, string> = {
  critical: "border-red-200 bg-red-50/70",
  warning: "border-amber-200 bg-amber-50/60",
  info: "border-slate-200 bg-white",
};
const SEV_DOT: Record<AlertSeverity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-slate-300",
};

export default async function TodayPage() {
  await requireOwnerAccess();
  const { alerts, counts } = await loadAlerts();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Today</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everything that needs you, from across the whole business — low stock, expiring product,
          overcharges, overdue tasks, samples to approve, and email that needs a person.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-3">
        <Stat label="Critical" value={counts.critical} tone="text-red-600" />
        <Stat label="Warnings" value={counts.warning} tone="text-amber-600" />
        <Stat label="Heads up" value={counts.info} tone="text-slate-600" />
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-lg font-semibold text-emerald-800">All clear. 🎉</p>
          <p className="text-sm text-emerald-700">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.id} className={`flex items-center gap-3 rounded-xl border p-4 shadow-sm ${SEV_STYLE[a.severity]}`}>
              <span className={`h-2.5 w-2.5 flex-none rounded-full ${SEV_DOT[a.severity]}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {a.title} <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{a.category}</span>
                </p>
                <p className="text-sm text-slate-600">{a.detail}</p>
              </div>
              <Link href={a.href} className="flex-none rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700">
                {a.actionLabel} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
