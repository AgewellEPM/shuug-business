import { cookies, headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { employeeSession } from "./employees";
import { ownerSessionValid } from "./owner-session";
import { authEnabled, SESSION_COOKIE } from "./config";
import { appBaseUrl, setting } from "../connections/vault";
import { getMember } from "../team/store";
import { roleForMember } from "../permissions/store";
import { requestIdentity } from "./request-context";
export interface WorkspaceUser { id: string; memberId: string; name: string; email: string; role: string; isOwner: boolean }
export const ownerIdentity = (): WorkspaceUser => ({ id: "workspace-owner", memberId: "owner", name: getMember("owner")?.name ?? "Owner", email: getMember("owner")?.email ?? "", role: "Owner", isOwner: true });
export function loginRequired() { return authEnabled() || Boolean(setting("WORKSPACE_OWNER_PASSWORD_HASH")); }
export function sessionIdentity(token: string | undefined): WorkspaceUser | null {
  if (ownerSessionValid(token)) return ownerIdentity();
  const account = employeeSession(token);
  if (!account || !getMember(account.memberId)) return null;
  const role = roleForMember(account.memberId);
  // Owner authority is never assigned by an employee role cookie or roster title.
  return { id: account.id, memberId: account.memberId, name: account.name, email: account.email, role: role === "Owner" ? "Employee" : role, isOwner: false };
}
export async function requireIdentity(): Promise<WorkspaceUser> {
  const authenticated = requestIdentity(); if (authenticated) return authenticated;
  const h = await headers(), origin = h.get("origin"), host = h.get("host") ?? "", forwarded = h.get("x-forwarded-host");
  const identity = sessionIdentity((await cookies()).get(SESSION_COOKIE)?.value);
  if (identity && (!origin || origin === new URL(appBaseUrl()).origin)) return identity;
  const secret = setting("WORKSPACE_ACCESS_TOKEN") || setting("PPC_WORKSPACE_ACCESS_TOKEN");
  const supplied = Buffer.from(h.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (secret && supplied.length === expected.length && timingSafeEqual(supplied, expected)) return ownerIdentity();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) && (!forwarded || forwarded === host);
  if (!loginRequired() && local && (!origin || new URL(origin).host === host)) return ownerIdentity();
  throw new Error("Sign in to your account. First installation requires the local owner workspace or an authenticated workspace gateway.");
}
export async function requireOwnerAccess() { const user = await requireIdentity(); if (!user.isOwner) throw new Error("Only the workspace owner can manage accounts, permissions, or connections."); return user; }
