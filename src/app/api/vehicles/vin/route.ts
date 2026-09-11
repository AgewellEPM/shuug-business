import { requireIdentity } from "@/lib/auth/identity";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { applyVehicleVin, reviewVehicleVin, vehicleRegistry, vehicleClientOptions } from "@/lib/vehicles/service";
import { z } from "zod";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() { try { await requireSectionAccess("services", "view"); return json({ records: vehicleRegistry(), clients: vehicleClientOptions() }); } catch { return json({ error: "Vehicle access required." }, 403); } }
export async function POST(request: Request) {
  let actor; try { actor = await requireIdentity(); await requireSectionAccess("services", "edit"); } catch { return json({ error: "Vehicle edit access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { const { action, input } = z.object({ action: z.enum(["lookup", "apply"]), input: z.unknown() }).strict().parse(await boundedJson(new Response(request.body), 24000)); return json(action === "lookup" ? { review: await reviewVehicleVin(input, actor.id) } : { record: applyVehicleVin(input, actor) }); }
  catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not review this VIN." }, 400); }
}
