import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { executeScheduleCommand, scheduleView } from "@/lib/timeclock/schedule";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() { try { const user = await requireIdentity(); return json(scheduleView(user.memberId)); } catch { return json({ error: "Sign in to see your shifts." }, 401); } }
export async function POST(request: Request) {
  let user; try { user = await requireIdentity(); } catch { return json({ error: "Sign in to update your shifts." }, 401); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try { const result = executeScheduleCommand(await boundedJson(new Response(request.body), 8000), user, false); return json({ result, data: scheduleView(user.memberId) }); } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not update your shift." }, 400); }
}
