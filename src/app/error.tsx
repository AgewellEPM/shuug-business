"use client";

/** Route error boundary — a calm, actionable screen instead of a raw 500. */
import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side breadcrumb; server errors are logged server-side with the digest.
    console.error(JSON.stringify({ level: "error", msg: "route_error", digest: error.digest, name: error.name }));
  }, [error]);

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-3xl">⚠️</p>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-500">This page hit an error. Your data is safe. Try again, or head home.</p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-slate-400">Ref: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Try again</button>
        <Link href="/" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">Home</Link>
      </div>
    </div>
  );
}
