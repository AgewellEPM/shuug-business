import { requireSectionAccess } from "@/lib/permissions/guard";
import { getDealStore } from "@/lib/data/store";
import { SKUS } from "@/lib/data/seed";
import { getInventory, listShipments, orderShipped } from "@/lib/ops/store";
import { buildReorderPlan } from "@/lib/ops/inventory";
import { velocityBySku } from "@/lib/ops/velocity";
import { OperationsClient, type InvRow, type OrderRow, type ShipmentRow } from "@/components/OperationsClient";
import { shipOrderAction, receiveAction } from "./actions";
import type { Order } from "@/lib/data/model";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requireSectionAccess("operations", "view");

  const store = await getDealStore();
  const customers = await store.listCustomers();
  const companyById = new Map(customers.map((c) => [c.id, c.company]));

  const orderLists = await Promise.all(customers.map((c) => store.listOrders(c.id)));
  const orders: Order[] = orderLists.flat();

  const nameById = new Map(SKUS.map((s) => [s.id, s.name]));
  const velocity = velocityBySku(orders);
  const plan = buildReorderPlan(getInventory(), velocity);

  const inventory: InvRow[] = plan.rows.map((r) => ({
    skuId: r.skuId,
    name: nameById.get(r.skuId) ?? r.skuId,
    onHandCases: r.onHandCases,
    reorderPointCases: r.reorderPointCases,
    velocityCasesPerDay: r.velocityCasesPerDay,
    daysOfCover: r.daysOfCover,
    belowReorderPoint: r.belowReorderPoint,
    suggestedProduceCases: r.suggestedProduceCases,
    productionCostCents: r.productionCostCents,
  }));

  const orderRows: OrderRow[] = orders
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((o) => ({
      id: o.id,
      company: companyById.get(o.customerId) ?? o.customerId,
      totalCents: o.totalCents,
      shipped: orderShipped(o.id),
    }));

  const shipments: ShipmentRow[] = listShipments().map((s) => ({
    id: s.id,
    kind: s.kind,
    refId: s.refId,
    toCompany: s.toCompany,
    shippingCostCents: s.shippingCostCents,
    createdAt: s.createdAt,
    summary: s.lines.map((l) => `${l.cases}× ${nameById.get(l.skuId) ?? l.skuId}`).join(", "),
  }));

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Operations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Inventory, ship-on-OK (decrements stock), and a production forecast from your sales
          velocity. Demo data (in-memory).
        </p>
      </header>
      <OperationsClient
        inventory={inventory}
        totalProductionCostCents={plan.totalProductionCostCents}
        orders={orderRows}
        shipments={shipments}
        shipAction={shipOrderAction}
        receiveAction={receiveAction}
      />
    </div>
  );
}
