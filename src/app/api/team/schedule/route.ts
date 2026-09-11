import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { executeScheduleCommand, scheduleView } from "@/lib/timeclock/schedule";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() { try { await requireSectionAccess("team", "view"); return json(scheduleView(undefined, true)); } catch { return json({ error: "Staff schedule access required." }, 403); } }
export async function POST(request: Request) {
  try { await requireSectionAccess("team", "edit"); } catch { return json({ error: "Schedule management access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { const actor = await requireIdentity(); const result = executeScheduleCommand(await boundedJson(new Response(request.body), 12000), actor, true); return json({ result, data: scheduleView(undefined, true) }); } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not save staff schedule." }, 400); }
}
