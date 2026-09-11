"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { getActiveRole } from "@/lib/permissions/active";
import { createWorkOrder, executeTransition, type OrderPatch } from "@/lib/state/workorder";
import type { TransitionDecision } from "@/lib/state/engine";

export interface ActionResult { ok: boolean; error?: string; id?: string }
export interface ExecActionResult { ok: boolean; decision?: TransitionDecision; deduped?: boolean; error?: string }

export async function createWorkOrderAction(customerName: string, service: string): Promise<ActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    const name = z.string().trim().min(1, "Customer name required").max(160).parse(customerName);
    const svc = z.string().trim().min(1, "Describe the work").max(200).parse(service);
    const o = createWorkOrder(name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, svc);
    revalidatePath("/workorders");
    return { ok: true, id: o.id };
  } catch (e) { return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid" : "Could not create." }; }
}

const patchSchema = z.object({
  estimateCents: z.coerce.number().int().min(0).max(1_000_000_00).optional(),
  approvedBy: z.string().trim().max(120).optional(),
  scheduledFor: z.string().trim().max(40).optional(),
  technicianId: z.string().trim().max(120).optional(),
  invoiceRef: z.string().trim().max(60).optional(),
}).strict();

/** The one guarded door. A person here, a website form, or an AI handler all call this. */
export async function executeAction(orderId: string, transitionId: string, patch: z.input<typeof patchSchema>, idempotencyKey?: string): Promise<ExecActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    const actor = await getActiveRole();
    const p = patchSchema.parse(patch) as OrderPatch;
    const r = executeTransition(orderId, transitionId, actor, p, undefined, idempotencyKey ?? null);
    revalidatePath("/workorders");
    return { ok: r.ok, decision: r.decision, deduped: r.deduped };
  } catch (e) { return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid" : e instanceof Error ? e.message : "Failed" }; }
}
