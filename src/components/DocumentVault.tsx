"use client";

/** Documents & legal vault — store business papers, track renewals, send for
 *  signature (DocuSign/PandaDoc). Upload keeps the file as a data URL. */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DOC_CATEGORIES, expiryStatus, daysUntil, type DocRecord, type DocCategory, type ExpiryStatus } from "@/lib/documents/model";
import type { DocResult } from "@/app/documents/actions";

const EXPIRY_BADGE: Record<ExpiryStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  expiring: "bg-amber-100 text-amber-900",
  expired: "bg-red-100 text-red-800",
  "no-expiry": "bg-slate-100 text-slate-500",
};
const SIG_LABEL: Record<string, string> = { none: "", sent: "Awaiting signature", signed: "Signed ✓", declined: "Declined" };

interface Actions {
  addDocAction: (form: { name: string; category: DocCategory; issuer?: string; fileDataUrl?: string | null; fileName?: string; expiresAt?: string | null }) => Promise<DocResult>;
  removeDocAction: (id: string) => Promise<DocResult>;
  requestSignatureAction: (id: string, docName: string, signerEmail: string) => Promise<DocResult>;
}

export function DocumentVault({ docs, todayIso, esign, ...actions }: { docs: DocRecord[]; todayIso: string; esign: { configured: boolean; detail: string } } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const run = (fn: () => Promise<DocResult>) => start(async () => { const r = await fn(); setToast(r.message ?? (r.ok ? "Saved" : r.error ?? "Failed")); router.refresh(); });

  return (
    <div>
      {toast && <p className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}
      <AddDoc pending={pending} run={run} addDocAction={actions.addDocAction} />

      <div className="mt-6 space-y-5">
        {DOC_CATEGORIES.map((cat) => {
          const inCat = docs.filter((d) => d.category === cat.key);
          if (inCat.length === 0) return null;
          return (
            <section key={cat.key}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{cat.label}</h2>
              <div className="space-y-2">
                {inCat.map((d) => {
                  const st = expiryStatus(d.expiresAt, todayIso);
                  return (
                    <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{d.name}</p>
                        <p className="text-xs text-slate-400">{d.issuer || "—"}{d.fileName && ` · ${d.fileName}`}</p>
                      </div>
                      {d.expiresAt && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPIRY_BADGE[st]}`}>{st === "expired" ? `expired ${-daysUntil(d.expiresAt, todayIso)}d` : st === "expiring" ? `renew in ${daysUntil(d.expiresAt, todayIso)}d` : d.expiresAt}</span>}
                      {d.signature !== "none" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">{SIG_LABEL[d.signature]}</span>}
                      <div className="flex items-center gap-1.5">
                        {d.fileDataUrl && <a href={d.fileDataUrl} download={d.fileName || d.name} className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50">Download</a>}
                        {esign.configured && d.signature === "none" && (
                          <button type="button" disabled={pending} onClick={() => { const email = prompt("Signer email:"); if (email) run(() => actions.requestSignatureAction(d.id, d.name, email)); }} className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white">Send to sign</button>
                        )}
                        <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete “${d.name}”?`)) run(() => actions.removeDocAction(d.id)); }} className="rounded-full px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {docs.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No documents yet. Add your licenses, insurance and agreements above.</p>}
      </div>
    </div>
  );
}

function AddDoc({ pending, run, addDocAction }: { pending: boolean; run: (fn: () => Promise<DocResult>) => void; addDocAction: Actions["addDocAction"] }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocCategory>("license");
  const [issuer, setIssuer] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<{ dataUrl: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setErr("File too large — keep it under 2MB (a single PDF/scan)."); return; }
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => setFile({ dataUrl: String(reader.result), name: f.name });
    reader.readAsDataURL(f);
  };
  const add = () => {
    if (!name.trim()) return;
    run(() => addDocAction({ name, category, issuer, expiresAt: expiresAt || null, fileDataUrl: file?.dataUrl ?? null, fileName: file?.name ?? "" }));
    setName(""); setIssuer(""); setExpiresAt(""); setFile(null);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a document</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name (e.g. Liability insurance)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select value={category} onChange={(e) => setCategory(e.target.value as DocCategory)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">{DOC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Issuer (state, insurer…)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-xs text-slate-500">Expires / renew<input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => onFile(e.target.files?.[0])} className="text-xs" />
        <button type="button" disabled={pending || !name.trim()} onClick={add} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Save to vault</button>
      </div>
      {file && <p className="mt-1 text-[11px] text-emerald-700">Attached: {file.name}</p>}
      {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
    </section>
  );
}
