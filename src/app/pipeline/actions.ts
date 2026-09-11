"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createDeal, moveStage, markLost, updateDeal } from "@/lib/pipeline/store";
import { requireSectionAccess } from "@/lib/permissions/guard";
import type { Stage } from "@/lib/pipeline/model";

export interface PipeResult { ok: boolean; error?: string; id?: string }
const rev = () => { revalidatePath("/pipeline"); };

const newSchema = z.object({
  title: z.string().trim().min(1, "Name the deal").max(160),
  company: z.string().trim().max(160).default(""),
  expectedValueCents: z.number().int().min(0),
  assignedTo: z.string().nullable().optional(),
  source: z.string().trim().max(80).optional(),
  nextAction: z.string().trim().max(200).optional(),
});

export async function createDealAction(form: z.input<typeof newSchema>): Promise<PipeResult> {
  try { await requireSectionAccess("sales", "edit"); const v = newSchema.parse(form); const d = createDeal(v); rev(); return { ok: true, id: d.id }; }
  catch (e) { return fail(e); }
}
export async function moveStageAction(id: string, stage: Stage): Promise<PipeResult> {
  try { await requireSectionAccess("sales", "edit"); moveStage(id, stage); rev(); return { ok: true, id }; }
  catch (e) { return fail(e); }
}
export async function markLostAction(id: string, reason: string): Promise<PipeResult> {
  try { await requireSectionAccess("sales", "edit"); markLost(id, reason); rev(); return { ok: true, id }; }
  catch (e) { return fail(e); }
}
export async function assignDealAction(id: string, assignedTo: string | null): Promise<PipeResult> {
  try { await requireSectionAccess("sales", "edit"); updateDeal(id, { assignedTo }); rev(); return { ok: true, id }; }
  catch (e) { return fail(e); }
}
export async function updateNextActionAction(id: string, nextAction: string): Promise<PipeResult> {
  try { await requireSectionAccess("sales", "edit"); updateDeal(id, { nextAction }); rev(); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

function fail(e: unknown): PipeResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
