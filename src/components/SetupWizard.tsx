"use client";

/**
 * SetupWizard — paste your website, hit go. We trace your business, pull your
 * products & prices, spot where you sell online, and hand you a plain-language
 * analyst read. Built for paste-and-enter — no technical skill.
 */
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import type { BusinessProfile } from "@/lib/onboarding/trace";
import type { AnalyzeResult } from "@/app/setup/actions";

export function SetupWizard({
  initial,
  traceAction,
}: {
  initial: BusinessProfile | null;
  traceAction: (url: string) => Promise<AnalyzeResult>;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [profile, setProfile] = useState<BusinessProfile | null>(initial);
  const [summary, setSummary] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go() {
    if (!url.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await traceAction(url);
      if (res.ok && res.profile) {
        setProfile(res.profile);
        setSummary(res.summary);
      } else {
        setError(res.error ?? "Couldn't read that site");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="mb-2 block text-base font-semibold text-slate-800">
          Paste your website address
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="yourshop.com"
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={go}
            disabled={pending}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {pending ? "Reading your site…" : "Set up my business"}
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-500">We&apos;ll find your products, prices, and where you sell online. Nothing to configure.</p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      </section>

      {profile && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{profile.platform}</span>
            </div>
            {profile.description && <p className="mt-1 text-slate-600">{profile.description}</p>}
            {summary && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Your analyst</p>
                {summary}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Your products ({profile.products.length})
            </h2>
            {profile.products.length === 0 ? (
              <p className="text-sm text-slate-400">
                We couldn&apos;t auto-detect products on that page. You can still add them by hand, or
                paste a link to your shop/products page.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {profile.products.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-10 w-10 flex-none rounded object-cover" />
                    ) : (
                      <span className="h-10 w-10 flex-none rounded bg-slate-100" />
                    )}
                    <span className="flex-1 font-medium text-slate-800">{p.title}</span>
                    <span className="tabular-nums text-slate-700">{p.priceCents ? formatCents(p.priceCents) : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {profile.presence.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Where you live online</h2>
              <ul className="flex flex-wrap gap-2">
                {profile.presence.map((p) => (
                  <li key={p.label}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-emerald-500 hover:text-emerald-700">
                      {p.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
