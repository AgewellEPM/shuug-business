import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { consumeLaunchTicket, launchIdentity } from "@/lib/wordpress/launch";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/config";
import { appBaseUrl } from "@/lib/connections/vault";
import { equalSecret } from "@/lib/connections/access";
import { authPage, escapeHtml, readAuthForm } from "@/lib/auth/forms";
const name = "wordpress_launch_csrf", cookiePath = "/api/wordpress/launch";
export async function GET(request: Request) {
  const ticket = new URL(request.url).searchParams.get("ticket") ?? "", user = launchIdentity(ticket);
  if (!user) return authPage("Launch expired", "<p>Open the full application again from your WordPress workspace.</p>", 400);
  const csrf = randomBytes(32).toString("hex"); (await cookies()).set(name, csrf, { httpOnly: true, secure: appBaseUrl().startsWith("https:"), sameSite: "strict", path: cookiePath, maxAge: 60 });
  return authPage("Open your full workspace", `<p>Continue as <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.role)}).</p><form method="post" action="${cookiePath}"><input type="hidden" name="ticket" value="${ticket}"><input type="hidden" name="csrf" value="${csrf}"><button>Continue to workspace</button></form>`);
}
export async function POST(request: Request) {
  try {
    const form = await readAuthForm(request), jar = await cookies(), expected = jar.get(name)?.value;
    if (!expected || !equalSecret(expected, form.get("csrf") ?? "")) throw new Error("Open the application again from WordPress.");
    const { session, user } = consumeLaunchTicket(form.get("ticket") ?? "");
    jar.set(SESSION_COOKIE, session, { httpOnly: true, secure: appBaseUrl().startsWith("https:"), sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS }); jar.delete("dd_active_role"); jar.set(name, "", { path: cookiePath, maxAge: 0 });
    return NextResponse.redirect(new URL(user.isOwner ? "/" : "/me", appBaseUrl()), 303);
  } catch (e) { return authPage("Could not open workspace", `<p>${escapeHtml(e instanceof Error ? e.message : "Try again from WordPress.")}</p>`, 400); }
}
