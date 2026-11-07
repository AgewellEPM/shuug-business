import { authEnabled } from "@/lib/auth/config";
import { setting } from "@/lib/connections/vault";
import { driverAvailable } from "@/lib/rideshare-driver/policy";
import { workspaceDatabase } from "@/lib/workspace/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness only: never include client data, paths, credentials or provider settings. */
export async function GET() {
  let ready = false;
  try {
    ready = authEnabled() && Boolean(setting("WORKSPACE_OWNER_PASSWORD_HASH"))
      && driverAvailable() && workspaceDatabase(db => Boolean(db.prepare("SELECT 1 AS ok").get()));
  } catch { /* An unavailable volume or incomplete setup must not pass the deployment gate. */ }
  return Response.json({ service: "gig-tax-pros-workspace", apiVersion: 1, ready }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
