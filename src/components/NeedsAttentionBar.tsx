/**
 * NeedsAttentionBar — a slim, always-on strip at the very top of every page that
 * surfaces what needs the owner across the whole business. Reads the same alert
 * engine as /today; hides itself when everything's clear. Server component.
 */
import Link from "next/link";
import { loadAlerts } from "@/lib/alerts/load";

export async function NeedsAttentionBar() {
  const { alerts, counts } = await loadAlerts();
  if (alerts.length === 0) return null;

  const top = alerts[0];
  const tone =
    counts.critical > 0
      ? "border-red-200 bg-red-50 text-red-800"
      : counts.warning > 0
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-white text-slate-700";
  const dot = counts.critical > 0 ? "bg-red-500" : counts.warning > 0 ? "bg-amber-500" : "bg-slate-400";
  const needAttention = counts.critical + counts.warning;

  return (
    <div className={`sticky top-0 z-20 mb-4 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-sm ${tone}`}>
      <span className={`h-2.5 w-2.5 flex-none animate-pulse rounded-full ${dot}`} />
      <span className="font-semibold">
        {needAttention > 0 ? `${needAttention} need${needAttention === 1 ? "s" : ""} attention` : `${alerts.length} heads-up`}
      </span>
      <span className="min-w-0 flex-1 truncate text-current/80">
        {top.title} — {top.detail}
      </span>
      <Link href="/today" className="flex-none rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700">
        View all →
      </Link>
    </div>
  );
}
