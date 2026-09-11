import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadAssessments } from "@/lib/assessments/load";
import { removeAssessmentAction } from "./actions";
import { RecentAssessments } from "@/components/RecentAssessments";

export const dynamic = "force-dynamic";

const RESULT_TONE: Record<string, string> = { pass: "bg-emerald-100 text-emerald-800", fail: "bg-red-100 text-red-800", incomplete: "bg-slate-100 text-slate-500" };

export default async function AssessmentsPage() {
  await requireSectionAccess("operations", "view");

  const { industryId, cards, recent, totalRuns } = loadAssessments();
  const mine = cards.filter((c) => c.template.industry !== "all");
  const universal = cards.filter((c) => c.template.industry === "all");

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">The inspections your trade actually runs</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Assessments</h1>
        <p className="mt-2 text-sm text-slate-500">
          Run the inspections, checklists and evaluations for your industry — a multi-point vehicle inspection, a
          kitchen line check, a site-safety audit. Scored, pass/fail, with a critical-item override, and kept on record.
          {industryId ? "" : " Set your industry in Setup to surface trade-specific ones — universal checks are ready now."}
        </p>
      </header>

      {mine.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">For your industry</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{mine.map((c) => <TemplateCard key={c.template.id} card={c} />)}</div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Universal</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{universal.map((c) => <TemplateCard key={c.template.id} card={c} />)}</div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Recent ({totalRuns})</h2>
        <RecentAssessments recent={recent.map((r) => ({ id: r.id, templateName: r.templateName, subject: r.subject, assessor: r.assessor, result: r.result.result, overallPct: r.result.overallPct, criticalFails: r.result.criticalFails, createdAt: r.createdAt }))} removeAction={removeAssessmentAction} resultTone={RESULT_TONE} />
      </section>

      <p className="mt-6 text-xs text-slate-400">Assessments live under Operations and export via <Link href="/api/v1/assessments" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link></p>
    </div>
  );
}

function TemplateCard({ card }: { card: ReturnType<typeof loadAssessments>["cards"][number] }) {
  const t = card.template;
  return (
    <Link href={`/assessments/${t.id}`} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300">
      <p className="font-semibold text-slate-900">{t.name}</p>
      <p className="mt-0.5 flex-1 text-xs text-slate-500">{t.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <span>{t.sections.reduce((n, s) => n + s.items.length, 0)} checks</span>
        <span>{card.runs} run{card.runs === 1 ? "" : "s"}</span>
        {card.passRate !== null && <span>{card.passRate}% pass</span>}
        <span className="ml-auto font-semibold text-emerald-700">Run →</span>
      </div>
    </Link>
  );
}
