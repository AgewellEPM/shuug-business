"use client";

/**
 * RouteOptimizer — an "optimize this run" button for one territory. Calls the
 * server action (Google Routes), then shows the driving order + totals, or the
 * fail-closed message when Maps isn't connected. No map key ever reaches the client.
 */
import { useState, useTransition } from "react";
import type { OptimizedRoute } from "@/app/distribution/actions";

export function RouteOptimizer({
  region,
  optimizeAction,
}: {
  region: string;
  optimizeAction: (region: string) => Promise<OptimizedRoute>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<OptimizedRoute | null>(null);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await optimizeAction(region)))}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
      >
        {pending ? "Planning…" : "Optimize this run"}
      </button>

      {result && !result.ok && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{result.message}</p>
      )}

      {result?.ok && result.ordered && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">
            Best driving order · <strong className="text-slate-800">{result.miles} mi</strong> · ~{result.minutes} min · round trip
          </p>
          <ol className="space-y-1">
            {result.ordered.map((s, i) => (
              <li key={`${s.company}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">{i + 1}</span>
                <span className="font-medium text-slate-800">{s.company}</span>
                <span className="ml-auto truncate text-xs text-slate-400">{s.address}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
