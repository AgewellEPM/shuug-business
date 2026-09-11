"use client";

/**
 * Work-order engine UI. Fill the evidence a step needs, then take a guarded action.
 * The engine re-checks on submit and reports exactly what passed or failed; the audit
 * trail shows who did what and what was verified. This is the same operation a website
 * form or an AI handler would call — the UI is just one actor.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import type { WorkOrder, AuditRecord } from "@/lib/state/workorder";
import type { TransitionDecision } from "@/lib/state/engine";
import type { ActionResult, ExecActionResult } from "@/app/workorders/actions";

interface OrderView { order: WorkOrder; actions: TransitionDecision[]; audit: AuditRecord[] }
interface Props {
  orders: OrderView[];
  createAction: (customerName: string, service: string) => Promise<ActionResult>;
  executeAction: (orderId: string, transitionId: string, patch: Record<string, string | number>, idempotencyKey?: string) => Promise<ExecActionResult>;
}

const STATE_TONE: Record<string, string> = {
  requested: "bg-slate-100 text-slate-600", estimated: "bg-sky-100 text-sky-800", approved: "bg-indigo-100 text-indigo-800",
  scheduled: "bg-amber-100 text-amber-900", "in-progress": "bg-orange-100 text-orange-900", completed: "bg-emerald-100 text-emerald-800", invoiced: "bg-emerald-600 text-white",
};

export function WorkOrderEngine({ orders, ...actions }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [evidence, setEvidence] = useState<Record<string, Record<string, string>>>({});

  const setEv = (orderId: string, k: string, v: string) => setEvidence((e) => ({ ...e, [orderId]: { ...e[orderId], [k]: v } }));
  const create = () => { if (!name.trim() || !service.trim()) return; start(async () => { const r = await actions.createAction(name, service); setToast(r.ok ? "Work order created" : r.error ?? "Failed"); if (r.ok) { setName(""); setService(""); } router.refresh(); }); };

  const run = (orderId: string, transitionId: string) => start(async () => {
    const ev = evidence[orderId] ?? {};
    const patch: Record<string, string | number> = {};
    if (ev.estimate) patch.estimateCents = Math.round((Number(ev.estimate) || 0) * 100);
    if (ev.approvedBy) patch.approvedBy = ev.approvedBy;
    if (ev.scheduledFor) patch.scheduledFor = ev.scheduledFor;
    if (ev.technicianId) patch.technicianId = ev.technicianId;
    if (ev.invoiceRef) patch.invoiceRef = ev.invoiceRef;
    const r = await actions.executeAction(orderId, transitionId, patch);
    setToast(r.ok ? `✓ ${r.decision?.label ?? transitionId} → ${r.decision?.to}` : `✗ Blocked: ${r.decision?.blockedReason ?? r.error ?? "not allowed"}`);
    router.refresh();
  });

  return (
    <div className="space-y-5">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      {/* Create */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">New work order</h2>
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer (e.g. Alex)" className="w-48 rounded border border-slate-300 px-3 py-2 text-sm" />
          <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Work (e.g. Front brakes)" className="min-w-[200px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" disabled={pending || !name.trim() || !service.trim()} onClick={create} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Create</button>
        </div>
      </section>

      {orders.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">No work orders yet. Create one and drive it through the lifecycle.</p>}

      {orders.map(({ order, actions: acts, audit }) => (
        <section key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{order.customerName} · <span className="font-normal text-slate-500">{order.service}</span></p>
              <p className="text-[11px] text-slate-400">{order.estimateCents > 0 && `${formatCents(order.estimateCents)} · `}{order.approvedBy && `approved by ${order.approvedBy} · `}{order.scheduledFor && `${order.scheduledFor} · `}{order.technicianId && `tech ${order.technicianId}`}</p>
            </div>
            <span className={`flex-none rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${STATE_TONE[order.state] ?? "bg-slate-100"}`}>{order.state}</span>
          </div>

          {/* Evidence the next steps need */}
          {order.state !== "invoiced" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {order.state === "requested" && <Field label="Estimate $" v={evidence[order.id]?.estimate ?? ""} onChange={(x) => setEv(order.id, "estimate", x)} />}
              {order.state === "estimated" && <Field label="Approved by (evidence)" v={evidence[order.id]?.approvedBy ?? ""} onChange={(x) => setEv(order.id, "approvedBy", x)} />}
              {order.state === "approved" && <Field label="Scheduled for" v={evidence[order.id]?.scheduledFor ?? ""} onChange={(x) => setEv(order.id, "scheduledFor", x)} placeholder="2026-09-11 10:00" />}
              {order.state === "scheduled" && <Field label="Technician" v={evidence[order.id]?.technicianId ?? ""} onChange={(x) => setEv(order.id, "technicianId", x)} />}
            </div>
          )}

          {/* Guarded actions */}
          <div className="mt-3 space-y-1.5">
            {acts.map((d) => (
              <div key={d.transitionId} className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={pending} onClick={() => run(order.id, d.transitionId)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{d.label} → {d.to}</button>
                <span className="flex flex-wrap gap-1.5">
                  {d.checks.map((c) => (
                    <span key={c.guardId} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`} title={c.reason}>{c.passed ? "✓" : "✗"} {c.label}</span>
                  ))}
                  {d.checks.length === 0 && <span className="text-[11px] text-slate-400">no preconditions</span>}
                </span>
              </div>
            ))}
            {acts.length === 0 && <p className="text-xs text-emerald-700">Lifecycle complete — invoiced.</p>}
          </div>

          {/* Audit trail */}
          {audit.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-400">Audit trail ({audit.length})</summary>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                {audit.map((a) => (
                  <li key={a.id}>
                    <span className={a.allowed ? "text-emerald-700" : "text-red-600"}>{a.allowed ? "✓" : "✗"}</span> {a.at.slice(0, 16).replace("T", " ")} · <b>{a.actor}</b> · {a.operation} {a.from}→{a.to}
                    {!a.allowed && a.checks.find((c) => !c.passed) && <span className="text-red-500"> — {a.checks.find((c) => !c.passed)!.reason}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

function Field({ label, v, onChange, placeholder }: { label: string; v: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="text-xs">
      <span className="mb-0.5 block font-medium text-slate-600">{label}</span>
      <input value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-44 rounded border border-slate-300 px-2 py-1.5 text-sm" />
    </label>
  );
}
