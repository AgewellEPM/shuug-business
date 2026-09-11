"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { previewBusinessTemplate, importBusinessTemplate } from "@/lib/branding/templates";
import { revalidatePath } from "next/cache";
export async function businessTemplateAction(input: unknown, apply = false) {
  try {
    await requireSectionAccess("admin", "edit");
    if (JSON.stringify(input).length > 1000000) throw new Error("Keep the template below 1 MB.");
    const preview = previewBusinessTemplate(input);
    if (apply) { const result = importBusinessTemplate(input); revalidatePath("/", "layout"); return { ok: true as const, applied: true, preview, result }; }
    return { ok: true as const, applied: false, preview };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Could not import this template." }; }
}
