import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { executeDiningCommand, diningManagementData } from "@/lib/restaurant/dining";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() { try { await requireSectionAccess("operations", "view"); return json(diningManagementData()); } catch { return json({ error: "Restaurant access required." }, 403); } }
export async function POST(request: Request) {
  try { await requireSectionAccess("operations", "edit"); } catch { return json({ error: "Restaurant editing access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { const actor = await requireIdentity(), result = executeDiningCommand(await boundedJson(new Response(request.body), 50000), `${actor.name} (${actor.id})`, actor.isOwner); return json({ result, data: diningManagementData() }); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Could not update restaurant reservations." }, 400); }
}
