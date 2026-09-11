"use server";

import { revalidatePath } from "next/cache";
import { moduleById } from "@/lib/sdk/registry";
import { addRecord, updateRecord, setArchived, removeRecord } from "@/lib/sdk/records";
import { requireSectionAccess } from "@/lib/permissions/guard";

export interface ActionResult { ok: boolean; error?: string; id?: string }

/** Every mutation is gated by the module's own section — a dev module is as locked-down as core. */
async function gate(moduleId: string) {
  const m = moduleById(moduleId);
  if (!m) throw new Error("Unknown module");
  await requireSectionAccess(m.section, "edit");
  return m;
}

export async function addRecordAction(moduleId: string, values: Record<string, unknown>): Promise<ActionResult> {
  try {
    const m = await gate(moduleId);
    const r = addRecord(moduleId, m.fields, values);
    revalidatePath(`/m/${moduleId}`);
    return { ok: true, id: r.id };
  } catch (e) { return fail(e); }
}

export async function updateRecordAction(moduleId: string, id: string, values: Record<string, unknown>): Promise<ActionResult> {
  try {
    const m = await gate(moduleId);
    updateRecord(moduleId, id, m.fields, values);
    revalidatePath(`/m/${moduleId}`);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function archiveRecordAction(moduleId: string, id: string, archived: boolean): Promise<ActionResult> {
  try { await gate(moduleId); setArchived(moduleId, id, archived); revalidatePath(`/m/${moduleId}`); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

export async function removeRecordAction(moduleId: string, id: string): Promise<ActionResult> {
  try { await gate(moduleId); removeRecord(moduleId, id); revalidatePath(`/m/${moduleId}`); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
