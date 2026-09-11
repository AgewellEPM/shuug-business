"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/** Operations actions: ship a deal-desk order (decrements inventory) and receive produced stock. */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDealStore } from "@/lib/data/store";
import { ship, receive, orderShipped } from "@/lib/ops/store";

export interface OpsResult {
  ok: boolean;
  message: string;
}

export async function shipOrderAction(orderId: string): Promise<OpsResult> {
  try {
  await requireSectionAccess("operations", "edit");

    const store = await getDealStore();
    const order = await store.getOrder(orderId);
    if (!order) return { ok: false, message: `Unknown order ${orderId}` };
    if (orderShipped(orderId)) return { ok: false, message: `Order ${orderId} already shipped` };

    const deal = await store.getDeal(order.customerId);
    const lines = order.lines.map((l) => ({ skuId: l.skuId, cases: Math.ceil(l.cases) }));

    const shipment = ship({
      kind: "order",
      refId: order.id,
      toCompany: deal?.customer.company ?? order.customerId,
      lines,
      carrier: "Ground",
      // Simple freight estimate: $12/case-equivalent (placeholder until a rate table).
      shippingCostCents: lines.reduce((n, l) => n + l.cases * 1200, 0),
    });
    revalidatePath("/operations");
    return { ok: true, message: `Shipped ${order.id} → ${shipment.id}. Inventory updated.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Ship failed" };
  }
}

const receiveSchema = z.object({ skuId: z.string().min(1), cases: z.number().int().min(1).max(100_000) });

export async function receiveAction(skuId: string, cases: number): Promise<OpsResult> {
  try {
  await requireSectionAccess("operations", "edit");

    const v = receiveSchema.parse({ skuId, cases });
    receive(v.skuId, v.cases);
    revalidatePath("/operations");
    return { ok: true, message: `Received ${v.cases} cases of ${v.skuId}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Receive failed" };
  }
}
