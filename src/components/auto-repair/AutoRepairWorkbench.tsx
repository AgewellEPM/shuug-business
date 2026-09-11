"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { repairWorkspace } from "@/lib/auto-repair/service";
import type { PricingBook, RepairQuote } from "@/lib/auto-repair/model";
import { PricingEditor } from "./PricingEditor";
import { EstimateEditor } from "./EstimateEditor";
export type RepairWorkspace = ReturnType<typeof repairWorkspace>;
export const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export const buttonClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40";
export const money = (n: number, currency: string) => `${currency} ${(n / 100).toFixed(2)}`;
export type RepairRun = (action: string, input: Record<string, unknown>) => Promise<unknown>;
export function AutoRepairWorkbench({ initial, canEdit, mode }: { initial: RepairWorkspace; canEdit: boolean; mode: "rules" | "estimate" }) {
  const [data, setData] = useState(initial), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{ book?: PricingBook; copy?: boolean } | null>(null), [reviewBook, setReviewBook] = useState<PricingBook | null>(null);
  const [review, setReview] = useState(""), [reviewed, setReviewed] = useState(false), [created, setCreated] = useState("");
  const receipt = useRef<{ key: string; id: string } | null>(null);
  async function run(action: string, input: Record<string, unknown>) {
    const key = JSON.stringify({ action, input });
    if (receipt.current?.key !== key) receipt.current = { key, id: crypto.randomUUID() };
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/auto-repair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, input: { ...input, ...(action === "estimate.review" ? {} : { requestId: receipt.current.id }) } }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not update repair pricing.");
      if (action !== "estimate.review") {
        const fresh = await fetch("/api/auto-repair", { cache: "no-store" }); if (!fresh.ok) throw new Error("Saved, but the workspace could not refresh. Retry this action to recover its receipt.");
        setData(await fresh.json()); receipt.current = null; setMessage("Saved.");
      }
      return body.result;
    } catch (e) { setMessage(e instanceof Error ? e.message : "Connection interrupted. Retry without changing the form to recover the same result."); throw e; }
    finally { setPending(false); }
  }
  const published = data.books.filter(b => b.status === "published");
  return <section className="mb-6 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5" aria-label="Repair pricing workspace">
    <header><h2 className="text-xl font-semibold">{mode === "rules" ? "Repair pricing rules" : "Vehicle repair estimate"}</h2><p className="mt-2 text-sm text-slate-600">Apply reviewed labor rates and parts markups to a vehicle’s client proposal. Customer approval and billing continue in Estimates &amp; proposals.</p></header>
    <nav className="flex flex-wrap gap-3 text-sm underline" aria-label="Repair workflow"><Link href="/m/vehicles">Vehicles &amp; clients</Link><Link href="/m/labor-rates">Labor &amp; parts pricing</Link><Link href="/modules/service-proposals">Estimates &amp; proposals</Link><Link href="/modules/service-billing">Service billing</Link></nav>
    {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
    {mode === "rules" ? <>
      <p className="text-sm">Published terms stay fixed. Copy a version to change rates. Only published versions marked for sharing are included in business templates; another business imports them as drafts.</p>
      <button className={buttonClass} disabled={!canEdit || pending} onClick={() => { setEditor({}); setReviewBook(null); }}>New pricing version</button>
      <div className="overflow-x-auto"><table className="w-full bg-white text-left text-sm"><thead><tr><th className="p-3">Pricing</th><th className="p-3">Effective dates (UTC)</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{data.books.map(book => <tr className="border-t" key={book.id}><td className="p-3">{book.definition.name} · v{book.definition.version}<span className="block text-xs">{book.definition.currency} · {book.definition.labor.length} labor categories · {book.definition.parts.length} parts categories{book.imported ? " · Imported" : ""}</span><details className="mt-2"><summary>View rates</summary><ul>{book.definition.labor.map(l => <li key={l.category}>{l.category}: {money(l.hourlyRate, book.definition.currency)}/hour · minimum {l.minimumMinutes} minutes · increments {l.incrementMinutes} minutes</li>)}{book.definition.parts.map(p => <li key={p.category}>{p.category}: {p.bands.map(b => `${money(b.fromCost, book.definition.currency)} to ${b.untilCost === null ? "unlimited" : `under ${money(b.untilCost, book.definition.currency)}`} → ${b.markupBasisPoints / 100}% markup`).join("; ")}</li>)}</ul></details></td><td className="p-3">{book.definition.effectiveFrom} → {book.definition.effectiveTo || "No end date"}</td><td className="p-3">{book.status}<br/>{book.shareInTemplates ? "Share in templates" : "Private pricing"}</td><td className="space-x-2 space-y-2 p-3"><button className={buttonClass} disabled={!canEdit || pending} onClick={() => { setEditor({ book, copy: book.status !== "draft" }); setReviewBook(null); }}>{book.status === "draft" ? "Edit draft" : "Copy to new version"}</button>{book.status !== "retired" && <><button className={buttonClass} disabled={!canEdit || pending} onClick={() => { setReviewBook(book); setReview(""); setReviewed(false); setEditor(null); }}>{book.status === "draft" ? "Review & publish" : "Retire"}</button><button className={buttonClass} disabled={!canEdit || pending} onClick={() => void run("book.share", { id: book.id, revision: book.revision, shareInTemplates: !book.shareInTemplates }).catch(() => {})}>{book.shareInTemplates ? "Stop sharing" : "Share in templates"}</button></>}</td></tr>)}</tbody></table>{!data.books.length && <p className="p-4 text-sm">Create and review a pricing version to begin.</p>}</div>
      {editor && <PricingEditor key={`${editor.book?.id ?? "new"}-${editor.copy}`} book={editor.book} copy={editor.copy} today={data.today} disabled={pending || !canEdit} run={run} close={() => setEditor(null)}/>}
      {reviewBook && <form className="space-y-3 rounded-lg border bg-white p-4" onSubmit={e => { e.preventDefault(); void run(reviewBook.status === "draft" ? "book.publish" : "book.retire", { id: reviewBook.id, revision: reviewBook.revision, reviewed: true, review }).then(() => setReviewBook(null)).catch(() => {}); }}><h3 className="font-semibold">{reviewBook.status === "draft" ? "Publish" : "Retire"} {reviewBook.definition.name} v{reviewBook.definition.version}</h3><label className="block text-sm">Review notes<textarea className={inputClass} required minLength={5} maxLength={500} value={review} onChange={e => setReview(e.target.value)}/></label><label className="block text-sm"><input type="checkbox" required checked={reviewed} onChange={e => setReviewed(e.target.checked)}/> I reviewed these terms and their effective dates.</label><button className={buttonClass} disabled={pending || !canEdit || !reviewed}>{reviewBook.status === "draft" ? "Publish reviewed pricing" : "Retire pricing"}</button> <button type="button" className={buttonClass} onClick={() => setReviewBook(null)}>Cancel</button></form>}
      <p className="text-sm text-slate-600">The older reference records below are kept for your records. Estimates use the reviewed pricing versions above.</p>
    </> : <>
      <EstimateEditor data={data} books={published} disabled={pending || !canEdit} run={run} onCreated={setCreated}/>
      {/* Full navigation reloads the proposal table and selects the newly persisted record. */}
      {created && <p role="status" className="rounded-lg border bg-white p-3 text-sm">Draft proposal created. <a className="underline" href={`/modules/service-proposals?record=${encodeURIComponent(created)}`}>Open the proposal to review it and continue customer approval.</a></p>}
      {data.estimates.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Recent repair estimates ({data.estimates.length})</summary><ul className="mt-2 space-y-2 text-sm">{data.estimates.map(e => <li key={e.id}><a className="underline" href={`/modules/service-proposals?record=${encodeURIComponent(e.id)}`}>{e.title}</a> · {e.status} · {money((e.quote as RepairQuote).total, e.quote.currency)}</li>)}</ul></details>}
    </>}
  </section>;
}
