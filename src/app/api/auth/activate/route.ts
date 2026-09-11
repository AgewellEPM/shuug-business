import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { acceptEmployeeInvitation } from "@/lib/auth/employees";
import { appBaseUrl } from "@/lib/connections/vault";
import { equalSecret } from "@/lib/connections/access";
import { securityHeaders } from "@/lib/security/headers";
import { readAuthForm, authPage, escapeHtml } from "@/lib/auth/forms";
const cookie = "employee_activation_csrf";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return authPage("Account setup", "<p>This link is invalid. Ask the owner for a new setup link.</p>", 400);
  const csrf = randomBytes(32).toString("hex");
  (await cookies()).set(cookie, csrf, { httpOnly: true, sameSite: "strict", secure: appBaseUrl().startsWith("https:"), path: "/api/auth/activate", maxAge: 600 });
  return authPage("Set up your password", `<p>Your personal account gives you access to your assigned work, notes and roadmap.</p><form method="post" action="/api/auth/activate"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="token" value="${token}"><label>New password<input name="password" type="password" minlength="14" maxlength="200" autocomplete="new-password" required></label><label>Confirm password<input name="confirm" type="password" minlength="14" maxlength="200" autocomplete="new-password" required></label><button>Activate account</button></form><p>Use at least 14 characters. Setup links expire after 48 hours and work once.</p>`);
}
export async function POST(request: Request) {
  try {
    const form = await readAuthForm(request), jar = await cookies();
    const expected = jar.get(cookie)?.value;
    if (!expected || !equalSecret(expected, form.get("csrf") ?? "")) throw new Error("Open your setup link again and retry.");
    if (form.get("password") !== form.get("confirm")) throw new Error("The passwords do not match. Open your setup link and retry.");
    acceptEmployeeInvitation(form.get("token") ?? "", form.get("password") ?? ""); jar.delete(cookie);
    return authPage("Account ready", '<p>Your password has been saved.</p><a href="/api/auth/login">Sign in with your email and password</a>');
  } catch (e) { return authPage("Account setup", `<p>${escapeHtml(e instanceof Error ? e.message : "Account setup failed.")}</p><p>Open your setup link to try again.</p>`, 400); }
}
export function OPTIONS() { return new Response(null, { status: 405, headers: securityHeaders(false) }); }
