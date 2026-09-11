"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { addStudent, removeStudent, addClass, removeClass, enroll, unenroll, checkIn, checkOut, type ClassKind } from "@/lib/education/store";
import { generateMonthlyRun, setTuitionStatus, removeTuition, type TuitionStatus } from "@/lib/education/tuition-store";

export interface ActionResult { ok: boolean; error?: string; id?: string; created?: number; skipped?: number }

const guardianSchema = z.object({ name: z.string().trim().max(100).default(""), phone: z.string().trim().max(40).default(""), relationship: z.string().trim().max(40).default("") });
const studentSchema = z.object({
  name: z.string().trim().min(1, "Child's name required").max(120),
  dobISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth needed for age/ratio").or(z.literal("")).default(""),
  guardians: z.array(guardianSchema).max(6).default([]),
  authorizedPickups: z.array(z.string().trim().max(100)).max(12).default([]),
  notes: z.string().trim().max(500).default(""),
});

export async function addStudentAction(form: z.input<typeof studentSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    const v = studentSchema.parse(form);
    const s = addStudent({ name: v.name, dobISO: v.dobISO, guardians: v.guardians, authorizedPickups: v.authorizedPickups.filter(Boolean), notes: v.notes });
    revalidatePath("/childcare");
    return { ok: true, id: s.id };
  } catch (e) { return fail(e); }
}

export async function removeStudentAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); removeStudent(id); revalidatePath("/childcare"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

const classSchema = z.object({
  name: z.string().trim().min(1, "Class name required").max(120),
  kind: z.enum(["daycare", "art", "swim", "music", "dance", "tutoring", "sports", "other"]),
  ageGroup: z.enum(["infant", "toddler", "preschool", "school-age"]).nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(500),
  schedule: z.string().trim().max(120).default(""),
  level: z.string().trim().max(60).default(""),
  priceDollars: z.coerce.number().min(0).max(1_000_000).default(0),
});

export async function addClassAction(form: z.input<typeof classSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    const v = classSchema.parse(form);
    const c = addClass({ name: v.name, kind: v.kind as ClassKind, ageGroup: v.ageGroup ?? null, capacity: v.capacity, schedule: v.schedule, level: v.level, priceCents: Math.round(v.priceDollars * 100) });
    revalidatePath("/childcare");
    return { ok: true, id: c.id };
  } catch (e) { return fail(e); }
}

export async function removeClassAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); removeClass(id); revalidatePath("/childcare"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

export async function enrollAction(studentId: string, classId: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); enroll(studentId, classId); revalidatePath("/childcare"); return { ok: true }; }
  catch (e) { return fail(e); }
}
export async function unenrollAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); unenroll(id); revalidatePath("/childcare"); return { ok: true }; }
  catch (e) { return fail(e); }
}

export async function checkInAction(studentId: string, by: string, dateISO: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); checkIn(studentId, by || "Guardian", dateISO); revalidatePath("/childcare"); return { ok: true }; }
  catch (e) { return fail(e); }
}
export async function checkOutAction(studentId: string, by: string, dateISO: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); checkOut(studentId, by || "Guardian", dateISO); revalidatePath("/childcare"); return { ok: true }; }
  catch (e) { return fail(e); }
}

// ---- Tuition billing ----
export async function generateTuitionAction(month: string): Promise<ActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    z.string().regex(/^\d{4}-\d{2}$/, "Pick a month").parse(month);
    const r = generateMonthlyRun(month);
    revalidatePath("/childcare");
    return { ok: true, created: r.created, skipped: r.skipped };
  } catch (e) { return fail(e); }
}

export async function setTuitionStatusAction(id: string, status: TuitionStatus): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); z.enum(["draft", "sent", "paid"]).parse(status); setTuitionStatus(id, status); revalidatePath("/childcare"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

export async function removeTuitionAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); removeTuition(id); revalidatePath("/childcare"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid input" : e instanceof Error ? e.message : "Something went wrong" };
}
