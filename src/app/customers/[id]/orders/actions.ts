"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/**
 * Server action for placing an order. Never trusts the client for price: it
 * re-prices the draft against the CURRENT agreement, re-validates minimums and
 * the PO requirement, and only then persists. Returns structured violations so
 * the UI can show exactly what's blocking the order.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDealStore } from "@/lib/data/store";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { priceOrder, validateOrder, type Violation } from "@/lib/pricing";

export interface PlaceOrderResult {
  ok: boolean;
  orderId?: string;
  durable?: boolean;
  violations?: Violation[];
  error?: string;
}

const draftSchema = z
  .array(
    z.object({
      skuId: z.string().min(1),
      quantity: z.number().int().min(0).max(1_000_000).optional(),
      cases: z.number().int().min(0).max(1_000_000).optional(),
      unit: z.enum(["case", "bottle"]).optional(),
      overrideUnitPriceCents: z.number().int().min(0).max(1_000_00).optional(),
    }),
  )
  .min(1);
const poSchema = z.string().max(60).nullable();
const noteSchema = z.string().max(280);

export async function placeOrderAction(
  customerId: string,
  draft: {
    skuId: string;
    quantity?: number;
    cases?: number;
    unit?: "case" | "bottle";
    overrideUnitPriceCents?: number;
  }[],
  poNumber: string | null,
  note: string,
): Promise<PlaceOrderResult> {
  try {
  await requireSectionAccess("sales", "edit");

    await requireWorkspaceAccess();
    const validDraft = draftSchema.parse(draft);
    const validPO = poSchema.parse(poNumber && poNumber.trim() ? poNumber.trim() : null);
    const validNote = noteSchema.parse(note ?? "");

    const store = await getDealStore();
    const deal = await store.getDeal(customerId);
    if (!deal) return { ok: false, error: `Unknown customer: ${customerId}` };

    const pricing = priceOrder(validDraft, deal.agreement, deal.skus);
    const validation = validateOrder({
      pricing,
      agreement: deal.agreement,
      requiresPO: deal.customer.requiresPO,
      poNumber: validPO,
    });
    if (!validation.ok) return { ok: false, violations: validation.violations };

    const order = await store.createOrder({
      customerId,
      poNumber: validPO,
      note: validNote,
      lines: pricing.lines,
      subtotalCents: pricing.subtotalCents,
      freightCents: pricing.freightCents,
      totalCents: pricing.totalCents,
    });

    revalidatePath(`/customers/${customerId}/orders`);
    revalidatePath("/analytics");
    revalidatePath("/calendar");
    // Both database orders and new local order archives survive a restart.
    return { ok: true, orderId: order.id, durable: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Order failed";
    return { ok: false, error: message };
  }
}
