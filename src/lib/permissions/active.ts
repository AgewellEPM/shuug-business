import { cookies } from "next/headers";
import { listRoles } from "./store";
import { requireIdentity, requireOwnerAccess } from "../auth/identity";
import { requestIdentity } from "../auth/request-context";
const COOKIE = "dd_active_role";
export async function getActiveRole(): Promise<string> {
  const user = await requireIdentity();
  if (requestIdentity()) return user.role;
  if (!user.isOwner) return user.role;
  const role = (await cookies()).get(COOKIE)?.value;
  return role && listRoles().includes(role) ? role : "Owner";
}
export async function setActiveRole(role: string): Promise<void> {
  await requireOwnerAccess();
  if (!listRoles().includes(role)) throw new Error(`Unknown role: ${role}`);
  (await cookies()).set(COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
}
