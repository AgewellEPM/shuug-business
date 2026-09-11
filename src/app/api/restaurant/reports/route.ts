import { requireSectionAccess } from "@/lib/permissions/guard";
import { restaurantReportData } from "@/lib/restaurant/report-service";
import { reportRequestQuery } from "@/lib/restaurant/report-model";
import { restaurantReportCsv } from "@/lib/restaurant/sales-report";
import { z } from "zod";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  try { await requireSectionAccess("money", "view"); } catch { return Response.json({ error: "Restaurant financial access required." }, { status: 403, headers }); }
  try {
    const report = restaurantReportData(reportRequestQuery(request.url)), format = new URL(request.url).searchParams.get("format");
    if (format === "csv") return new Response(restaurantReportCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="restaurant-service-days.csv"' } });
    if (format && format !== "json") throw new Error("Choose JSON or CSV report format.");
    return Response.json(report, { headers });
  } catch (e) { return Response.json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not load the restaurant report." }, { status: 400, headers }); }
}
