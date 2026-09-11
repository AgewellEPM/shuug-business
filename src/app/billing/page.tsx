import { requireSectionAccess } from "@/lib/permissions/guard";
import { getDealStore } from "@/lib/data/store";
import { stripeConfigured } from "@/lib/payments/config";
import { localDbEnabled } from "@/lib/localdb/store";
import { getPayment } from "@/lib/payments/store";
import { BillingClient, type BillingOrderRow } from "@/components/BillingClient";
import { chargeOrderAction, checkPaymentAction } from "./actions";
import type { Order } from "@/lib/data/model";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requireSectionAccess("money", "view");

  const store = await getDealStore();
  const customers = await store.listCustomers();
  const companyById = new Map(customers.map((c) => [c.id, c.company]));

  const orderLists = await Promise.all(customers.map((c) => store.listOrders(c.id)));
  const allOrders: Order[] = orderLists
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  // Bulk = wholesale customers; look up channel from each deal.
  const deals = await Promise.all(customers.map((c) => store.getDeal(c.id)));
  const channelById = new Map(deals.filter(Boolean).map((d) => [d!.customer.id, d!.customer.channel]));

  const rows: BillingOrderRow[] = allOrders.map((o) => {
    const payment = getPayment(o.id);
    return {
      id: o.id,
      company: companyById.get(o.customerId) ?? o.customerId,
      bulk: channelById.get(o.customerId) === "wholesale_bulk",
      totalCents: o.totalCents,
      paymentStatus: payment?.status ?? null,
      payUrl: payment?.url ?? null,
    };
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing &amp; card payments</h1>
        <p className="mt-1 text-sm text-slate-600">
          When a bulk order comes in, charge the card right here — a secure Stripe payment link, no
          card details stored. Demo data (in-memory).
        </p>
      </header>
      <BillingClient orders={rows} stripeConfigured={stripeConfigured()} localDbOn={localDbEnabled()} chargeAction={chargeOrderAction} checkAction={checkPaymentAction} />
    </div>
  );
}
