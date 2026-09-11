"use client";

/**
 * Owner-facing automation rules — toggle, edit thresholds, add/delete rules, and
 * see exactly what each rule is firing on right now against live business data.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SIGNAL_KINDS, RULE_ACTIONS, type SignalKind, type RuleAction, type RuleOperator } from "@/lib/automation/model";
import type { AutomationOverview } from "@/lib/automation/load";
import type { ActionResult } from "@/app/automation/actions";

const KIND_ICON: Record<SignalKind, string> = {
  "document-expiring": "📄", "invoice-overdue": "⏰", "quote-pending": "🧾", "large-order": "💰", "customer-dormant": "😴",
};
const ACTION_ICON: Record<RuleAction, string> = { notify: "🔔", "create-task": "✅", flag: "🚩" };

interface Actions {
  addRuleAction: (form: { name: string; trigger: string; operator?: RuleOperator; threshold: number; action: string; channel?: string | null }) => Promise<ActionResult>;
  toggleRuleAction: (id: string, enabled: boolean) => Promise<ActionResult>;
  updateRuleAction: (id: string, patch: { threshold?: number; operator?: RuleOperator; action?: string }) => Promise<ActionResult>;
  removeRuleAction: (id: string) => Promise<ActionResult>;
}

export function AutomationRules({ overview, ...actions }: { overview: AutomationOverview } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) => start(async () => { const r = await fn(); setToast(r.ok ? "Saved" : r.error ?? "Failed"); router.refresh(); });

  const firedByRule = new Map(overview.fired.map((f) => [f.rule.id, f.matches]));

  return (
    <div className="space-y-4">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      <NewRule pending={pending} run={run} addRuleAction={actions.addRuleAction} />

      <ul className="space-y-2">
        {overview.rules.map((r) => {
          const matches = firedByRule.get(r.id) ?? [];
          const kind = SIGNAL_KINDS[r.trigger];
          return (
            <li key={r.id} className={`rounded-2xl border p-4 shadow-sm ${matches.length ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"} ${r.enabled ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{KIND_ICON[r.trigger]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    When <b>{kind.label.toLowerCase()}</b> is {r.operator === "gte" ? "at least" : "at most"}{" "}
                    <b>{r.threshold.toLocaleString()}</b> {kind.unit} → {ACTION_ICON[r.action]} {RULE_ACTIONS[r.action].label.toLowerCase()}
                  </p>
                </div>
                <label className="flex flex-none cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={r.enabled} disabled={pending} onChange={(e) => run(() => actions.toggleRuleAction(r.id, e.target.checked))} className="h-4 w-4 accent-emerald-600" />
                  {r.enabled ? "On" : "Off"}
                </label>
              </div>

              {/* Edit threshold + action inline */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Threshold</span>
                <input
                  type="number" defaultValue={r.threshold} disabled={pending}
                  onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== r.threshold) run(() => actions.updateRuleAction(r.id, { threshold: v })); }}
                  className="w-24 rounded border border-slate-300 px-2 py-1"
                />
                <span className="text-slate-400">{kind.unit}</span>
                <select value={r.action} disabled={pending} onChange={(e) => run(() => actions.updateRuleAction(r.id, { action: e.target.value }))} className="rounded border border-slate-300 px-2 py-1">
                  {Object.entries(RULE_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button type="button" disabled={pending} onClick={() => run(() => actions.removeRuleAction(r.id))} className="ml-auto text-slate-400 hover:text-red-600">Delete</button>
              </div>

              {/* What it's firing on right now */}
              {matches.length > 0 && (
                <div className="mt-3 rounded-lg bg-white/70 p-3 ring-1 ring-amber-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Firing on {matches.length} item{matches.length === 1 ? "" : "s"}</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                    {matches.slice(0, 6).map((m, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          {m.href ? <Link href={m.href} className="font-medium hover:text-emerald-700">{m.entityLabel}</Link> : <span className="font-medium">{m.entityLabel}</span>}
                          <span className="text-slate-400"> — {m.detail}</span>
                        </span>
                        <span className="flex-none tabular-nums text-slate-400">{m.value.toLocaleString()} {kind.unit.split(" ")[0]}</span>
                      </li>
                    ))}
                    {matches.length > 6 && <li className="text-slate-400">+ {matches.length - 6} more…</li>}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
        {overview.rules.length === 0 && <li className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">No rules yet — add one above.</li>}
      </ul>
    </div>
  );
}

function NewRule({ pending, run, addRuleAction }: { pending: boolean; run: (fn: () => Promise<ActionResult>) => void; addRuleAction: Actions["addRuleAction"] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<SignalKind>("document-expiring");
  const [threshold, setThreshold] = useState("30");
  const [action, setAction] = useState<RuleAction>("notify");

  const save = () => {
    if (!name.trim()) return;
    run(() => addRuleAction({ name, trigger, operator: SIGNAL_KINDS[trigger].defaultOperator, threshold: Math.round(Number(threshold) || 0), action }));
    setName(""); setThreshold("30"); setOpen(false);
  };

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">+ New rule</button>;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this rule (e.g. Warn me before a permit expires)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">When</span>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as SignalKind)} className="rounded border border-slate-300 px-2 py-1.5">
          {Object.entries(SIGNAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-slate-500">is {SIGNAL_KINDS[trigger].defaultOperator === "gte" ? "at least" : "at most"}</span>
        <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1.5" />
        <span className="text-slate-500">{SIGNAL_KINDS[trigger].unit}, then</span>
        <select value={action} onChange={(e) => setAction(e.target.value as RuleAction)} className="rounded border border-slate-300 px-2 py-1.5">
          {Object.entries(RULE_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-400">{SIGNAL_KINDS[trigger].help}</p>
      <div className="flex gap-2">
        <button type="button" disabled={pending || !name.trim()} onClick={save} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Add rule</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 ring-1 ring-slate-200">Cancel</button>
      </div>
    </div>
  );
}
