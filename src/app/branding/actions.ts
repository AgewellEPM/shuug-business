"use server";

import { revalidatePath } from "next/cache";
import { saveBranding, type Branding, type BrandingPatch } from "@/lib/branding/store";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";

export interface BrandingResult { ok: boolean; branding?: Branding; error?: string }

export async function saveBrandingAction(patch: BrandingPatch): Promise<BrandingResult> {
  try {
    await requireWorkspaceAccess();
    await requireSectionAccess("admin", "edit");
    const branding = saveBranding(patch);
    revalidatePath("/", "layout"); // re-theme the whole app
    revalidatePath("/branding");
    return { ok: true, branding };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save branding" };
  }
}
