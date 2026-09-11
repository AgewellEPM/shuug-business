"use client";

/**
 * Unified customer record — one timeline of every interaction, plus panels to
 * own the conversation (assign, mark replied) and manage quotes (accept, decline,
 * convert to an order). Message ownership prevents double-replies.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { CustomerTimeline as TL } from "@/lib/timeline/load";
import type { EventType } from "@/lib/timeline/engine";
import type { ActionResult } from "@/app/customers/[id]/timeline/actions";

const ICON: Record<EventType, string> = { order: "🧾", quote: "📄", payment: "💳", message: "✉️", note: "📝", commitment: "🤝", document: "📎" };

const DOC_CATS: { key: string; label: string }[] = [
  { key: "agreement", label: "Agreements & contracts" },
  { key: "insurance", label: "Insurance (COI)" },
  { key: "license", label: "Business licenses" },
  { key: "permit", label: "Permits" },
  { key: "tax", label: "Tax & compliance" },
  { key: "form", label: "Forms" },
  { key: "other", label: "Other papers" },
];

interface Actions {
  addCommAction: (form: { customerId: string; channel: "email" | "call" | "message" | "note"; direction: "in" | "out"; subject: string; body: string }) => Promise<ActionResult>;
  assignCommAction: (customerId: string, id: string, ownerId: string | null) => Promise<ActionResult>;
  markRepliedAction: (customerId: string, id: string, replied: boolean) => Promise<ActionResult>;
  createQuoteAction: (form: { customerId: string; expiresAt: string; note: string; lines: { skuId: string; name: string; cases: number; unitPriceCents: number }[] }) => Promise<ActionResult>;
  setQuoteStatusAction: (customerId: string, id: string, status: "accepted" | "declined") => Promise<ActionResult>;
  convertQuoteAction: (customerId: string, id: string) => Promise<ActionResult>;
  attachDocumentAction: (form: { customerId: string; name: string; category: string; issuer: string; expiresAt: string | null; fileDataUrl: string | null; fileName: string }) => Promise<ActionResult>;
  removeDocumentAction: (customerId: string, id: string) => Promise<ActionResult>;
}

export function CustomerTimeline({
  customerId, data, team, skus, todayIso, ...actions
}: { customerId: string; data: TL; team: { id: string; name: string }[]; skus: { id: string; name: string; standardPriceCents: number }[]; todayIso: string } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) => start(async () => { const r = await fn(); setToast(r.ok ? "Saved" : r.error ?? "Failed"); router.refresh(); });
  const nameOf = (id: string | null) => (id ? team.find((t) => t.id === id)?.name ?? id : "Unassigned");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Timeline */}
      <div>
        {toast && <p className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <Chip label={`${data.summary.openItems} open`} tone="bg-amber-100 text-amber-900" />
          <Chip label={`${data.summary.awaitingReply} awaiting reply`} tone="bg-red-100 text-red-800" />
          <Chip label={`${data.summary.openQuotes} open quotes`} tone="bg-sky-100 text-sky-800" />
        </div>
        <ol className="space-y-2">
          {data.summary.events.length === 0 && <li className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">Nothing yet. Log a message or send a quote →</li>}
          {data.summary.events.map((e) => (
            <li key={e.id} className={`flex gap-3 rounded-xl border p-3 shadow-sm ${e.needsAction ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
              <span className="text-lg">{ICON[e.type]}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  {e.href ? <Link href={e.href} className="hover:text-emerald-700">{e.title}</Link> : e.title}
                  {e.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">{e.status}</span>}
                </p>
                {e.detail && <p className="truncate text-xs text-slate-500">{e.detail}</p>}
                <p className="mt-0.5 text-[11px] text-slate-400">{new Date(e.atMs).toISOString().slice(0, 10)}{e.actor && ` · ${e.actor}`}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Right rail: quotes + docs + comms */}
      <div className="space-y-5">
        <QuotePanel customerId={customerId} quotes={data.quotes} skus={skus} todayIso={todayIso} pending={pending} run={run} actions={actions} />

        <DocPanel customerId={customerId} docs={data.docs} todayIso={todayIso} pending={pending} run={run} actions={actions} />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Conversation</h2>
          <div className="space-y-2">
            {data.comms.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-100 p-2">
                <p className="text-xs font-medium text-slate-800">{c.subject}</p>
                <p className="truncate text-[11px] text-slate-500">{c.body}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <select value={c.ownerId ?? ""} disabled={pending} onChange={(ev) => run(() => actions.assignCommAction(customerId, c.id, ev.target.value || null))} className="rounded border border-slate-200 px-1 py-0.5 text-[11px]">
                    <option value="">Unassigned</option>
                    {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button type="button" disabled={pending} onClick={() => run(() => actions.markRepliedAction(customerId, c.id, !c.replied))} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${c.replied ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{c.replied ? "Replied ✓" : "Needs reply"}</button>
                  <span className="ml-auto text-[10px] text-slate-400">{nameOf(c.ownerId)}</span>
                </div>
              </div>
            ))}
            {data.comms.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No messages yet.</p>}
          </div>
          <AddComm customerId={customerId} pending={pending} run={run} addCommAction={actions.addCommAction} />
        </section>
      </div>
    </div>
  );
}

function QuotePanel({ customerId, quotes, skus, todayIso, pending, run, actions }: { customerId: string; quotes: TL["quotes"]; skus: { id: string; name: string; standardPriceCents: number }[]; todayIso: string; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const [adding, setAdding] = useState(false);
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [cases, setCases] = useState("10");
  const [expires, setExpires] = useState("");
  const eff = (q: TL["quotes"][number]) => (q.status === "sent" && q.expiresAt < todayIso ? "expired" : q.status);

  const create = () => {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku || !expires) return;
    run(() => actions.createQuoteAction({ customerId, expiresAt: expires, note: "", lines: [{ skuId: sku.id, name: sku.name, cases: Math.max(1, Number(cases) || 1), unitPriceCents: sku.standardPriceCents }] }));
    setAdding(false);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Quotes</h2>
        <button type="button" onClick={() => setAdding((a) => !a)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">{adding ? "Cancel" : "+ New quote"}</button>
      </div>
      {adding && (
        <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-2">
          <select value={skuId} onChange={(e) => setSkuId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">{skus.map((s) => <option key={s.id} value={s.id}>{s.name} · {formatCents(s.standardPriceCents)}/case</option>)}</select>
          <div className="flex gap-2">
            <input value={cases} onChange={(e) => setCases(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Cases" className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input type="date" value={expires} min={todayIso} onChange={(e) => setExpires(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <button type="button" disabled={pending || !expires} onClick={create} className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Send quote</button>
        </div>
      )}
      <div className="space-y-1.5">
        {quotes.map((q) => {
          const st = eff(q);
          return (
            <div key={q.id} className="rounded-lg border border-slate-100 p-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{formatCents(q.subtotalCents)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${st === "accepted" ? "bg-emerald-100 text-emerald-800" : st === "converted" ? "bg-sky-100 text-sky-800" : st === "expired" || st === "declined" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-900"}`}>{st}</span>
              </div>
              <p className="text-[11px] text-slate-400">expires {q.expiresAt}</p>
              {st === "sent" && (
                <div className="mt-1 flex gap-1">
                  <button type="button" disabled={pending} onClick={() => run(() => actions.setQuoteStatusAction(customerId, q.id, "accepted"))} className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">Accept</button>
                  <button type="button" disabled={pending} onClick={() => run(() => actions.setQuoteStatusAction(customerId, q.id, "declined"))} className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">Decline</button>
                </div>
              )}
              {st === "accepted" && <button type="button" disabled={pending} onClick={() => run(() => actions.convertQuoteAction(customerId, q.id))} className="mt-1 rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">Convert to order →</button>}
            </div>
          );
        })}
        {quotes.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No quotes yet.</p>}
      </div>
    </section>
  );
}

