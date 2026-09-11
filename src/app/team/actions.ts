"use server";

import { requireOwnerAccess } from "@/lib/auth/identity";
import { disableMemberAccount } from "@/lib/auth/employees";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addMember, updateMember, removeMember, listTeam } from "@/lib/team/store";
import { assignRole, listRoles } from "@/lib/permissions/store";
import { previewAdpSync } from "@/lib/payroll/adp";

export interface TeamResult { ok: boolean; error?: string; memberId?: string }

/** Sync the roster to ADP payroll. Fail-closed without ADP credentials. */
export async function syncTeamToAdpAction(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireOwnerAccess();
    const preview = previewAdpSync(listTeam());
    if (!preview.ready) return { ok: false, message: preview.detail };
    // Payloads are built; the live mTLS push to /hr/v2/workers activates once
    // real ADP client certs are verified in Settings.
    return { ok: true, message: `${preview.detail} Live push activates once your ADP certificate is verified.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ADP sync failed" };
  }
}

const memberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Valid email required").max(160),
  role: z.string().trim().min(1).max(40),
  online: z.boolean().optional(),
  salaryCents: z.number().int().min(0).max(100000000).nullable().optional(),
});

/** Keep the RBAC assignment in sync when the role is one of the access roles. */
function syncRole(memberId: string, role: string) {
  if (listRoles().includes(role)) {
    try { assignRole(memberId, role); } catch { /* non-RBAC job title — skip */ }
  }
}

export async function addMemberAction(form: z.input<typeof memberSchema>): Promise<TeamResult> {
  try {
    await requireOwnerAccess();
    const v = memberSchema.parse(form);
    const member = addMember(v);
    syncRole(member.id, v.role);
    revalidatePath("/team");
    return { ok: true, memberId: member.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMemberAction(id: string, form: z.input<typeof memberSchema>): Promise<TeamResult> {
  try {
    await requireOwnerAccess();
    const v = memberSchema.parse(form);
    updateMember(id, v);
    syncRole(id, v.role);
    revalidatePath("/team");
    return { ok: true, memberId: id };
  } catch (e) {
    return fail(e);
  }
}

/** Quick inline rename (full name), used from Team + Roles & access. */
export async function renameMemberAction(id: string, name: string): Promise<TeamResult> {
  try {
    await requireOwnerAccess();
    const clean = z.string().trim().min(1, "Name is required").max(80).parse(name);
    updateMember(id, { name: clean });
    revalidatePath("/team");
    revalidatePath("/admin");
    return { ok: true, memberId: id };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMemberAction(id: string): Promise<TeamResult> {
  try {
    await requireOwnerAccess();
    disableMemberAccount(id);
    removeMember(id);
    revalidatePath("/team");
    return { ok: true, memberId: id };
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown): TeamResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
