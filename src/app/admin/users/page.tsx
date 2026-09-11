import { requireOwnerAccess } from "@/lib/auth/identity";
import { listEmployeeAccounts } from "@/lib/auth/employees";
import { listTeam } from "@/lib/team/store";
import { listRoles, roleForMember } from "@/lib/permissions/store";
import { appBaseUrl, setting } from "@/lib/connections/vault";
import { EmployeeAccounts } from "@/components/EmployeeAccounts";
export const dynamic = "force-dynamic";
export default async function UsersPage() {
  await requireOwnerAccess();
  return <EmployeeAccounts initial={{ configured: Boolean(setting("WORKSPACE_OWNER_PASSWORD_HASH")), accounts: listEmployeeAccounts().map(a => ({ ...a, role: roleForMember(a.memberId) })), members: listTeam().filter(m => m.id !== "owner").map(m => ({ id: m.id, name: m.name, email: m.email })), roles: listRoles().filter(r => r !== "Owner"), loginUrl: new URL("/api/auth/login", appBaseUrl()).toString() }}/>;
}
