import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { assessRole } from "@/lib/benchmark/engine";
import { getBenchmark, benchmarkRoles } from "@/lib/benchmark/data";
import { SUBCLASS_LABEL, type SubClass } from "@/lib/benchmark/model";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const SUB_STYLE: Record<SubClass, string> = {
  "ai-ready": "bg-red-500",
  "ai-assisted": "bg-amber-400",
  "human-better": "bg-emerald-500",
  "human-judgment": "bg-slate-400",
};
const REC_STYLE: Record<string, string> = {
  Automate: "bg-red-100 text-red-800",
  Augment: "bg-amber-100 text-amber-900",
  "Keep Human": "bg-emerald-100 text-emerald-800",
  Redesign: "bg-indigo-100 text-indigo-800",
};

const PIPELINE = ["Employee", "Role", "Tasks", "Benchmarks", "AI challenger", "Cross-compare", "Work design"];

export default async function BenchmarkPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  await requireSectionAccess("team", "view");

  const { role } = await searchParams;
  const roles = benchmarkRoles();
  const active = roles.find((r) => r.toLowerCase() === (role ?? "").toLowerCase()) ?? roles[0];
  const rb = getBenchmark(active)!;
  const c = assessRole(rb);

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Automation audit — measured, not guessed</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Work benchmark lab</h1>
        <p className="mt-2 text-sm text-slate-500">
          Same tasks, one locked rubric: a human baseline vs. an AI-workflow challenger. Hard gates
          (compliance, critical-error) can veto automation no matter how cheap or fast the AI is.
        </p>
      </header>

      {/* Combine pipeline */}
      <div className="mb-5 flex flex-wrap items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {PIPELINE.map((step, i) => (
          <span key={step} className="flex items-center gap-1">
            <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{step}</span>
            {i < PIPELINE.length - 1 && <span>→</span>}
          </span>
        ))}
      </div>

      {/* Role tabs */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {roles.map((r) => (
          <Link key={r} href={`/benchmark?role=${encodeURIComponent(r)}`} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${r === active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{r}</Link>
        ))}
      </div>

      {/* Verdict banner */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-none text-center">
            <p className="text-4xl font-bold tabular-nums text-slate-900">{c.viabilityScore}<span className="text-lg text-slate-400">/100</span></p>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Automation viability</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-slate-900">{c.finding}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REC_STYLE[c.recommendation]}`}>{c.recommendation}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Confidence: {c.confidence}</span>
              {!c.gatesPass && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Gate risk</span>}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              <strong>{c.replaceablePct}%</strong> of measured workload replaceable · quality {c.economics.qualityDeltaPct >= 0 ? "+" : ""}{c.economics.qualityDeltaPct}% · cost −{c.economics.costSavingPct}% · throughput {c.economics.throughputMultiple}× · human {c.humanBaseline} vs AI {c.aiChallenger}
            </p>
          </div>
        </div>
      </section>

      {/* Task substitution map */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Task substitution map</h2>
        <div className="flex h-4 w-full overflow-hidden rounded-full">
          {(Object.keys(SUBCLASS_LABEL) as SubClass[]).map((k) => c.substitution[k] > 0 && (
            <div key={k} className={SUB_STYLE[k]} style={{ width: `${c.substitution[k]}%` }} title={`${SUBCLASS_LABEL[k]} ${c.substitution[k]}%`} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(SUBCLASS_LABEL) as SubClass[]).map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${SUB_STYLE[k]}`} />
              <span className="text-slate-600">{SUBCLASS_LABEL[k]}</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900">{c.substitution[k]}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* Same-work benchmark table */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="p-5 pb-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Same-work benchmark</h2>
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-4">Task</th>
                <th className="py-2 pr-3">Accuracy</th>
                <th className="py-2 pr-3">Throughput</th>
                <th className="py-2 pr-3">Exceptions</th>
                <th className="py-2 pr-3">Cost/task</th>
                <th className="py-2 pr-3">Rework</th>
                <th className="py-2 pr-3">Gate</th>
                <th className="py-2">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rb.tasks.map((t, i) => {
                const a = c.tasks[i];
                return (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-4"><span className="font-medium text-slate-800">{t.label}</span><span className="ml-1 text-[11px] text-slate-400">{Math.round(t.weight * 100)}%</span></td>
                    <Cmp human={`${t.human.accuracyPct}%`} ai={`${t.ai.accuracyPct}%`} aiBetter={t.ai.accuracyPct >= t.human.accuracyPct} />
                    <Cmp human={`${t.human.throughputPerHr}/hr`} ai={`${t.ai.throughputPerHr}/hr`} aiBetter={t.ai.throughputPerHr > t.human.throughputPerHr} />
                    <Cmp human={`${t.human.exceptionResolvedPct}%`} ai={`${t.ai.exceptionResolvedPct}%`} aiBetter={t.ai.exceptionResolvedPct >= t.human.exceptionResolvedPct} />
                    <Cmp human={formatCents(t.human.costPerTaskCents)} ai={formatCents(t.ai.costPerTaskCents)} aiBetter={t.ai.costPerTaskCents < t.human.costPerTaskCents} />
                    <Cmp human={`${t.human.reworkPct}%`} ai={`${t.ai.reworkPct}%`} aiBetter={t.ai.reworkPct <= t.human.reworkPct} />
                    <td className="py-2.5 pr-3">{t.ai.compliancePass && t.ai.criticalErrorPass ? <span className="text-emerald-600">PASS</span> : <span className="font-semibold text-red-600">FAIL</span>}</td>
                    <td className="py-2.5"><span className="inline-flex items-center gap-1 text-xs"><span className={`h-2 w-2 rounded-full ${SUB_STYLE[a.subClass]}`} />{SUBCLASS_LABEL[a.subClass]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Honesty + separation of concerns */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        Benchmark data provenance: <strong className="uppercase">{c.provenance}</strong>. This is an evidence report on the WORK, not an
        employment decision — scoring rules are locked, gates are hard, and the AI never grades its own work. Feed real
        task runs to replace the sample distributions. <Link href="/api/v1/benchmark" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">Pull via API →</Link>
      </div>
    </div>
  );
}

function Cmp({ human, ai, aiBetter }: { human: string; ai: string; aiBetter: boolean }) {
  return (
    <td className="py-2.5 pr-3">
      <div className="text-slate-600">{human}</div>
      <div className={aiBetter ? "font-semibold text-red-600" : "text-slate-400"}>AI {ai}</div>
    </td>
  );
}
