"use client";

/**
 * A Handler's page — the six things an owner needs: what it handles, what it's allowed
 * to do (with per-capability grants + which need connecting), when it asks first, what
 * it did today, how well it's performing (benchmark-derived, honestly labeled), and a
 * clear Off / Approval-required / On control with Pause. Simple, not an agent builder.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Handler, HandlerTemplate, HandlerPerformance, HandlerActivity, HandlerMode } from "@/lib/handlers/model";
import type { CapabilityStatus } from "@/lib/handlers/load";
import type { Opportunity } from "@/lib/handlers/runtime";
import type { ActionResult } from "@/app/handlers/actions";

interface Actions {
  setModeAction: (id: string, mode: HandlerMode) => Promise<ActionResult>;
  setCapabilitiesAction: (id: string, caps: string[]) => Promise<ActionResult>;
  removeHandlerAction: (id: string) => Promise<ActionResult>;
  previewAction: (templateId: string) => Promise<{ ok: boolean; opportunities?: Opportunity[]; error?: string }>;
}

const MODES: { mode: HandlerMode; label: string; help: string }[] = [
  { mode: "off", label: "Off", help: "Not running." },
  { mode: "ask", label: "Approval required", help: "Proposes actions; you approve each." },
  { mode: "on", label: "On", help: "Acts within what you allow." },
];

export function HandlerDetail({ handler, template, capabilityStatuses, performance, activity, opportunities, ...actions }: {
  handler: Handler; template: HandlerTemplate; capabilityStatuses: CapabilityStatus[]; performance: HandlerPerformance; activity: HandlerActivity[]; opportunities: Opportunity[];
} & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [granted, setGranted] = useState<string[]>(handler.grantedCapabilities);
  const [live, setLive] = useState<Opportunity[]>(opportunities);

  const run = (fn: () => Promise<ActionResult>) => start(async () => { const r = await fn(); setToast(r.ok ? "Saved" : r.error ?? "Failed"); router.refresh(); });
  const toggleCap = (capId: string) => {
    const next = granted.includes(capId) ? granted.filter((c) => c !== capId) : [...granted, capId];
    setGranted(next);
    run(() => actions.setCapabilitiesAction(handler.id, next));
  };
  const refresh = () => start(async () => { const r = await actions.previewAction(template.id); if (r.ok) setLive(r.opportunities ?? []); });

  const anyChannelMissing = capabilityStatuses.some((s) => s.capability.kind === "channel" && !s.available);

  return (
    <div className="space-y-5">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      {/* Mode control */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Status</h2>
            <p className="text-xs text-slate-500">{MODES.find((m) => m.mode === handler.mode)?.help}</p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {MODES.map((m) => (
              <button key={m.mode} type="button" disabled={pending} onClick={() => run(() => actions.setModeAction(handler.id, m.mode))} className={`rounded-md px-3 py-1.5 font-semibold ${handler.mode === m.mode ? (m.mode === "on" ? "bg-emerald-600 text-white" : m.mode === "ask" ? "bg-amber-500 text-white" : "bg-white text-slate-900 shadow-sm") : "text-slate-500"}`}>{m.label}</button>
            ))}
          </div>
        </div>
        {handler.mode === "on" && anyChannelMissing && <p className="mt-2 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-800">Some outbound channels aren&apos;t connected yet — it will act on internal steps and hold anything needing that channel. <Link href="/integrations" className="font-semibold underline">Connect them →</Link></p>}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* What it handles + allowed to do */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">What it handles</h2>
          <ul className="mb-4 space-y-1 text-sm text-slate-700">{template.canDo.map((d, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-600">✓</span> {d}</li>)}</ul>

          <h2 className="mb-2 text-sm font-semibold text-slate-900">What it&apos;s allowed to do</h2>
          <p className="mb-2 text-xs text-slate-400">Toggle any capability. Greyed items need connecting first.</p>
          <div className="space-y-1.5">
            {capabilityStatuses.map(({ capability, available }) => (
              <label key={capability.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${available ? "border-slate-100" : "border-slate-100 bg-slate-50 opacity-70"}`}>
                <input type="checkbox" checked={granted.includes(capability.id)} disabled={pending || !available} onChange={() => toggleCap(capability.id)} className="h-4 w-4 accent-emerald-600" />
                <span className="flex-1 text-slate-700">{capability.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${capability.kind === "channel" ? "bg-sky-100 text-sky-700" : capability.kind === "action" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>{capability.kind}</span>
                {!available && <Link href="/integrations" className="text-[11px] font-semibold text-amber-600">connect</Link>}
              </label>
            ))}
          </div>
        </section>

        {/* Asks / escalates + performance */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">When it asks you</h2>
            <ul className="space-y-0.5 text-sm text-amber-800">{template.asksFirst.map((x, i) => <li key={i}>• {x}</li>)}</ul>
            <h2 className="mb-2 mt-3 text-sm font-semibold text-slate-900">When it hands off to a person</h2>
            <ul className="space-y-0.5 text-sm text-slate-600">{template.escalates.map((x, i) => <li key={i}>• {x}</li>)}</ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">How well it&apos;s performing</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Autonomy" value={`${performance.autonomyPct}%`} />
              <Metric label="Handled" value={String(performance.received)} />
              <Metric label="Escalated" value={String(performance.escalated)} />
              <Metric label="Autonomous" value={String(performance.autonomous)} tone="text-emerald-700" />
              <Metric label="Failed" value={String(performance.failed)} tone={performance.failed > 0 ? "text-red-600" : undefined} />
              <Metric label="Hours saved" value={`~${performance.hoursSavedEstimate}`} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Hours saved is an <em>estimate</em> from a documented human baseline ({template.baselineMinutesPerRequest} min/request) × verified autonomous completions — not a guess.</p>
          </section>
        </div>
      </div>

      {/* What it did / could do today */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">What it&apos;s handling now</h2>
          <button type="button" disabled={pending} onClick={refresh} className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">Refresh</button>
        </div>
        {live.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing waiting right now — it picks work up as it comes in.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {live.map((o, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="min-w-0 truncate text-slate-700"><b>{o.label}</b> <span className="text-slate-400">— {o.detail}</span></span>
                {o.href && <Link href={o.href} className="flex-none text-xs font-semibold text-emerald-700 hover:underline">open</Link>}
              </li>
            ))}
          </ul>
        )}
        {activity.length > 0 && (
          <>
            <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent activity</h3>
            <ul className="space-y-0.5 text-xs text-slate-500">{activity.slice(0, 10).map((a) => <li key={a.id}>{a.at.slice(0, 10)} · <span className="font-medium">{a.outcome}</span> — {a.summary}</li>)}</ul>
          </>
        )}
      </section>

      <div className="flex justify-end">
        <button type="button" disabled={pending} onClick={() => run(() => actions.removeHandlerAction(handler.id))} className="text-xs text-slate-400 hover:text-red-600">Delete this Handler</button>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2">
      <p className={`text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
