"use client";

/** One employee performance scorecard with an on-demand AI analyst review. */
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import type { Scorecard } from "@/lib/performance/scorecard";
import type { ReviewResponse } from "@/app/performance/actions";

const TIER: Record<string, string> = {
  star: "bg-emerald-600 text-white",
  strong: "bg-emerald-100 text-emerald-800",
  solid: "bg-sky-100 text-sky-800",
  watch: "bg-amber-100 text-amber-900",
  underwater: "bg-red-100 text-red-800",
  "set-salary": "bg-slate-200 text-slate-600",
};

export function PerfScorecard({
  card,
  reviewAction,
}: {
  card: Scorecard;
  reviewAction: (id: string, period: "daily" | "weekly") => Promise<ReviewResponse>;
}) {
  const [pending, start] = useTransition();
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const run = (period: "daily" | "weekly") => start(async () => setReview(await reviewAction(card.id, period)));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{card.name}</p>
          <p className="text-xs text-slate-500">{card.role} · {card.isRevenueRole ? "revenue" : "support"}</p>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TIER[card.verdict.tier]}`}>{card.verdict.label}</span>
      </div>

      {card.isRevenueRole ? (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Cell label="Revenue" value={formatCents(card.revenueAttributedCents)} />
          <Cell label="× Salary" value={card.valueMultiple === null ? "—" : `${card.valueMultiple.toFixed(1)}×`} tone={card.valueMultiple && card.valueMultiple >= 5 ? "text-emerald-600" : card.valueMultiple && card.valueMultiple < 1 ? "text-red-600" : undefined} />
          <Cell label="ROI" value={card.roiPct === null ? "—" : `${card.roiPct}%`} tone={card.roiPct !== null && card.roiPct >= 0 ? "text-emerald-600" : "text-red-600"} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Cell label="Throughput" value={`${card.supportScore}/100`} tone={card.supportScore! >= 75 ? "text-emerald-600" : undefined} />
          <Cell label="Tasks done" value={String(card.tasksDone)} />
          <Cell label="Points" value={String(card.storyPointsDone)} />
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {card.salaryCents !== null && <>Cost {formatCents(card.salaryCents)}/yr · </>}
        {card.isRevenueRole ? <>Net {card.profitContributionCents === null ? "—" : formatCents(card.profitContributionCents)}</> : <>{card.tasksOpen} open</>}
      </p>
      <p className="mt-1 text-[11px] italic text-slate-400">{card.verdict.rationale}</p>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <button type="button" disabled={pending} onClick={() => run("daily")} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40">{pending ? "…" : "AI review · day"}</button>
        <button type="button" disabled={pending} onClick={() => run("weekly")} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">Weekly</button>
      </div>

      {review && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          {review.ok ? (
            <>
              <p className="text-sm text-slate-700">{review.text}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{review.source === "ai" ? `AI analyst · ${review.model}` : "Rule-based (connect AI for deeper reviews)"}</p>
            </>
          ) : (
            <p className="text-sm text-red-700">{review.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2">
      <p className={`text-base font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
