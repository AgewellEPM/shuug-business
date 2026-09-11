"use server";
import { revalidatePath } from "next/cache";
import { executeJournalCommand } from "@/lib/accounting/journal-store";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
export interface ActionResult { ok: boolean; error?: string; id?: string }
export async function journalCommandAction(command: unknown): Promise<ActionResult> {
  try {
    await requireSectionAccess("money", "edit");
    const actor = await requireIdentity();
    const result = executeJournalCommand(command, `${actor.name} (${actor.id})`);
    revalidatePath("/ledger");
    return { ok: true, id: result.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not update the journal" }; }
}
