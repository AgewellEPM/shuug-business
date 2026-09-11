"use client";

/** Payroll (ADP) status + one-click sync of the roster. Fail-closed UI. */
import { useState, useTransition } from "react";
import Link from "next/link";

export function PayrollPanel({
  status,
  syncAction,
}: {
  status: { configured: boolean; detail: string };
  syncAction: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">ADP</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Payroll · ADP Workforce Now</p>
          <p className="text-xs text-slate-500">{status.detail}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
          {status.configured ? "Connected" : "Not connected"}
        </span>
        {status.configured ? (
          <button type="button" disabled={pending} onClick={() => start(async () => setMsg((await syncAction()).message))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            {pending ? "Syncing…" : "Sync team to ADP"}
          </button>
        ) : (
          <Link href="/settings" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">Connect in Settings →</Link>
        )}
      </div>
      {msg && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{msg}</p>}
    </section>
  );
}
