import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { requireBook } from "@/lib/accounting/client-books";
import { bookView, bookCommand } from "@/lib/accounting/book-service";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { financialReportCsv, financialReports } from "@/lib/accounting/reports";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ bookId: string }> };
export async function GET(request: Request, context: Context) {
  const { bookId } = await context.params; let user;
  try { await requireSectionAccess("money", "view"); user = await requireIdentity(); requireBook(bookId, user); }
  catch { return Response.json({ error: "Client book access required." }, { status: 403, headers }); }
  try {
    const view = await bookView(bookId, user), params = new URL(request.url).searchParams;
    const report = financialReports(view.entries, view.accounts, { ...(params.get("from") ? { from: params.get("from")! } : {}), ...(params.get("through") ? { through: params.get("through")! } : {}) });
    if (params.get("format") === "csv") return new Response(financialReportCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="shuug-client-trial-balance.csv"' } });
    return Response.json({ ...view, reports: report }, { headers });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Cannot read client books." }, { status: 400, headers }); }
}
export async function POST(request: Request, context: Context) {
  const { bookId } = await context.params; let user;
  try { await requireSectionAccess("money", "edit"); user = await requireIdentity(); requireBook(bookId, user, true); }
  catch { return Response.json({ error: "Client book edit access required." }, { status: 403, headers }); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return Response.json({ error: "Origin not permitted." }, { status: 403, headers });
  try { return Response.json({ result: await bookCommand(bookId, await boundedJson(new Response(request.body), 2_100_000), user) }, { headers }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Cannot update books." }, { status: 400, headers }); }
}
