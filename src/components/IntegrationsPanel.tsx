"use client";

/**
 * IntegrationsPanel — Shopify + QuickBooks connection cards with live actions
 * (test Shopify, run the Shopify→QuickBooks sync). Connect QuickBooks is a plain
 * link to the OAuth start route.
 */
import { useState, useTransition } from "react";
import type { IntegrationStatus } from "@/lib/integrations/config";
import type { TestResult, RunSyncResult } from "@/app/settings/actions";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-300"}`}
      aria-hidden
    />
  );
}

export function IntegrationsPanel({
  statuses,
  testShopify,
  runSync,
}: {
  statuses: IntegrationStatus[];
  testShopify: () => Promise<TestResult>;
  runSync: () => Promise<RunSyncResult>;
}) {
  const shopify = statuses.find((s) => s.kind === "shopify")!;
  const qbo = statuses.find((s) => s.kind === "quickbooks")!;

  const [pending, startTransition] = useTransition();
  const [shopifyMsg, setShopifyMsg] = useState<TestResult | null>(null);
  const [sync, setSync] = useState<RunSyncResult | null>(null);

  const canSync = shopify.connected && qbo.connected;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Shopify */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Shopify</h3>
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <StatusDot ok={shopify.connected} />
              {shopify.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mb-3 text-sm text-slate-500">{shopify.detail}</p>
          <button
            type="button"
            disabled={!shopify.configured || pending}
            onClick={() =>
              startTransition(async () => setShopifyMsg(await testShopify()))
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Test connection
          </button>
          {shopifyMsg && (
            <p className={`mt-2 text-sm ${shopifyMsg.ok ? "text-emerald-700" : "text-red-700"}`}>
              {shopifyMsg.message}
            </p>
          )}
        </div>

        {/* QuickBooks */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">QuickBooks Online</h3>
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <StatusDot ok={qbo.connected} />
              {qbo.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mb-3 text-sm text-slate-500">{qbo.detail}</p>
          <a
            href="/api/quickbooks/connect"
            className={`inline-block rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition ${
              qbo.configured ? "bg-emerald-600 hover:bg-emerald-700" : "pointer-events-none bg-slate-300"
            }`}
          >
            {qbo.connected ? "Reconnect" : "Connect QuickBooks"}
          </a>
        </div>
      </div>

      {/* Sync */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Sync Shopify → QuickBooks</h3>
            <p className="text-sm text-slate-500">
              Pull recent Shopify orders and create a QuickBooks invoice for each, labeled by customer.
            </p>
          </div>
          <button
            type="button"
            disabled={!canSync || pending}
            onClick={() => startTransition(async () => setSync(await runSync()))}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Syncing…" : "Run sync"}
          </button>
        </div>
        {!canSync && (
          <p className="mt-2 text-sm text-amber-700">
            Connect both Shopify and QuickBooks to enable sync.
          </p>
        )}
        {sync && (
          <div className="mt-3">
            <p className={`text-sm font-medium ${sync.ok ? "text-emerald-700" : "text-red-700"}`}>
              {sync.message}
            </p>
            {sync.result && (
              <ul className="mt-2 space-y-1 text-sm">
                {sync.result.results.map((r, i) => (
                  <li key={i} className={r.ok ? "text-slate-600" : "text-red-600"}>
                    {r.ok ? "✓" : "✕"} {r.order}
                    {r.invoiceId ? ` → invoice ${r.invoiceId}` : ""}
                    {r.message ? ` — ${r.message}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
