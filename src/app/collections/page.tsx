import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadCollections } from "@/lib/payments/load";
import { listTeam } from "@/lib/team/store";
import { CollectionsBoard } from "@/components/CollectionsBoard";
import { receivableCommandAction } from "./actions";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  await requireSectionAccess("money", "view");

  let canEdit = false; try { await requireSectionAccess("money", "edit"); canEdit = true; } catch {}
  const o = await loadCollections();
  const team = listTeam().map((m) => ({ id: m.id, name: m.name }));
  const a = o.aging;

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Get paid without chasing everyone</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Collections</h1>
        <p className="mt-2 text-sm text-slate-500">
          Track product-invoice receipts, actual returned payments and collection follow-ups. Record dated bank evidence and fees; original receipts remain in the ledger.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Outstanding" value={formatCents(o.outstandingCents)} />
        <Stat label="Overdue" value={formatCents(o.overdueCents)} tone={o.overdueCents > 0 ? "text-red-600" : "text-slate-900"} />
        <Stat label="Collected" value={formatCents(o.collectedCents)} tone="text-emerald-700" />
        <Stat label="Invoices open" value={String(o.statuses.filter((s) => s.status !== "paid" && s.status !== "void").length)} />
      </div>

      {/* Aging */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">A/R aging</h2>
          <Link href="/cashflow" className="text-xs font-semibold text-emerald-700 hover:underline">Cash flow →</Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Age label="Current" cents={a.currentCents} tone="text-emerald-700" />
          <Age label="1–30" cents={a.d1_30Cents} tone="text-amber-700" />
          <Age label="31–60" cents={a.d31_60Cents} tone="text-orange-700" />
          <Age label="61–90" cents={a.d61_90Cents} tone="text-red-600" />
          <Age label="90+" cents={a.d90plusCents} tone="text-red-700" />
        </div>
      </section>

      <CollectionsBoard
        statuses={o.statuses}
        team={team}
        canEdit={canEdit}
        payments={o.payments}
        audit={o.audit}
        commandAction={receivableCommandAction}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
function Age({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-center">
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{formatCents(cents)}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
