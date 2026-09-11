"use server";

/** Inbox actions: let the AI draft/handle an email, route it to a person, or archive. */
import { requireSectionAccess } from "@/lib/permissions/guard";
import { revalidatePath } from "next/cache";
import { draftReply, setStatus, routeEmail } from "@/lib/email/store";

export interface InboxResult {
  ok: boolean;
  message: string;
  draft?: string;
}

export async function draftAction(id: string): Promise<InboxResult> {
  await requireSectionAccess("team", "edit");
  const res = await draftReply(id);
  revalidatePath("/inbox");
  return res.ok ? { ok: true, message: "Draft ready.", draft: res.draft } : { ok: false, message: res.error ?? "Could not draft" };
}

export async function aiHandleAction(id: string): Promise<InboxResult> {
  await requireSectionAccess("team", "edit");

  return draftAction(id);
}

export async function routeToAction(id: string, to: string): Promise<InboxResult> {
  await requireSectionAccess("team", "edit");
  if (!routeEmail(id, to)) return { ok: false, message: "Email not found." };
  revalidatePath("/inbox");
  return { ok: true, message: `Routed to ${to}.` };
}

export async function archiveAction(id: string): Promise<InboxResult> {
  await requireSectionAccess("team", "edit");
  if (!setStatus(id, "archived")) return { ok: false, message: "Email not found." };
  revalidatePath("/inbox");
  return { ok: true, message: "Archived." };
}
