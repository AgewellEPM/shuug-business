"use client";

/**
 * Integrations hub — connect anything in three steps: ① open the provider's real API
 * page, ② copy your key(s), ③ paste here and save. Hub-managed connectors (GoDaddy,
 * Twilio, PayPal…) save straight to the secure vault; framework-managed ones (Shopify,
 * Stripe, QuickBooks…) hand off to Settings for their OAuth/validation. Fail-closed.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { IntegrationSpec, IntegrationCategory } from "@/lib/integrations/registry";
import type { ActionResult } from "@/app/integrations/actions";

interface Card { spec: IntegrationSpec; configured: boolean; connected: boolean }
interface Group { cat: IntegrationCategory; items: Card[] }
interface Actions {
  connectAction: (id: string, input: Record<string, string>) => Promise<ActionResult>;
  disconnectAction: (id: string) => Promise<ActionResult>;
}

const keyLabel = (k: string) => k.replace(/^[A-Z]+_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function IntegrationsHub({ groups, ...actions }: { groups: Group[] } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult>, after?: () => void) => start(async () => {
    const r = await fn(); setToast(r.message);
    if (r.ok && after) after();
    router.refresh();
  });

  return (
    <div className="space-y-6">
      {/* 1-2-3 explainer */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Connecting an app is 1‑2‑3</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Step n="1" title="Open its API page" body="We take you straight to the provider's keys page." />
          <Step n="2" title="Copy your key" body="Grab the API key or token they show you." />
          <Step n="3" title="Paste &amp; save" body="Drop it in here — stored encrypted, fail-closed." />
        </div>
      </div>

      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      {groups.map((g) => (
        <section key={g.cat}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.cat}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {g.items.map(({ spec, connected }) => (
              <div key={spec.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{spec.icon ?? "🔌"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{spec.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{connected ? "Connected" : "Not connected"}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{spec.blurb}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button type="button" onClick={() => setOpen(open === spec.id ? null : spec.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">{open === spec.id ? "Close" : connected ? "Reconnect" : "+ Add API"}</button>
                  {connected && spec.managedBy === "hub" && <button type="button" disabled={pending} onClick={() => run(() => actions.disconnectAction(spec.id))} className="text-xs text-slate-400 hover:text-red-600">Disconnect</button>}
                  {spec.docsUrl && <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold text-slate-400 hover:text-emerald-700">Open API page ↗</a>}
                </div>

                {open === spec.id && (
                  <StepPanel spec={spec} pending={pending} onSave={(vals) => run(() => actions.connectAction(spec.id, vals), () => setOpen(null))} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-white/70 p-2">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{n}</span>
      <div><p className="text-xs font-semibold text-slate-800">{title}</p><p className="text-[11px] text-slate-500">{body}</p></div>
    </div>
  );
}

/** The 1-2-3 connect panel — for both hub-managed (saves here) and settings-managed (hands to Settings). */
function StepPanel({ spec, pending, onSave }: { spec: IntegrationSpec; pending: boolean; onSave: (vals: Record<string, string>) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries((spec.keys ?? []).map((k) => [k, ""])));
  const filled = (spec.keys ?? []).every((k) => vals[k]?.trim());
  const isHub = spec.managedBy === "hub";

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      {/* Step 1 */}
      <div className="flex items-center gap-2">
        <Num n="1" />
        {spec.docsUrl ? (
          <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-black">Open {spec.name} API page ↗</a>
        ) : (
          <span className="flex-1 text-xs text-slate-500">Point events at any HTTPS endpoint you control.</span>
        )}
      </div>

      {/* Step 2 */}
      <div className="flex items-start gap-2">
        <Num n="2" />
        <p className="text-xs text-slate-600">On that page, create or copy your {isHub ? spec.keys?.map(keyLabel).join(" + ") : "API key / token"}. Keep the tab open.</p>
      </div>

      {/* Step 3 */}
      <div className="flex items-start gap-2">
        <Num n="3" />
        <div className="flex-1">
          {isHub ? (
            <div className="space-y-2">
              {(spec.keys ?? []).map((k) => (
                <label key={k} className="block text-xs">
                  <span className="mb-0.5 block font-medium text-slate-600">{keyLabel(k)} <span className="font-normal text-slate-400">({k})</span></span>
                  <input type="password" autoComplete="off" value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} placeholder={`Paste ${keyLabel(k)} here`} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
              ))}
              <button type="button" disabled={pending || !filled} onClick={() => onSave(vals)} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Paste &amp; connect</button>
              <p className="text-[11px] text-slate-400">Stored encrypted in your workspace vault. Fail-closed — nothing is sent to {spec.name} until verified.</p>
            </div>
          ) : (
            <div className="text-xs text-slate-600">
              <p>Paste your key on the connection screen and hit test.</p>
              <Link href="/settings" className="mt-1.5 inline-block rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700">Finish in Settings →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Num({ n }: { n: string }) {
  return <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{n}</span>;
}
