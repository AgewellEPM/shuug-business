import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadBlueprint } from "@/lib/blueprint/load";

export const dynamic = "force-dynamic";

export default async function BlueprintPage() {
  await requireSectionAccess("admin", "view");

  const b = loadBlueprint();

  return (
    <div>
      <header className="mb-6">
        <p className="dd-eyebrow">One platform, shaped to you</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">How Shuug molded around your business</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          You don&apos;t assemble software. You say what you run, and the platform takes the shape of your business —
          the same underlying system, wearing your trade&apos;s clothes.
        </p>
      </header>

      {!b.configured ? (
        <div className="rounded-3xl border border-dashed border-emerald-300 bg-emerald-50/40 p-8 text-center">
          <p className="text-lg font-semibold text-slate-900">Tell Shuug what you run</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Pick your business type and answer a few questions. Shuug turns on exactly the modules you need and hides the rest — you can change it anytime.</p>
          <Link href="/setup" className="mt-4 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">What do you run? →</Link>
        </div>
      ) : (
        <>
          {/* The molded shape */}
          <div className="mb-6 rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 shadow-sm">
            <p className="text-sm text-slate-500">You told Shuug you run a</p>
            <p className="text-3xl font-bold tracking-tight text-slate-900">{b.industryLabel}</p>
            <p className="mt-2 text-sm text-slate-600">
              So it molded around you: <strong>{b.packs.length}</strong> capability {b.packs.length === 1 ? "area" : "areas"} on,
              lighting up <strong>{b.moduleCount}</strong> modules, over the same <strong>{b.liveCapabilities}</strong> live business
              capabilities every Shuug business shares. <Link href="/setup" className="font-semibold text-emerald-700 hover:underline">Change what you run →</Link>
            </p>
          </div>

          {/* What turned on */}
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">What turned on for you</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {b.packs.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-slate-900">{p.label}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.tools.slice(0, 10).map((t) => <span key={t.id} className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-100">{t.label}</span>)}
                    {p.tools.length > 10 && <span className="text-[11px] text-slate-400">+{p.tools.length - 10}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* The thesis, made concrete */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <NextCard title="It runs on one model" body="Your customers, staff, money and work are the same primitives every business shares — so nothing is a bolted-on silo." href="/platform" cta="See the state layer →" />
            <NextCard title="Your AI can run it" body="Describe a job you don't want to do and Shuug builds a Handler that works over exactly these capabilities, under your approval." href="/handlers" cta="Build a Handler →" />
            <NextCard title="Add anything, anytime" body="Turn capabilities on or off, build custom modules, or bring an old system in — the foundation doesn't change." href="/developer" cta="Extend it →" />
          </div>

          <p className="mt-6 text-xs text-slate-400">
            {b.handlerCount > 0 ? `${b.handlerCount} AI Handler${b.handlerCount === 1 ? "" : "s"} set up. ` : ""}
            This is the vision: one universal platform that takes the shape of whatever business you&apos;re in.
          </p>
        </>
      )}
    </div>
  );
}

function NextCard({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <Link href={href} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 flex-1 text-xs text-slate-500">{body}</p>
      <p className="mt-2 text-xs font-semibold text-emerald-700">{cta}</p>
    </Link>
  );
}
