"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { saveSecrets } from "@/lib/connections/vault";
import { integrationById } from "@/lib/integrations/registry";

export interface ActionResult { ok: boolean; message: string }

/** Save a hub-managed provider's credentials to the secure vault (admin-gated). */
export async function connectIntegrationAction(id: string, input: Record<string, string>): Promise<ActionResult> {
  try {
    await requireSectionAccess("admin", "edit");
    const spec = integrationById(id);
    if (!spec || spec.managedBy !== "hub" || !spec.keys) throw new Error("This integration is managed in Settings.");
    z.record(z.string(), z.string().max(4096)).parse(input);
    if (Object.keys(input).some((k) => !spec.keys!.includes(k))) throw new Error("Unexpected credential field.");

    const patch: Record<string, string> = {};
    for (const k of spec.keys) {
      const v = input[k]?.trim();
      if (!v) throw new Error(`${spec.name}: every field is required.`);
      patch[k] = v;
    }
    saveSecrets(patch);
    revalidatePath("/integrations");
    return { ok: true, message: `${spec.name} connected. Credentials are stored securely and never leave this workspace.` };
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? "Check the entered values." : e instanceof Error ? e.message : "Could not save." };
  }
}

export async function disconnectIntegrationAction(id: string): Promise<ActionResult> {
  try {
    await requireSectionAccess("admin", "edit");
    const spec = integrationById(id);
    if (!spec || spec.managedBy !== "hub" || !spec.keys) throw new Error("This integration is managed in Settings.");
    saveSecrets(Object.fromEntries(spec.keys.map((k) => [k, null])));
    revalidatePath("/integrations");
    return { ok: true, message: `${spec.name} disconnected. You can also revoke access in the provider account.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not disconnect." };
  }
}
