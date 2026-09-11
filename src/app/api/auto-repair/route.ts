import { z } from "zod";
import { requireIdentity } from "@/lib/auth/identity";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { executeRepairCommand, repairWorkspace } from "@/lib/auto-repair/service";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() { try { await requireSectionAccess("services", "view"); return json(repairWorkspace()); } catch { return json({ error: "Service access required." }, 403); } }
export async function POST(request: Request) {
  let actor; try { actor = await requireIdentity(); await requireSectionAccess("services", "edit"); } catch { return json({ error: "Service edit access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { return json({ result: executeRepairCommand(await boundedJson(new Response(request.body), 250000), actor) }); }
  catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not update repair pricing." }, 400); }
}
