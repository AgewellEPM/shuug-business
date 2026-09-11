"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { clockIn, clockOut, addManualEntry, removeEntry, setRate } from "@/lib/timeclock/store";

export interface ActionResult { ok: boolean; error?: string }

export async function clockInAction(employeeId: string, job: { id: string; label: string } | null): Promise<ActionResult> {
  try { await requireSectionAccess("team", "edit"); clockIn(employeeId, job); revalidatePath("/timeclock"); return { ok: true }; }
  catch (e) { return fail(e); }
}

export async function clockOutAction(employeeId: string, breakMinutes: number): Promise<ActionResult> {
  try { await requireSectionAccess("team", "edit"); clockOut(employeeId, Math.max(0, Math.round(breakMinutes) || 0)); revalidatePath("/timeclock"); return { ok: true }; }
  catch (e) { return fail(e); }
}

const manualSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHHMM: z.string().regex(/^\d{2}:\d{2}$/),
  endHHMM: z.string().regex(/^\d{2}:\d{2}$/),
  breakMinutes: z.coerce.number().int().min(0).max(600).default(0),
  jobId: z.string().nullable().optional(),
  jobLabel: z.string().nullable().optional(),
});

export async function addManualAction(form: z.input<typeof manualSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("team", "edit");
    const v = manualSchema.parse(form);
    const clockInMs = Date.parse(`${v.date}T${v.startHHMM}:00Z`);
    const clockOutMs = Date.parse(`${v.date}T${v.endHHMM}:00Z`);
    if (!Number.isFinite(clockInMs) || !Number.isFinite(clockOutMs)) throw new Error("Enter valid times.");
    addManualEntry({ employeeId: v.employeeId, clockInMs, clockOutMs, breakMinutes: v.breakMinutes, jobId: v.jobId ?? null, jobLabel: v.jobLabel ?? null });
    revalidatePath("/timeclock");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removeEntryAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("team", "edit"); removeEntry(id); revalidatePath("/timeclock"); return { ok: true }; }
  catch (e) { return fail(e); }
}

export async function setRateAction(employeeId: string, dollarsPerHour: number): Promise<ActionResult> {
  try { await requireSectionAccess("team", "edit"); setRate(employeeId, Math.round((Number(dollarsPerHour) || 0) * 100)); revalidatePath("/timeclock"); return { ok: true }; }
  catch (e) { return fail(e); }
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid input" : e instanceof Error ? e.message : "Something went wrong" };
}
