"use client";

/**
 * The one-question console. Owner types a wish → Shuug proposes a Handler ("I can set
 * up an Appointment Handler that can: …") with what it does, what it asks first, and
 * where it escalates → owner can preview real work it would do now, then create it.
 * Creating never turns it on — it lands in "Approval required".
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Proposal } from "@/lib/handlers/compiler";
import type { Opportunity } from "@/lib/handlers/runtime";

interface Actions {
  compileWishAction: (wish: string) => Promise<{ ok: boolean; proposal?: Proposal; error?: string }>;
  previewAction: (templateId: string) => Promise<{ ok: boolean; opportunities?: Opportunity[]; error?: string }>;
  createHandlerAction: (templateId: string) => Promise<{ ok: boolean; error?: string; id?: string }>;
}

const EXAMPLES = [
  "Answer the phone and book appointments",
  "I hate chasing invoices",
  "Customers keep asking where their order is",
  "Make sure we never run out of ingredients",
  "Answer wholesale inquiries",
];

export function HandlersConsole({ aiEnabled, aiLabel, ...actions }: { aiEnabled: boolean; aiLabel: string } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [wish, setWish] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [opps, setOpps] = useState<Opportunity[] | null>(null);

  const ask = async (text?: string) => {
    const q = (text ?? wish).trim();
    if (q.length < 3) return;
    if (text) setWish(text);
    setBusy(true); setError(null); setProposal(null); setOpps(null);
    const r = await actions.compileWishAction(q);
    setBusy(false);
    if (!r.ok || !r.proposal) { setError(r.error ?? "Couldn't match that."); return; }
    setProposal(r.proposal);
  };

  const preview = async () => {
    if (!proposal) return;
    setBusy(true);
    const r = await actions.previewAction(proposal.templateId);
    setBusy(false);
    setOpps(r.ok ? r.opportunities ?? [] : []);
  };

  const create = () => {
    if (!proposal) return;
    start(async () => { const r = await actions.createHandlerAction(proposal.templateId); if (r.ok && r.id) router.push(`/handlers/${r.id}`); else setError(r.error ?? "Could not create."); });
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={wish} onChange={(e) => setWish(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="e.g. answer the phone and book appointments while I'm under a car"
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm shadow-sm focus:border-emerald-400 focus:outline-none"
        />
        <button type="button" disabled={busy || wish.trim().length < 3} onClick={() => ask()} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-emerald-700">{busy ? "Thinking…" : "Build it"}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => ask(e)} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200 hover:text-slate-800">{e}</button>)}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{aiEnabled ? `Understood by ${aiLabel} + keyword matching.` : "Keyword matching (connect an AI model for looser phrasing)."}</p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {proposal && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-5">
          <p className="text-lg font-semibold text-slate-900">{proposal.icon} {proposal.intro}</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {proposal.canDo.map((d, i) => <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700"><span className="text-emerald-600">✓</span> {d}</li>)}
          </ul>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Box title="It asks you first" tone="text-amber-700" items={proposal.asksFirst} />
            <Box title="It escalates to a person" tone="text-slate-600" items={proposal.escalates} />
          </div>

          {opps && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">What it could handle right now ({opps.length})</p>
              {opps.length === 0 ? <p className="mt-1 text-xs text-slate-400">Nothing waiting at the moment — it&apos;ll pick things up as they come in.</p>
                : <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{opps.slice(0, 6).map((o, i) => <li key={i}>• <b>{o.label}</b> — {o.detail}</li>)}</ul>}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={preview} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Test it →</button>
            <button type="button" disabled={pending} onClick={create} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Set it up (approval required)</button>
            <span className="text-xs text-slate-400">It won&apos;t act on its own until you review permissions and turn it on.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Box({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{items.map((x, i) => <li key={i}>• {x}</li>)}</ul>
    </div>
  );
}
