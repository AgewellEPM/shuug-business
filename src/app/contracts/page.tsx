import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadWorkspace } from "@/lib/data/workspace";
import { formatCents } from "@/lib/money";
import { formatPercent, paymentTermsLabel, formatDate } from "@/lib/format";
import { contractStatus, daysUntil, type ContractStatus } from "@/lib/contracts/status";

export const dynamic = "force-dynamic";

const todayISO = () => new Date().toISOString().slice(0, 10);

const BADGE: Record<ContractStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  expiring: "bg-amber-100 text-amber-900",
  expired: "bg-red-100 text-red-800",
};

export default async function ContractsPage() {
  await requireSectionAccess("sales", "view");

  const { deals } = await loadWorkspace();
  const today = todayISO();

  const contracts = deals
    .map((d) => {
      const a = d.agreement;
      const status = contractStatus(a.expirationDate, today);
      return { customer: d.customer, agreement: a, versions: d.versions.length, status, days: daysUntil(a.expirationDate, today) };
    })
    // Most urgent first: expired, then soonest-expiring, then the rest.
    .sort((x, y) => {
      const rank = { expired: 0, expiring: 1, active: 2 } as const;
      return rank[x.status] - rank[y.status] || x.days - y.days;
    });

  const counts = {
    expired: contracts.filter((c) => c.status === "expired").length,
    expiring: contracts.filter((c) => c.status === "expiring").length,
    active: contracts.filter((c) => c.status === "active").length,
  };

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">The deals behind every account</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Contracts</h1>
        <p className="mt-2 text-sm text-slate-500">
          Every customer’s price agreement — terms, margins and renewal dates in one list. Renew before they lapse.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Expired" value={counts.expired} tone="text-red-600" />
        <Stat label="Expiring soon" value={counts.expiring} tone="text-amber-600" />
        <Stat label="Active" value={counts.active} tone="text-emerald-600" />
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No contracts yet. Add a customer and set up their price agreement.
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map(({ customer, agreement, versions, status, days }) => (
            <div key={customer.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/customers/${customer.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">{customer.company}</Link>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[status]}`}>
                  {status === "expired" ? `Expired ${-days}d ago` : status === "expiring" ? `Renews in ${days}d` : "Active"}
                </span>
                {agreement.creditLimitCents !== null && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Credit {formatCents(agreement.creditLimitCents)}</span>
                )}
                <Link href={`/customers/${customer.id}`} className="ml-auto text-xs font-semibold text-emerald-700 hover:underline">Open →</Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <Field label="Target margin" value={formatPercent(agreement.targetMarginFraction)} />
                <Field label="Floor margin" value={agreement.floorMarginFraction === null ? "—" : formatPercent(agreement.floorMarginFraction)} />
                <Field label="Terms" value={paymentTermsLabel(agreement.paymentTerms)} />
                <Field label="Min order" value={formatCents(agreement.minOrderDollarsCents)} />
                <Field label="Priced products" value={String(agreement.lines.length)} />
                <Field label="Effective" value={formatDate(agreement.effectiveDate)} />
                <Field label="Expires" value={formatDate(agreement.expirationDate)} />
                <Field label="Signed by" value={agreement.approvedBy || "—"} />
              </div>
              {versions > 1 && <p className="mt-2 text-[11px] text-slate-400">{versions} revisions on file</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}
