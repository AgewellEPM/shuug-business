"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/** Recall trace: given a lot code, find every event, who got it, and what made it. */
import { recall } from "@/lib/ops/store";
import type { RecallTrace } from "@/lib/ops/lots";

export async function recallAction(lotCode: string): Promise<RecallTrace> {
  await requireSectionAccess("operations", "view");

  const code = (lotCode ?? "").trim();
  if (!code) return { lotCode: "", events: [], shippedTo: [], madeFromLotCodes: [] };
  return recall(code);
}
