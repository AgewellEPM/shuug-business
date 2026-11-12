"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { saveSecrets } from "@/lib/connections/vault";
import { integrationById } from "@/lib/integrations/registry";
import { normalizePhone } from "@/lib/communications/model";

export interface ActionResult { ok: boolean; message: string }
function validateMessagingFields(id: string, patch: Record<string, string>) {
  if (id === "twilio") {
    if (!/^AC[a-f0-9]{32}$/i.test(patch.TWILIO_ACCOUNT_SID)) throw new Error("Use the Twilio account ID starting with AC.");
    if (!/^[!-~]{20,200}$/.test(patch.TWILIO_AUTH_TOKEN)) throw new Error("Check the Twilio auth token.");
    patch.TWILIO_FROM_NUMBER = normalizePhone(patch.TWILIO_FROM_NUMBER);
    if (!["test", "live"].includes(patch.TWILIO_MODE)) throw new Error("Choose test or live text message mode.");
  }
  if (id === "mailgun") {
    if (!/^[!-~]{10,500}$/.test(patch.MAILGUN_API_KEY)) throw new Error("Check the Mailgun API key.");
    patch.MAILGUN_DOMAIN = patch.MAILGUN_DOMAIN.toLowerCase();
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(patch.MAILGUN_DOMAIN)) throw new Error("Use the verified Mailgun sending domain, without a URL or path.");
    if (!z.email().max(200).safeParse(patch.MAILGUN_FROM_EMAIL).success || /[\r\n<>]/.test(patch.MAILGUN_FROM_EMAIL) || patch.MAILGUN_FROM_EMAIL.split("@")[1].toLowerCase() !== patch.MAILGUN_DOMAIN) throw new Error("Use a sender email on the configured Mailgun sending domain.");
    if (!["US", "EU"].includes(patch.MAILGUN_REGION)) throw new Error("Choose the US or EU Mailgun account region.");
    if (!["test", "live"].includes(patch.MAILGUN_MODE)) throw new Error("Choose test or live email message mode.");
    if (!/^[!-~]{10,500}$/.test(patch.MAILGUN_WEBHOOK_SIGNING_KEY)) throw new Error("Check the Mailgun HTTP webhook signing key.");
  }
}

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
    validateMessagingFields(id, patch);
    saveSecrets(patch);
    revalidatePath("/integrations");
    return { ok: true, message: `${spec.name} settings saved securely. Connection and delivery have not been verified.${["twilio", "mailgun"].includes(id) ? " Sending is controlled separately in Shop operations." : ""}` };
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
