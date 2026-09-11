import { requireSectionAccess } from "@/lib/permissions/guard";
import { restaurantFinanceData } from "@/lib/restaurant/management";
import { reportRequestQuery } from "@/lib/restaurant/report-model";
import { z } from "zod";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try { await requireSectionAccess("money", "view"); }
  catch { return Response.json({ error: "Restaurant financial access required." }, { status: 403, headers }); }
  try { return Response.json(restaurantFinanceData(reportRequestQuery(request.url)), { headers }); }
  catch (e) { return Response.json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not read restaurant reports." }, { status: 400, headers }); }
}
