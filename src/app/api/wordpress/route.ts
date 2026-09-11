import { z } from "zod";
import { sessionIdentity } from "@/lib/auth/identity";
import { signInEmployee, signOutEmployee } from "@/lib/auth/employees";
import { signInOwner, signOutOwner } from "@/lib/auth/owner-session";
import { withRequestIdentity } from "@/lib/auth/request-context";
import { wordpressOperation, wordpressOperations } from "@/lib/wordpress/service";
import { createLaunchTicket } from "@/lib/wordpress/launch";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin"); if (origin && origin !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
    const parsed = z.object({ operation: z.enum(["session.login", "session.logout", "session.launch", ...wordpressOperations]), input: z.record(z.string(), z.unknown()).default({}) }).strict().parse(await boundedJson(new Response(request.body), 150000));
    if (parsed.operation === "session.login") {
      const login = z.object({ email: z.string().max(160), password: z.string().min(1).max(200) }).strict().parse(parsed.input);
      try { const token = login.email.trim() ? signInEmployee(login.email, login.password) : signInOwner(login.password); return json({ data: { token, user: sessionIdentity(token), expiresIn: 43200 } }); }
      catch (e) { return json({ error: e instanceof Error ? e.message : "Sign-in failed." }, 401); }
    }
    const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1], user = sessionIdentity(token);
    if (!user || !token) return json({ error: "Connect your workspace account again." }, 401);
    if (parsed.operation === "session.logout") { signOutEmployee(token); signOutOwner(token); return json({ data: { disconnected: true } }); }
    if (parsed.operation === "session.launch") return json({ data: { url: `${appBaseUrl()}/api/wordpress/launch?ticket=${createLaunchTicket(token)}` } });
    const operation = parsed.operation;
    return json({ data: await withRequestIdentity(user, () => wordpressOperation(operation, parsed.input)) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "The WordPress operation failed." }, 400); }
}
