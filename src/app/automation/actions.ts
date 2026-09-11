"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addRule, setRuleEnabled, updateRule, removeRule } from "@/lib/automation/store";
import { SIGNAL_KINDS, RULE_ACTIONS } from "@/lib/automation/model";
import { requireSectionAccess } from "@/lib/permissions/guard";

export interface ActionResult { ok: boolean; error?: string; id?: string }

const KINDS = Object.keys(SIGNAL_KINDS) as [string, ...string[]];
const ACTIONS = Object.keys(RULE_ACTIONS) as [string, ...string[]];

const newRuleSchema = z.object({
  name: z.string().trim().min(1, "Name the rule").max(160),
  trigger: z.enum(KINDS),
  operator: z.enum(["gte", "lte"]).optional(),
  threshold: z.coerce.number().finite(),
  action: z.enum(ACTIONS),
  channel: z.string().trim().max(60).nullable().optional(),
});

export async function addRuleAction(form: z.input<typeof newRuleSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("admin", "edit");
    const v = newRuleSchema.parse(form);
    const r = addRule({ name: v.name, trigger: v.trigger as keyof typeof SIGNAL_KINDS, operator: v.operator, threshold: v.threshold, action: v.action as keyof typeof RULE_ACTIONS, channel: v.channel ?? null });
    revalidatePath("/automation");
    return { ok: true, id: r.id };
  } catch (e) { return fail(e); }
}

export async function toggleRuleAction(id: string, enabled: boolean): Promise<ActionResult> {
  try { await requireSectionAccess("admin", "edit"); setRuleEnabled(id, enabled); revalidatePath("/automation"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

const patchSchema = z.object({
  threshold: z.coerce.number().finite().optional(),
  operator: z.enum(["gte", "lte"]).optional(),
  action: z.enum(ACTIONS).optional(),
  channel: z.string().trim().max(60).nullable().optional(),
});

export async function updateRuleAction(id: string, patch: z.input<typeof patchSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("admin", "edit");
    const v = patchSchema.parse(patch);
    updateRule(id, { threshold: v.threshold, operator: v.operator, action: v.action as keyof typeof RULE_ACTIONS | undefined, channel: v.channel });
    revalidatePath("/automation");
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function removeRuleAction(id: string): Promise<ActionResult> {
  try { await requireSectionAccess("admin", "edit"); removeRule(id); revalidatePath("/automation"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
