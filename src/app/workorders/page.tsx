import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { listWorkOrders, listAudit, nextActions, REPAIR_ORDER } from "@/lib/state/workorder";
import { WorkOrderEngine } from "@/components/WorkOrderEngine";
import { createWorkOrderAction, executeAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkOrdersPage() {
  await requireSectionAccess("operations", "view");

  const orders = listWorkOrders().map((o) => ({ order: o, actions: nextActions(o), audit: listAudit(o.id).slice(0, 8) }));

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">The engine decides what can happen next</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Work orders</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          A repair order moves through a guarded lifecycle. Each step has requirements — approval needs recorded
          evidence, scheduling needs a free bay and technician, invoicing needs billable work. A person, a website
          form, and an AI handler all go through the <strong>same guarded operation</strong>; none can skip a step by
          flipping a status. Every action is idempotent and leaves an audit trail. <Link href="/platform" className="font-semibold text-emerald-700 hover:underline">See the state layer →</Link>
        </p>
      </header>

      {/* The lifecycle */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5 text-xs">
        {REPAIR_ORDER.states.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-slate-600">{s}</span>
            {i < REPAIR_ORDER.states.length - 1 && <span className="text-slate-300">→</span>}
          </span>
        ))}
      </div>

      <WorkOrderEngine orders={orders} createAction={createWorkOrderAction} executeAction={executeAction} />

      <p className="mt-6 text-xs text-slate-400">Related changes commit together (one atomic write); a retried request with the same key never double-applies. This is <code className="rounded bg-slate-100 px-1">src/lib/state/engine.ts</code> — the business-engine core.</p>
    </div>
  );
}
