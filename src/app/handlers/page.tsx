import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadHandlers } from "@/lib/handlers/load";
import { llmConfigured, llmLabel } from "@/lib/llm";
import { HandlersConsole } from "@/components/HandlersConsole";
import { compileWishAction, previewAction, createHandlerAction } from "./actions";

export const dynamic = "force-dynamic";

const MODE_LABEL = { off: "Off", ask: "Approval required", on: "On" } as const;

export default async function HandlersPage() {
  await requireSectionAccess("admin", "view");

  const { cards } = loadHandlers();

  return (
    <div>
      <header className="mb-6">
        <p className="dd-eyebrow">Tell it what you don&apos;t want to do anymore</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">What do you wish AI could do for your business?</h1>
        <p className="mt-2 text-sm text-slate-500">
          You don&apos;t build agents, prompts or workflows. Say it in plain words and Shuug constructs the worker —
          a <strong>Handler</strong> — from what your business already has: your customers, orders, calendar, invoices, inventory and more.
        </p>
      </header>

      <HandlersConsole
        aiEnabled={llmConfigured()}
        aiLabel={llmLabel()}
        compileWishAction={compileWishAction}
        previewAction={previewAction}
        createHandlerAction={createHandlerAction}
      />

      {/* Your handlers */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Your Handlers</h2>
        {cards.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">No Handlers yet. Answer the question above to create your first one.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {cards.map((c) => (
              <Link key={c.handler.id} href={`/handlers/${c.handler.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{c.template.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{c.handler.name}</p>
                      <ModeBadge mode={c.handler.mode} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{c.template.outcome}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
                      <span>Autonomy {c.performance.autonomyPct}%</span>
                      <span>{c.performance.received} handled</span>
                      <span>~{c.performance.hoursSavedEstimate}h saved (est.)</span>
                      <span>{c.readyCapabilities}/{c.totalCapabilities} tools ready</span>
                    </div>
                    {c.needsConnecting.length > 0 && <p className="mt-1 text-[11px] text-amber-600">Needs connecting: {c.needsConnecting.join(", ")}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-slate-400">
        Handlers are approval-gated by default and never act outside what you allow. Live phone/SMS/email needs a connected channel in <Link href="/integrations" className="font-semibold text-emerald-700 hover:underline">Integrations</Link>. {llmConfigured() ? `AI matching via ${llmLabel()}.` : "Connect an AI model for smarter matching (keyword matching works without it)."}
      </p>
    </div>
  );
}

function ModeBadge({ mode }: { mode: keyof typeof MODE_LABEL }) {
  const tone = mode === "on" ? "bg-emerald-100 text-emerald-800" : mode === "ask" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-500";
  return <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>{MODE_LABEL[mode]}</span>;
}
