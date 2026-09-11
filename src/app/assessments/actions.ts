"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { saveCompleted, removeCompleted } from "@/lib/assessments/store";
import type { Responses } from "@/lib/assessments/model";

export interface ActionResult { ok: boolean; error?: string; id?: string; result?: string }

const responseSchema = z.record(z.string(), z.object({
  pass: z.boolean().optional(),
  rating: z.coerce.number().min(0).max(10).optional(),
  value: z.coerce.number().finite().optional(),
  note: z.string().max(500).optional(),
}));

export async function saveAssessmentAction(templateId: string, subject: string, assessor: string, responses: Responses): Promise<ActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    z.string().min(1).parse(templateId);
    const clean = responseSchema.parse(responses) as Responses;
    const rec = saveCompleted({ templateId, subject: subject ?? "", assessor: assessor ?? "", responses: clean });
    revalidatePath("/assessments");
    revalidatePath(`/assessments/${templateId}`);
    return { ok: true, id: rec.id, result: rec.result.result };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid input" : e instanceof Error ? e.message : "Could not save." };
  }
}

export async function removeAssessmentAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); removeCompleted(id); revalidatePath("/assessments"); return { ok: true, id }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not remove." }; }
}
