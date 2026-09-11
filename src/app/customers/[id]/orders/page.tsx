import { requireSectionAccess } from "@/lib/permissions/guard";
import { importedArchive } from "@/lib/customers/import-archive";
import { notFound } from "next/navigation";
import { getDealStore } from "@/lib/data/store";
import { OrdersClient } from "@/components/OrdersClient";
import { CustomerHeader } from "@/components/CustomerHeader";
import { CustomerInfoCard } from "@/components/CustomerInfoCard";
import { TermsPanel } from "@/components/TermsPanel";
import { placeOrderAction } from "./actions";

export default async function OrdersPage({
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
  const orders = await store.listOrders(id);

  return (
    <div>
      <CustomerHeader customer={deal.customer} agreement={deal.agreement} active="orders" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OrdersClient deal={deal} orders={orders} placeAction={placeOrderAction} />
        </div>
        <aside className="space-y-6">
          <CustomerInfoCard customer={deal.customer} />
          <TermsPanel agreement={deal.agreement} customer={deal.customer} />
        </aside>
      </div>
    </div>
  );
}
