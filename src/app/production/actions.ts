"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

/** Run a production batch: creates a lot, adds cases to inventory, logs the CTE. */
import { revalidatePath } from "next/cache";
import { produceRun } from "@/lib/ops/store";

export interface ProduceResult {
  ok: boolean;
  message: string;
}

export async function produceAction(skuId: string, batches: number): Promise<ProduceResult> {
  try {
  await requireSectionAccess("operations", "edit");

    const n = Number.isInteger(batches) && batches > 0 && batches <= 100 ? batches : 1;
    const lot = produceRun(skuId, n);
    revalidatePath("/production");
    revalidatePath("/traceability");
    revalidatePath("/operations");
    return { ok: true, message: `Produced lot ${lot.lotCode} — ${lot.quantityCases} cases, best-by ${lot.expiresOn}. Added to inventory.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Production failed" };
  }
}
