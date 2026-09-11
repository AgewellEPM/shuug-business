"use client";

/** Recent completed assessments with result badge and remove. */
import { useTransition } from "react";
import { useRouter } from "next/navigation";

interface Row { id: string; templateName: string; subject: string; assessor: string; result: string; overallPct: number | null; criticalFails: number; createdAt: string }

export function RecentAssessments({ recent, removeAction, resultTone }: { recent: Row[]; removeAction: (id: string) => Promise<{ ok: boolean; error?: string }>; resultTone: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = (id: string) => start(async () => { await removeAction(id); router.refresh(); });

  if (recent.length === 0) return <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">No assessments run yet. Pick one above and run it.</p>;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
          <tr><th className="px-4 py-2">Assessment</th><th className="px-4 py-2">Subject</th><th className="px-4 py-2">By</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Result</th><th className="px-4 py-2" /></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {recent.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 font-medium text-slate-800">{r.templateName}</td>
              <td className="px-4 py-2 text-slate-600">{r.subject || "—"}</td>
              <td className="px-4 py-2 text-slate-500">{r.assessor || "—"}</td>
              <td className="px-4 py-2 text-slate-500">{r.createdAt.slice(0, 10)}</td>
              <td className="px-4 py-2 text-right">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${resultTone[r.result] ?? "bg-slate-100 text-slate-500"}`}>{r.result}{r.overallPct !== null ? ` ${r.overallPct}%` : ""}</span>
                {r.criticalFails > 0 && <span className="ml-1 text-[10px] font-semibold text-red-600">⚠{r.criticalFails}</span>}
              </td>
              <td className="px-4 py-2 text-right"><button type="button" disabled={pending} onClick={() => remove(r.id)} className="text-xs text-slate-400 hover:text-red-600">remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
