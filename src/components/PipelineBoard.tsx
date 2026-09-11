"use client";

/** Sales pipeline — a monday-style CRM board. Drag-free stage moves (← →),
 *  win/loss with a reason, rep assignment, and a weighted forecast up top. */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { STAGES, OPEN_STAGES, type Deal, type Stage, type PipelineSummary } from "@/lib/pipeline/model";
import type { PipeResult } from "@/app/pipeline/actions";

interface Actions {
  createDealAction: (form: { title: string; company: string; expectedValueCents: number; assignedTo?: string | null; source?: string; nextAction?: string }) => Promise<PipeResult>;
  moveStageAction: (id: string, stage: Stage) => Promise<PipeResult>;
  markLostAction: (id: string, reason: string) => Promise<PipeResult>;
  assignDealAction: (id: string, assignedTo: string | null) => Promise<PipeResult>;
  updateNextActionAction: (id: string, nextAction: string) => Promise<PipeResult>;
}

const COLS: Stage[] = [...OPEN_STAGES, "won", "lost"];
const label = (s: Stage) => STAGES.find((x) => x.key === s)!.label;

export function PipelineBoard({ deals, summary, team, ...actions }: { deals: Deal[]; summary: PipelineSummary; team: { id: string; name: string }[] } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const run = (fn: () => Promise<PipeResult>) => start(async () => { const r = await fn(); setToast(r.ok ? "Saved" : r.error ?? "Failed"); router.refresh(); });
  const idx = (s: Stage) => COLS.indexOf(s);
  const nameOf = (id: string | null) => (id ? team.find((t) => t.id === id)?.name ?? id : "Unassigned");

  return (
    <div>
      {toast && <p className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      {/* Forecast bar */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Weighted forecast" value={formatCents(summary.weightedForecastCents)} tone="text-emerald-700" />
        <Stat label="Open pipeline" value={`${formatCents(summary.openValueCents)} · ${summary.openCount}`} />
        <Stat label="Win rate" value={summary.winRatePct === null ? "—" : `${summary.winRatePct}%`} />
        <Stat label="Stalled" value={String(summary.stalled.length)} tone={summary.stalled.length > 0 ? "text-amber-600" : "text-slate-900"} />
      </div>

      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setAdding((a) => !a)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">{adding ? "Cancel" : "+ New lead"}</button>
      </div>
      {adding && <NewLead team={team} pending={pending} onDone={() => setAdding(false)} run={run} createDealAction={actions.createDealAction} />}

      {/* Kanban */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {COLS.map((stage) => {
          const inCol = deals.filter((d) => d.stage === stage);
          const value = inCol.reduce((n, d) => n + d.expectedValueCents, 0);
          return (
            <div key={stage} className={`rounded-xl border p-2 ${stage === "won" ? "border-emerald-200 bg-emerald-50/40" : stage === "lost" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-slate-50/60"}`}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-slate-700">{label(stage)}</h3>
                <span className="text-[10px] text-slate-400">{inCol.length} · {formatCents(value)}</span>
              </div>
              <div className="space-y-2">
                {inCol.map((d) => (
                  <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                    <p className="text-sm font-medium text-slate-800">{d.company || d.title}</p>
                    <p className="text-[11px] text-slate-400">{d.title !== d.company ? d.title : d.source}</p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatCents(d.expectedValueCents)} <span className="text-[10px] font-normal text-slate-400">· {d.probability}%</span></p>
                    {d.nextAction && OPEN_STAGES.includes(d.stage) && <p className="mt-1 text-[11px] text-emerald-800">→ {d.nextAction}</p>}
                    {d.stage === "lost" && d.lostReason && <p className="mt-1 text-[11px] text-red-600">Lost: {d.lostReason}</p>}
                    <div className="mt-2 flex items-center gap-1">
                      <select value={d.assignedTo ?? ""} disabled={pending} onChange={(e) => run(() => actions.assignDealAction(d.id, e.target.value || null))} className="max-w-[92px] flex-1 truncate rounded border border-slate-200 px-1 py-0.5 text-[11px]" title={nameOf(d.assignedTo)}>
                        <option value="">Unassigned</option>
                        {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {OPEN_STAGES.includes(d.stage) && (
                        <>
                          <button type="button" disabled={pending || idx(d.stage) === 0} onClick={() => run(() => actions.moveStageAction(d.id, COLS[idx(d.stage) - 1]))} className="rounded border border-slate-200 px-1 text-xs text-slate-500 disabled:opacity-30" aria-label="Back">←</button>
                          <button type="button" disabled={pending} onClick={() => run(() => actions.moveStageAction(d.id, COLS[idx(d.stage) + 1]))} className="rounded border border-slate-200 px-1 text-xs text-slate-500" aria-label="Forward">→</button>
                          <button type="button" disabled={pending} onClick={() => run(() => actions.moveStageAction(d.id, "won"))} className="rounded bg-emerald-600 px-1.5 text-[10px] font-semibold text-white" title="Won">✓</button>
                          <button type="button" disabled={pending} onClick={() => { const r = prompt("Why was this lost?"); if (r !== null) run(() => actions.markLostAction(d.id, r || "No reason")); }} className="rounded px-1.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-200" title="Lost">✕</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {inCol.length === 0 && <p className="px-1 py-2 text-center text-[11px] text-slate-400">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewLead({ team, pending, onDone, run, createDealAction }: { team: { id: string; name: string }[]; pending: boolean; onDone: () => void; run: (fn: () => Promise<PipeResult>) => void; createDealAction: Actions["createDealAction"] }) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [value, setValue] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [source, setSource] = useState("");
  const add = () => { if (!title.trim()) return; run(() => createDealAction({ title, company, expectedValueCents: Math.round(Number(value || 0) * 100), assignedTo: assignedTo || null, source })); onDone(); };
  return (
    <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Expected value $" inputMode="decimal" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm"><option value="">Assign rep…</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (website, referral…)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button type="button" disabled={pending || !title.trim()} onClick={add} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add to pipeline</button>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
