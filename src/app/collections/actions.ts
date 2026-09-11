"use server";
import { revalidatePath } from "next/cache";
import { executeReceivableCommand } from "@/lib/payments/receivable-service";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
export interface CollectResult { ok: boolean; error?: string; id?: string }
export async function receivableCommandAction(command: unknown): Promise<CollectResult> {
  try {
    await requireSectionAccess("money", "edit"); const actor = await requireIdentity();
    const result = await executeReceivableCommand(command, `${actor.name} (${actor.id})`);
    for (const path of ["/collections", "/cashflow", "/books", "/ledger"]) revalidatePath(path);
    return { ok: true, id: result.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not update receivables." }; }
}