function DocPanel({ customerId, docs, todayIso, pending, run, actions }: { customerId: string; docs: TL["docs"]; todayIso: string; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("agreement");
  const [issuer, setIssuer] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<{ dataUrl: string; name: string } | null>(null);

  const onFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (f.size > 2 * 1024 * 1024) { alert("File must be under 2MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setFile({ dataUrl: String(reader.result), name: f.name });
    reader.readAsDataURL(f);
  };
  const save = () => {
    if (!name.trim()) return;
    run(() => actions.attachDocumentAction({ customerId, name, category, issuer, expiresAt: expiresAt || null, fileDataUrl: file?.dataUrl ?? null, fileName: file?.name ?? "" }));
    setName(""); setIssuer(""); setExpiresAt(""); setFile(null); setAdding(false);
  };
  const status = (d: TL["docs"][number]) => {
    if (!d.expiresAt) return null;
    if (d.expiresAt < todayIso) return { text: "expired", tone: "bg-red-100 text-red-800" };
    const soon = new Date(new Date(`${todayIso}T00:00:00Z`).getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    return d.expiresAt <= soon ? { text: "renew soon", tone: "bg-amber-100 text-amber-900" } : { text: `to ${d.expiresAt}`, tone: "bg-slate-100 text-slate-500" };
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Documents &amp; agreements</h2>
        <button type="button" onClick={() => setAdding((a) => !a)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">{adding ? "Cancel" : "+ Attach"}</button>
      </div>
      {adding && (
        <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name (e.g. Signed distributor agreement)" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm">{DOC_CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} title="Expiration / renewal date" className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Issuer / signer (optional)" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input type="file" accept="application/pdf,image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="w-full text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs" />
          <button type="button" disabled={pending || !name.trim()} onClick={save} className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Attach to {customerId}</button>
        </div>
      )}
      <div className="space-y-1.5">
        {docs.map((d) => {
          const st = status(d);
          return (
            <div key={d.id} className="rounded-lg border border-slate-100 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">{d.name}</span>
                {st && <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${st.tone}`}>{st.text}</span>}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                <span>{DOC_CATS.find((c) => c.key === d.category)?.label ?? d.category}</span>
                {d.signature === "signed" && <span className="text-emerald-600">✓ signed</span>}
                {d.signature === "sent" && <span className="text-amber-600">awaiting signature</span>}
                {d.fileDataUrl && <a href={d.fileDataUrl} download={d.fileName || d.name} className="ml-auto font-semibold text-emerald-700 hover:underline">Download</a>}
                <button type="button" disabled={pending} onClick={() => run(() => actions.removeDocumentAction(customerId, d.id))} className="text-slate-400 hover:text-red-600">Remove</button>
              </div>
            </div>
          );
        })}
        {docs.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No documents on file. Attach a signed agreement or COI.</p>}
      </div>
    </section>
  );
}

function AddComm({ customerId, pending, run, addCommAction }: { customerId: string; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; addCommAction: Actions["addCommAction"] }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"email" | "call" | "message" | "note">("note");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const add = () => { if (!subject.trim()) return; run(() => addCommAction({ customerId, channel, direction, subject, body })); setSubject(""); setBody(""); };
  return (
    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Log a message / call / note…" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Details (optional)" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
      <div className="flex items-center gap-1.5">
        <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="rounded border border-slate-300 px-1 py-1 text-[11px]"><option value="note">Note</option><option value="email">Email</option><option value="call">Call</option><option value="message">Message</option></select>
        <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className="rounded border border-slate-300 px-1 py-1 text-[11px]"><option value="out">Outgoing</option><option value="in">Incoming</option></select>
        <button type="button" disabled={pending || !subject.trim()} onClick={add} className="ml-auto rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Log</button>
      </div>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 font-semibold ${tone}`}>{label}</span>;
}
