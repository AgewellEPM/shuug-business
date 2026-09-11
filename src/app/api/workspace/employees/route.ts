import { z } from "zod";
import { cookies } from "next/headers";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { createEmployeeAccount, issueEmployeeInvitation, listEmployeeAccounts, setEmployeeEnabled, updateEmployeeAccount } from "@/lib/auth/employees";
import { configureOwnerPassword, signInOwner } from "@/lib/auth/owner-session";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/config";
import { addMember, getMember, listTeam, updateMember } from "@/lib/team/store";
import { assignRole, listRoles, roleForMember } from "@/lib/permissions/store";
import { appBaseUrl, setting } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function state() { return { configured: Boolean(setting("WORKSPACE_OWNER_PASSWORD_HASH")), accounts: listEmployeeAccounts().map(a => ({ ...a, role: roleForMember(a.memberId) })), members: listTeam().filter(m => m.id !== "owner").map(m => ({ id: m.id, name: m.name, email: m.email })), roles: listRoles().filter(r => r !== "Owner"), loginUrl: new URL("/api/auth/login", appBaseUrl()).toString() }; }
export async function GET() { try { await requireOwnerAccess(); return json(state()); } catch { return json({ error: "Owner access required." }, 403); } }
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), password: z.string().min(14).max(200) }).strict(),
  z.object({ action: z.literal("create"), memberId: z.string().max(100).optional(), name: z.string().trim().min(1).max(100), email: z.email().max(160), role: z.string().min(1).max(40) }).strict(),
  z.object({ action: z.enum(["invite", "disable", "enable"]), id: z.uuid() }).strict(),
  z.object({ action: z.literal("role"), id: z.uuid(), role: z.string().min(1).max(40) }).strict(),
  z.object({ action: z.literal("profile"), id: z.uuid(), name: z.string().trim().min(1).max(100), email: z.email().max(160) }).strict(),
]);
export async function POST(request: Request) {
  try { await requireOwnerAccess(); } catch { return json({ error: "Owner access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const input = inputSchema.parse(await boundedJson(new Response(request.body), 8000));
    let inviteUrl: string | undefined;
    if (input.action === "setup") {
      configureOwnerPassword(input.password);
      (await cookies()).set(SESSION_COOKIE, signInOwner(input.password), { httpOnly: true, sameSite: "lax", secure: appBaseUrl().startsWith("https:"), path: "/", maxAge: SESSION_TTL_SECONDS });
    } else {
      if (!setting("WORKSPACE_OWNER_PASSWORD_HASH")) throw new Error("Set your owner password before enabling employee sign-in.");
      if (input.action === "create") {
        if (input.role === "Owner" || !listRoles().includes(input.role)) throw new Error("Select an employee role.");
        if (listEmployeeAccounts().some(a => a.email === input.email.toLowerCase() || (input.memberId && a.memberId === input.memberId))) throw new Error("This employee already has an account.");
        const member = input.memberId ? getMember(input.memberId) : addMember({ name: input.name, email: input.email, role: input.role });
        if (!member || member.id === "owner") throw new Error("Select a team member.");
        const account = createEmployeeAccount({ memberId: member.id, name: input.name, email: input.email });
        assignRole(member.id, input.role);
        inviteUrl = new URL(`/api/auth/activate?token=${issueEmployeeInvitation(account.id)}`, appBaseUrl()).toString();
      } else {
        const account = listEmployeeAccounts().find(a => a.id === input.id); if (!account) throw new Error("Employee unavailable.");
        if (input.action === "role") { if (input.role === "Owner" || !listRoles().includes(input.role)) throw new Error("Select an employee role."); assignRole(account.memberId, input.role); }
        else if (input.action === "profile") { updateEmployeeAccount(account.id, input.name, input.email); updateMember(account.memberId, { name: input.name, email: input.email }); }
        else if (input.action === "invite") inviteUrl = new URL(`/api/auth/activate?token=${issueEmployeeInvitation(account.id)}`, appBaseUrl()).toString();
        else setEmployeeEnabled(account.id, input.action === "enable");
      }
    }
    return json({ ...state(), inviteUrl });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not update employee access." }, 400); }
}
