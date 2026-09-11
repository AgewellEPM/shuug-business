"use client";
import { useState } from "react";
import Link from "next/link";
import { QBD_CHAPTERS, QBD_REQUIREMENTS, QBD_MANUAL_URL, manualCoverage } from "@/lib/quickbooks/manual";
const labels = { verified: "Verified", partial: "Partly implemented", missing: "Not implemented", unverified: "Needs verification" };
export function QbdManualCoverage() {
  const [chapter, setChapter] = useState(0), [status, setStatus] = useState("all"), [search, setSearch] = useState("");
  const counts = manualCoverage();
  const rows = QBD_REQUIREMENTS.filter(r => (!chapter || r.chapter === chapter) && (status === "all" || r.status === status) && `${r.title} ${r.acceptance} ${r.remaining}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" id="manual-coverage">
    <h2 className="text-lg font-semibold text-slate-900">QuickBooks manual coverage</h2>
    <p className="mt-2 text-sm text-slate-600">All 20 chapters and the edition-specific capabilities in the 2021 Level 1 manual are tracked here. A partly implemented workflow still has requirements outstanding.</p>
    <p className="my-3 text-sm">{counts.total} requirements · {counts.verified} verified · {counts.partial} partly implemented · {counts.missing} not implemented · {counts.unverified} need verification</p>
    <div className="my-4 flex flex-wrap gap-3">
      <label className="text-sm">Chapter <select aria-label="Manual chapter" value={chapter} onChange={e => setChapter(Number(e.target.value))} className="block max-w-full rounded border p-2"><option value={0}>All chapters</option>{QBD_CHAPTERS.map(c => <option key={c[0]} value={c[0]}>{c[0]}. {c[1]}</option>)}</select></label>
      <label className="text-sm">Status <select aria-label="Implementation status" value={status} onChange={e => setStatus(e.target.value)} className="block rounded border p-2"><option value="all">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Find a feature <input aria-label="Find a manual feature" value={search} onChange={e => setSearch(e.target.value)} className="block rounded border p-2" /></label>
    </div>
    <p role="status" className="mb-3 text-sm text-slate-500">{rows.length} matching requirements</p>
    <div className="divide-y divide-slate-200">{rows.map(r => <details key={r.id} className="py-3">
      <summary className="cursor-pointer text-sm font-medium">{r.title} <span className="font-normal text-slate-500">· Chapter {r.chapter} · {labels[r.status]}</span></summary>
      <p className="mt-2 text-sm text-slate-700">{r.acceptance}</p>
      <p className="mt-2 text-sm text-amber-900">{r.remaining}</p>
      <div className="mt-2 flex gap-4 text-sm">{r.route && <Link href={r.route} className="font-semibold text-emerald-700 underline">Open available workflow</Link>}<a className="text-slate-600 underline" href={`${QBD_MANUAL_URL}#page=${r.pdfPage}`} target="_blank" rel="noreferrer">Manual PDF page {r.pdfPage}</a></div>
    </details>)}</div>
    {!rows.length && <p className="text-sm text-slate-500">No requirements match these filters.</p>}
  </section>;
}
