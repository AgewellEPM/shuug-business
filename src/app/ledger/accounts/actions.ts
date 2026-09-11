"use server";
import { revalidatePath } from "next/cache";
import { executeAccountCommand } from "@/lib/accounting/journal-store";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import type { ActionResult } from "../actions";
export async function accountCommandAction(command: unknown): Promise<ActionResult> {
  try {
    await requireSectionAccess("money", "edit"); const actor = await requireIdentity();
    const result = executeAccountCommand(command, `${actor.name} (${actor.id})`);
    revalidatePath("/ledger"); revalidatePath("/ledger/accounts");
    return { ok: true, id: result.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not save the account." }; }
}
