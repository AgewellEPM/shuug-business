"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { compileIntent, type Proposal } from "@/lib/handlers/compiler";
import { previewOpportunities, type Opportunity } from "@/lib/handlers/runtime";
import { createHandler, setMode, setGrantedCapabilities, removeHandler } from "@/lib/handlers/store";
import type { HandlerMode } from "@/lib/handlers/model";

export interface ActionResult { ok: boolean; error?: string; id?: string }

/** The one question: turn a plain-language wish into a proposed Handler. */
export async function compileWishAction(wish: string): Promise<{ ok: boolean; proposal?: Proposal; error?: string }> {
  try {
    await requireSectionAccess("admin", "edit");
    const clean = z.string().trim().min(3, "Tell me what you'd like AI to handle.").max(800).parse(wish);
    const proposal = await compileIntent(clean);
    if (!proposal) return { ok: false, error: "I couldn't match that to a Handler yet. Try naming the task — appointments, invoices, orders, inventory, wholesale…" };
    return { ok: true, proposal };
  } catch (e) { return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid" : "Could not read that." }; }
}

export async function previewAction(templateId: string): Promise<{ ok: boolean; opportunities?: Opportunity[]; error?: string }> {
  try {
    await requireSectionAccess("admin", "view");
    return { ok: true, opportunities: await previewOpportunities(templateId) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Preview failed" }; }
}

export async function createHandlerAction(templateId: string): Promise<ActionResult> {
  try {
    await requireSectionAccess("admin", "edit");
    const h = createHandler(z.string().min(1).parse(templateId));
    revalidatePath("/handlers");
    return { ok: true, id: h.id };
  } catch (e) { return fail(e); }
}

export async function setModeAction(id: string, mode: HandlerMode): Promise<ActionResult> {
  try {
    await requireSectionAccess("admin", "edit");
    z.enum(["off", "ask", "on"]).parse(mode);
    setMode(id, mode);
    revalidatePath("/handlers"); revalidatePath(`/handlers/${id}`);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function setCapabilitiesAction(id: string, caps: string[]): Promise<ActionResult> {
  try {
    await requireSectionAccess("admin", "edit");
    setGrantedCapabilities(id, z.array(z.string()).parse(caps));
    revalidatePath(`/handlers/${id}`);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function removeHandlerAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("admin", "edit"); removeHandler(id); revalidatePath("/handlers"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid input" : e instanceof Error ? e.message : "Something went wrong" };
}
