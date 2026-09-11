import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadAutomation } from "@/lib/automation/load";
import { AutomationRules } from "@/components/AutomationRules";
import { addRuleAction, toggleRuleAction, updateRuleAction, removeRuleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  await requireSectionAccess("admin", "view");

  const overview = await loadAutomation();
  const { summary } = overview;

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Set it once, let it run</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Automation rules</h1>
        <p className="mt-2 text-sm text-slate-500">
          Tell the system what matters — “warn me before insurance lapses,” “chase invoices past 15 days” — and it
          watches the whole business for you. Rules are checked against live data every time you open this page.
        </p>
      </header>

      <Link href="/setup#automate" className="dd-card mb-5 block border-emerald-200"><span className="font-semibold">Website request workflows →</span><span className="mt-1 block text-sm text-slate-600">Draft a follow-up, preview each step, test it, then enable tasks and optional Slack/Zapier delivery.</span></Link>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rules" value={String(summary.totalRules)} />
        <Stat label="Active" value={String(summary.enabledRules)} />
        <Stat label="Firing now" value={String(summary.firedRules)} tone={summary.firedRules > 0 ? "text-amber-700" : undefined} />
        <Stat label="Items to act on" value={String(summary.actionsQueued)} tone={summary.actionsQueued > 0 ? "text-amber-700" : undefined} />
      </div>

      <AutomationRules
        overview={overview}
        addRuleAction={addRuleAction}
        toggleRuleAction={toggleRuleAction}
        updateRuleAction={updateRuleAction}
        removeRuleAction={removeRuleAction}
      />

      <p className="mt-6 text-xs text-slate-400">
        These rules detect and display matching signals when this page loads. They do not execute outbound delivery or create persisted tasks. Use <Link href="/setup#automate" className="font-semibold text-emerald-700 hover:underline">website workflows</Link> for supported task creation and Slack/Zapier delivery. <Link href="/api/v1/automation" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
