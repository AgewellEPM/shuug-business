import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { importedArchive } from "@/lib/customers/import-archive";
import { notFound } from "next/navigation";
import { getDealStore } from "@/lib/data/store";
import { DealDeskClient } from "@/components/DealDeskClient";
import { CustomerHeader } from "@/components/CustomerHeader";
import { saveAgreementAction } from "./actions";

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("sales", "view");

  const { id } = await params;
  const store = await getDealStore();
  const deal = await store.getDeal(id);
  if (!deal) notFound();
  deal.customer.phone ||= importedArchive().deals.find(d=>d.customer.id===id)?.customer.phone;

  return (
    <div>
      <CustomerHeader customer={deal.customer} agreement={deal.agreement} active="agreement" />
      <div className="mb-4 flex justify-end gap-2">
        <Link href={`/customers/${id}/timeline`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
          Timeline &amp; quotes →
        </Link>
        <Link href={`/customers/${id}/portal`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
          Client portal →
        </Link>
      </div>
      <DealDeskClient deal={deal} saveAction={saveAgreementAction} />
    </div>
  );
}
