import { requireSectionAccess } from "@/lib/permissions/guard";
import { loadFinancialReports, financialReportCsv } from "@/lib/accounting/reports";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try { await requireSectionAccess("money", "view"); } catch { return Response.json({ error: "Accounting access required." }, { status: 403, headers }); }
  try {
    const p = new URL(request.url).searchParams;
    const report = await loadFinancialReports({ ...(p.has("from") ? { from: p.get("from")! } : {}), ...(p.has("through") ? { through: p.get("through")! } : {}) });
    if (p.get("format") === "csv") return new Response(financialReportCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="shuug-trial-balance.csv"' } });
    return Response.json(report, { headers });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Reports unavailable." }, { status: 400, headers }); }
}
