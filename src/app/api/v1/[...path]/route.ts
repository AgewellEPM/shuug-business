import { requireOwnerAccess } from "@/lib/auth/identity";
import { NextResponse } from "next/server";
import { businessHandlers } from "@/lib/backend/resources";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const rl = rateLimit(clientKey(req, "api-v1"), 240, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "60" } });

  const { path } = await ctx.params;
  const key = (path ?? []).join("/");
  const handler = businessHandlers()[key];
  if (!handler) return NextResponse.json({ error: "unknown resource", resource: key }, { status: 404 });

  try {
    await requireWorkspaceAccess();
    if (key === "cockpit") await requireOwnerAccess();
    await requireSectionAccess(handler.section, ["performance", "worktrack"].includes(key) ? "edit" : "view");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = await handler.load();
  return NextResponse.json({ resource: key, data, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
