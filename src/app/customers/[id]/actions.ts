"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/**
 * Server action for saving a customer's price agreement.
 * Validates the incoming price map, rebuilds each line off the CURRENT stored
 * agreement (never trusting the client for terms/SKU set), regenerates the tier
 * ladder from the new base via the shared policy, and appends a version.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDealStore } from "@/lib/data/store";
import { standardLadder, computeMargin } from "@/lib/pricing";
import type { PriceAgreement } from "@/lib/data/model";

export interface SaveResult {
  ok: boolean;
  version?: number;
  durable?: boolean;
  error?: string;
}

const priceMapSchema = z.record(z.string(), z.number().int().min(0).max(10_000_00));
const noteSchema = z.string().min(1).max(280);

export async function saveAgreementAction(
  customerId: string,
  prices: Record<string, number>,
  note: string,
): Promise<SaveResult> {
  try {
  await requireSectionAccess("sales", "edit");

    const validPrices = priceMapSchema.parse(prices);
    const validNote = noteSchema.parse(note);

    const store = await getDealStore();
    const deal = await store.getDeal(customerId);
    if (!deal) return { ok: false, error: `Unknown customer: ${customerId}` };

    // Rebuild lines from the authoritative current agreement; only prices move.
    const nextLines = deal.agreement.lines.map((line) => {
      const newPrice = validPrices[line.skuId];
      if (newPrice === undefined) {
        throw new Error(`Missing price for SKU ${line.skuId}`);
      }
      const sku = deal.skus.find((s) => s.id === line.skuId);
      if (!sku) throw new Error(`SKU ${line.skuId} not found`);
      // Reject a price that would put gross profit into freefall past -100%
      // margin — a data-entry accident, not a real deal.
      computeMargin(sku.costPerCaseCents, newPrice);
      return {
        ...line,
        unitPriceCents: newPrice,
        tiers: standardLadder(newPrice),
      };
    });

    const nextAgreement: PriceAgreement = { ...deal.agreement, lines: nextLines };
    const updated = await store.saveAgreement({
      agreement: nextAgreement,
      changedBy: deal.agreement.approvedBy,
      note: validNote,
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/");
    return {
      ok: true,
      version: updated.versions[updated.versions.length - 1].version,
      durable: store.durable,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return { ok: false, error: message };
  }
}
