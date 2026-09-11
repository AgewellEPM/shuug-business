import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { PermissionsAdmin } from "@/components/PermissionsAdmin";
import { getMatrix, listRoles, getAssignments } from "@/lib/permissions/store";
import { getActiveRole } from "@/lib/permissions/active";
import { can } from "@/lib/permissions/model";
import { SECTIONS } from "@/lib/permissions/model";
import { listTeam } from "@/lib/team/store";
import { setPermissionAction, assignRoleAction, setActiveRoleAction, createRoleAction, deleteRoleAction } from "./actions";
import { renameMemberAction, removeMemberAction } from "../team/actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireSectionAccess("admin", "view");

  const activeRole = await getActiveRole();
  const matrix = getMatrix();

  // Fail-closed, but degrade gracefully: no 500, a plain "no access" panel.
  if (!can(matrix, activeRole, "admin", "view")) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-2 text-lg font-bold text-slate-900">No access to Roles &amp; access</h1>
        <p className="mt-1 text-sm text-slate-500">Your role ({activeRole}) can’t open the admin area. Ask an owner to change your access.</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Back to Home</Link>
      </div>
    );
  }

  const roles = listRoles();
  const assignments = getAssignments();
  const members = listTeam().map((m) => ({ id: m.id, name: m.name, role: m.role }));
  const sections = SECTIONS.filter((s) => s.key !== "home").map((s) => ({ key: s.key, label: s.label }));

  return (
    <div>
      <header className="mb-6">
        <p className="dd-eyebrow">Access control</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Roles &amp; access</h1>
        <p className="mt-2 text-sm text-slate-500">
          Decide who can see and change each part of the business. Set a role’s access per section, give
          each teammate a role, and preview the app as them to check.
        </p>
      </header>
      <Link href="/admin/users" className="mb-5 inline-block dd-primary">Employee logins</Link>
      <PermissionsAdmin
        roles={roles}
        sections={sections}
        matrix={matrix}
        members={members}
        assignments={assignments}
        activeRole={activeRole}
        setPermissionAction={setPermissionAction}
        assignRoleAction={assignRoleAction}
        setActiveRoleAction={setActiveRoleAction}
        createRoleAction={createRoleAction}
        deleteRoleAction={deleteRoleAction}
        renameMemberAction={renameMemberAction}
        removeMemberAction={removeMemberAction}
      />
    </div>
  );
}
