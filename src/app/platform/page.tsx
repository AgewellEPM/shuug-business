import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { PRIMITIVES, VERTICAL_MAP } from "@/lib/state/primitives";
import { capabilitySurface } from "@/lib/state/capabilities";
import { snapshotState } from "@/lib/state/facade";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  await requireSectionAccess("admin", "view");

  const surface = capabilitySurface();
  const snap = await snapshotState();

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">The layer under it all</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Business state layer</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Shuug isn&apos;t the apps — the apps are <em>views</em> over one business-state model. Every vertical reduces to the
          same primitives, and AI, website plugins and integrations all act against one normalized capability surface under
          permissions. This is that layer, made visible. See <Link href="/api/v1/capabilities" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">the machine-readable contract</Link> &amp; <code className="rounded bg-slate-100 px-1">docs/STATE_LAYER.md</code>.
        </p>
      </header>

      {/* Live snapshot — the layer sits on real state */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Live state right now</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Customers" value={String(snap.customers)} />
          <Stat label="Employees" value={String(snap.employees)} />
          <Stat label="Suppliers" value={String(snap.suppliers)} />
          <Stat label="Inventory" value={String(snap.inventoryItems)} sub={snap.lowStock ? `${snap.lowStock} low` : undefined} />
          <Stat label="Open invoices" value={String(snap.openInvoices)} />
          <Stat label="Outstanding" value={formatCents(snap.outstandingCents)} />
          <Stat label="Ledger" value={snap.ledgerBalanced === null ? "—" : snap.ledgerBalanced ? "Balanced ✓" : "Off ✗"} tone={snap.ledgerBalanced ? "text-emerald-700" : undefined} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Primitives */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">The primitives</h2>
          <p className="mb-3 text-xs text-slate-500">Every business reduces to these ten. Different nouns, same underlying shapes.</p>
          <ol className="space-y-1.5">
            {PRIMITIVES.map((p, i) => (
              <li key={p.kind} className="flex gap-2 text-sm">
                <span className="w-5 flex-none text-right font-semibold text-slate-300">{i + 1}</span>
                <span className="w-28 flex-none font-semibold text-slate-800">{p.label}</span>
                <span className="text-slate-500">{p.definition}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Vertical normalization */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Same primitives, every vertical</h2>
          <div className="space-y-3">
            {VERTICAL_MAP.map((v) => (
              <div key={v.vertical}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{v.label}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {v.nouns.map((n) => (
                    <span key={n.noun} className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-100">{n.noun} <span className="text-slate-400">→ {n.primitive}{n.role ? `:${n.role}` : ""}</span></span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Capability surface */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Capability surface</h2>
          <span className="text-xs text-slate-400">{surface.live} live · {surface.planned} planned · {surface.total} total</span>
        </div>
        <p className="mb-3 max-w-3xl text-xs text-slate-500">
          The single door an actor uses instead of 40 SaaS APIs. A mechanic&apos;s and a swim school&apos;s AI appointment
          handler both call <code className="rounded bg-slate-100 px-1">appointment.available()</code>. Writes are permission-
          and approval-gated. This is exactly what <Link href="/handlers" className="font-semibold text-emerald-700 hover:underline">AI Handlers</Link> operate against.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {surface.byEntity.map((group) => (
            <div key={group.entity} className="rounded-xl border border-slate-100 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.entity}</p>
              <ul className="space-y-1">
                {group.capabilities.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <code className="font-semibold text-slate-800">{c.id}()</code>
                    {c.mutates && <span className="rounded bg-violet-100 px-1 text-[9px] font-semibold uppercase text-violet-700">write</span>}
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${c.status === "live" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{c.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 text-xs text-slate-400">Ghost Bridge maps a legacy system (QuickBooks, AS/400, custom Windows apps) into these same primitives — so an old business joins the same capability layer. <Link href="/api/v1/capabilities" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link></p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-amber-600">{sub}</p>}
    </div>
  );
}
