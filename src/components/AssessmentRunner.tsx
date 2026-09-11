"use client";

/**
 * Run an assessment: subject + assessor, then each section's items as pass/fail
 * buttons, star ratings, measures or notes. Scores live (client-side, using the same
 * pure engine) with a critical-fail override, so the assessor sees pass/fail before
 * saving. Saving persists the scored snapshot.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { scoreAssessment, type AssessmentTemplate, type Responses, type ItemResponse } from "@/lib/assessments/model";
import type { ActionResult } from "@/app/assessments/actions";

interface History { id: string; subject: string; result: string; overallPct: number | null; createdAt: string }

export function AssessmentRunner({ template, history, saveAction }: { template: AssessmentTemplate; history: History[]; saveAction: (templateId: string, subject: string, assessor: string, responses: Responses) => Promise<ActionResult> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [assessor, setAssessor] = useState("");
  const [responses, setResponses] = useState<Responses>({});
  const [saved, setSaved] = useState<string | null>(null);

  const set = (id: string, patch: Partial<ItemResponse>) => setResponses((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const result = useMemo(() => scoreAssessment(template, responses), [template, responses]);

  const save = () => start(async () => {
    const r = await saveAction(template.id, subject, assessor, responses);
    if (r.ok) { setSaved(r.result ?? "saved"); router.refresh(); } else setSaved(`error: ${r.error}`);
  });

  const tone = result.result === "pass" ? "text-emerald-700" : result.result === "fail" ? "text-red-600" : "text-slate-400";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${template.subjectLabel} (e.g. plate, name, job #)`} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder="Assessor" className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        {template.sections.map((section) => (
          <section key={section.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{section.title}</h2>
            <div className="space-y-2.5">
              {section.items.map((item) => {
                const r = responses[item.id] ?? {};
                return (
                  <div key={item.id} className="flex flex-wrap items-center gap-2 border-b border-slate-50 pb-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{item.label}{item.critical && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">CRITICAL</span>}</p>
                      {item.hint && <p className="text-[11px] text-slate-400">{item.hint}</p>}
                    </div>
                    {item.type === "pass-fail" && (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => set(item.id, { pass: true })} className={`rounded px-2.5 py-1 text-xs font-semibold ${r.pass === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>Pass</button>
                        <button type="button" onClick={() => set(item.id, { pass: false })} className={`rounded px-2.5 py-1 text-xs font-semibold ${r.pass === false ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"}`}>Fail</button>
                        <button type="button" onClick={() => set(item.id, { pass: undefined })} className={`rounded px-2.5 py-1 text-xs font-semibold ${r.pass === undefined ? "bg-slate-300 text-slate-700" : "bg-slate-100 text-slate-500"}`}>N/A</button>
                      </div>
                    )}
                    {item.type === "rating" && (
                      <div className="flex gap-0.5">
                        {Array.from({ length: item.max ?? 5 }, (_, i) => i + 1).map((n) => (
                          <button key={n} type="button" onClick={() => set(item.id, { rating: n })} className={`h-7 w-7 rounded text-xs font-semibold ${(r.rating ?? 0) >= n ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-400"}`}>{n}</button>
                        ))}
                      </div>
                    )}
                    {item.type === "measure" && (
                      <div className="flex items-center gap-1"><input type="number" value={r.value ?? ""} onChange={(e) => set(item.id, { value: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm" /><span className="text-xs text-slate-400">{item.unit}</span></div>
                    )}
                    {item.type === "note" && (
                      <input value={r.note ?? ""} onChange={(e) => set(item.id, { note: e.target.value })} placeholder="Note" className="w-48 rounded border border-slate-300 px-2 py-1 text-sm" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Live result + save + history */}
      <div className="space-y-4">
        <section className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Result</p>
          <p className={`text-3xl font-bold ${tone}`}>{result.result === "incomplete" ? "—" : result.result.toUpperCase()}</p>
          <p className="text-sm text-slate-500">{result.overallPct === null ? "Answer some items" : `${result.overallPct}% · ${result.answered}/${result.total} answered`}</p>
          {result.criticalFails > 0 && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{result.criticalFails} critical fail{result.criticalFails === 1 ? "" : "s"} — auto-fail</p>}
          {result.flagged.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Flagged</p>
              <ul className="mt-0.5 space-y-0.5 text-xs text-slate-600">{result.flagged.slice(0, 6).map((f) => <li key={f.itemId} className={f.critical ? "text-red-600" : ""}>• {f.label} — {f.reason}</li>)}</ul>
            </div>
          )}
          <button type="button" disabled={pending || result.result === "incomplete"} onClick={save} className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Save assessment</button>
          {saved && <p className={`mt-2 text-xs ${saved.startsWith("error") ? "text-red-600" : "text-emerald-700"}`}>{saved.startsWith("error") ? saved : `Saved — result: ${saved}`}</p>}
        </section>

        {history.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent runs</h2>
            <ul className="space-y-1.5 text-xs">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between">
                  <span className="min-w-0 truncate text-slate-600">{h.subject || "—"} <span className="text-slate-400">· {h.createdAt.slice(0, 10)}</span></span>
                  <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${h.result === "pass" ? "bg-emerald-100 text-emerald-800" : h.result === "fail" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-500"}`}>{h.result}{h.overallPct !== null ? ` ${h.overallPct}%` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-center text-[11px] text-slate-400"><Link href="/assessments" className="hover:underline">← all assessments</Link></p>
      </div>
    </div>
  );
}
