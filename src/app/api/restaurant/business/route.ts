import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity, requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { executeRestaurantCommand, moneyRestaurantActions, marketingRestaurantActions, restaurantCommandSchema } from "@/lib/restaurant/business";
import { restaurantManagementData } from "@/lib/restaurant/management";
import { z } from "zod";
import { reportRequestQuery } from "@/lib/restaurant/report-model";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  try { await requireSectionAccess("operations", "view"); } catch { return json({ error: "Restaurant access required." }, 403); }
  let financial = false; try { await requireSectionAccess("money", "view"); financial = true; } catch { /* operational projection only */ }
  try { return json(restaurantManagementData(financial, reportRequestQuery(request.url))); }
  catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not read the restaurant." }, 400); }
}
export async function POST(request: Request) {
  let actor; try { actor = await requireIdentity(); } catch { return json({ error: "Sign in to update restaurant records." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const command = restaurantCommandSchema.parse(await boundedJson(new Response(request.body), 200000));
    try { if (["configure", "website.configure", "special.publish"].includes(command.action)) await requireOwnerAccess(); else await requireSectionAccess(moneyRestaurantActions.includes(command.action) ? "money" : marketingRestaurantActions.includes(command.action) ? "marketing" : "operations", "edit"); } catch { return json({ error: "Your role cannot perform this restaurant action." }, 403); }
    return json({ ok: true, result: executeRestaurantCommand(command, `${actor.name} (${actor.id})`) });
  } catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not update the restaurant." }, 400); }
}
