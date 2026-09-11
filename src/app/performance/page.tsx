import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadScorecards } from "@/lib/performance/load";
import { PerfScorecard } from "@/components/PerfScorecard";
import { generateReviewAction } from "./actions";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  await requireSectionAccess("team", "edit");

  const org = await loadScorecards();
  // Revenue roles first, then by value multiple / throughput.
  const cards = [...org.scorecards].sort((a, b) => {
    if (a.isRevenueRole !== b.isRevenueRole) return a.isRevenueRole ? -1 : 1;
    return (b.valueMultiple ?? b.supportScore ?? 0) - (a.valueMultiple ?? a.supportScore ?? 0);
  });
  const netCents = org.totalRevenueAttributedCents - org.totalSalaryCents;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team performance</h1>
          <p className="mt-1 text-sm text-slate-600">
            What each person is worth to your business — money brought in vs. their cost, ROI, and an AI analyst’s
            honest take. Support roles are judged on output, not sales.
          </p>
        </div>
        <Link href="/team" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">Manage team →</Link>
      </header>

      {/* Org rollup */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Revenue attributed" value={formatCents(org.totalRevenueAttributedCents)} tone="text-emerald-700" />
        <Stat label="Total payroll cost" value={formatCents(org.totalSalaryCents)} />
        <Stat label="Net of payroll" value={formatCents(netCents)} tone={netCents >= 0 ? "text-emerald-700" : "text-red-600"} />
        <Stat label="Clear assets" value={`${org.assets} of ${org.scorecards.length}`} />
      </div>

      {(org.underwater > 0 || org.needsSalary > 0) && (
        <div className="mb-5 flex flex-wrap gap-2 text-xs">
          {org.underwater > 0 && <span className="rounded-lg bg-red-50 px-3 py-1.5 font-medium text-red-800">{org.underwater} below their cost — review</span>}
          {org.needsSalary > 0 && <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-600">{org.needsSalary} missing a salary — add it in Team to measure ROI</span>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => <PerfScorecard key={c.id} card={c} reviewAction={generateReviewAction} />)}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
