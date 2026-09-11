"use client";

/**
 * BillingClient — for each order, create a Stripe card-payment link and verify
 * payment. Bulk orders are flagged so you can charge them the moment they land.
 */
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import type { ChargeResult, StatusResult } from "@/app/billing/actions";

export interface BillingOrderRow {
  id: string;
  company: string;
  bulk: boolean;
  totalCents: number;
  paymentStatus: string | null; // "pending" | "paid" | "canceled" | null
  payUrl: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-900",
  canceled: "bg-slate-200 text-slate-600",
};

export function BillingClient({
  orders,
  stripeConfigured,
  localDbOn = false,
  chargeAction,
  checkAction,
}: {
  orders: BillingOrderRow[];
  stripeConfigured: boolean;
  localDbOn?: boolean;
  chargeAction: (orderId: string) => Promise<ChargeResult>;
  checkAction: (orderId: string) => Promise<StatusResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  function charge(id: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await chargeAction(id);
      setMsg(res.message);
      if (res.ok && res.url) {
        setLinks((p) => ({ ...p, [id]: res.url! }));
        if (typeof window !== "undefined") window.open(res.url, "_blank", "noopener");
      }
    });
  }
  function check(id: string) {
    setMsg(null);
    startTransition(async () => setMsg((await checkAction(id)).message));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
        🔒 <strong className="text-slate-800">Card numbers are never stored on this computer.</strong>{" "}
        The customer enters their card on Stripe&apos;s secure page — we only keep the payment
        status.{" "}
        {localDbOn
          ? "Your other records are saved in an encrypted local database (unreadable without your passphrase)."
          : "Turn on the local encrypted database in setup to keep all other records on this machine, crypto-encoded."}
      </div>
      {!stripeConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Card payments aren&apos;t connected yet. Add your <code>STRIPE_SECRET_KEY</code> to charge cards.
        </p>
      )}
      {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{msg}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Orders — take payment</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-400">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => {
              const status = o.paymentStatus;
              const url = links[o.id] ?? o.payUrl;
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <span className="font-medium text-slate-800">{o.id}</span>
                    {o.bulk && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">bulk</span>}
                    <span className="ml-2 text-slate-500">{o.company}</span>
                    <span className="ml-2 tabular-nums text-slate-700">{formatCents(o.totalCents)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {status && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</span>}
                    {url && status !== "paid" && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Open pay link ↗</a>
                    )}
                    {status !== "paid" && (
                      <button type="button" onClick={() => charge(o.id)} disabled={!stripeConfigured || pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                        {url ? "New link" : "Charge card"}
                      </button>
                    )}
                    {url && status !== "paid" && (
                      <button type="button" onClick={() => check(o.id)} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Check</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
