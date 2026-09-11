"use server";

import { requireOwnerAccess } from "@/lib/auth/identity";
import { revalidatePath } from "next/cache";
import { setPermission, assignRole, createRole, deleteRole } from "@/lib/permissions/store";
import { setActiveRole } from "@/lib/permissions/active";
import { requireSectionAccess } from "@/lib/permissions/guard";
import type { PermissionLevel, SectionKey } from "@/lib/permissions/model";

export interface AdminResult { ok: boolean; message: string }

export async function createRoleAction(name: string): Promise<AdminResult> {
  try {
    await requireSectionAccess("admin", "edit");
    createRole(name);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: `Created role “${name.trim()}”` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not create role" };
  }
}

export async function deleteRoleAction(name: string): Promise<AdminResult> {
  try {
    await requireSectionAccess("admin", "edit");
    deleteRole(name);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: `Deleted role “${name}”` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not delete role" };
  }
}

export async function setPermissionAction(role: string, section: SectionKey, level: PermissionLevel): Promise<AdminResult> {
  // Only someone who can EDIT admin may change permissions.
  await requireSectionAccess("admin", "edit");
  setPermission(role, section, level);
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, message: `${role} · ${section} → ${level}` };
}

export async function assignRoleAction(memberId: string, role: string): Promise<AdminResult> {
  await requireSectionAccess("admin", "edit");
  assignRole(memberId, role);
  revalidatePath("/admin");
  return { ok: true, message: `Assigned ${role}` };
}

/** Preview the app as a role. Available to anyone who can view admin. */
export async function setActiveRoleAction(role: string): Promise<AdminResult> {
  await requireOwnerAccess();
  await setActiveRole(role);
  revalidatePath("/", "layout");
  return { ok: true, message: `Now viewing as ${role}` };
}
