import { setting } from "@/lib/connections/vault";
import { workspaceDatabase } from "@/lib/workspace/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public readiness reveals no customer, provider, filesystem or authentication details. */
export async function GET() {
  let status: "ready" | "setup_required" | "unavailable" = "unavailable";
  try {
    // The dedicated shop profile uses one private SQLite volume, never another firm's database.
    if (process.env.DATABASE_URL?.trim()) throw new Error("Unexpected data configuration.");
    workspaceDatabase(db => db.prepare("SELECT 1 AS ready").get());
    const password = setting("WORKSPACE_OWNER_PASSWORD_HASH");
    const gateway = setting("WORKSPACE_ACCESS_TOKEN") || setting("PPC_WORKSPACE_ACCESS_TOKEN");
    const ownerConfigured = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(password);
    const gatewayConfigured = gateway.length >= 32 && !/[\r\n]/.test(gateway);
    status = ownerConfigured || gatewayConfigured ? "ready" : "setup_required";
  } catch { /* Keep private storage, configuration and credential failures out of the response. */ }
  return Response.json({ status }, { status: status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
