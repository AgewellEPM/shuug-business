import { requireSectionAccess } from "@/lib/permissions/guard";
import { listLots } from "@/lib/ops/store";
import { SKUS } from "@/lib/data/seed";
import { expiryReport } from "@/lib/ops/lots";
import { TraceabilityClient, type LotExpiryRow } from "@/components/TraceabilityClient";
import { recallAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TraceabilityPage() {
  await requireSectionAccess("operations", "view");

  const nameById = new Map(SKUS.map((s) => [s.id, s.name]));
  const today = new Date().toISOString();
  const rows: LotExpiryRow[] = expiryReport(listLots(), today).map((r) => ({
    lotCode: r.lot.lotCode,
    product: nameById.get(r.lot.skuId) ?? r.lot.skuId,
    remainingCases: r.lot.remainingCases,
    expiresOn: r.lot.expiresOn,
    daysToExpiry: r.daysToExpiry,
    expired: r.expired,
  }));

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Traceability &amp; recall</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every lot tracked receipt → production → shipment. Look up any lot in one box for a recall,
          and export the FDA-ready record (FSMA 204). Demo data (in-memory).
        </p>
      </header>
      <TraceabilityClient lots={rows} recallAction={recallAction} />
    </div>
  );
}
