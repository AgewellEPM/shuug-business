import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { clientBooks, saveClientBook } from "@/lib/accounting/client-books";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { await requireSectionAccess("money", "view"); return Response.json({ books: clientBooks(await requireIdentity()) }, { headers }); }
  catch { return Response.json({ error: "Accounting access required." }, { status: 403, headers }); }
}
export async function POST(request: Request) {
  let user;
  try { await requireSectionAccess("money", "edit"); user = await requireIdentity(); if (!user.isOwner) throw new Error(); }
  catch { return Response.json({ error: "Owner accounting access required." }, { status: 403, headers }); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return Response.json({ error: "Origin not permitted." }, { status: 403, headers });
  try { return Response.json({ book: saveClientBook(await boundedJson(new Response(request.body), 50000), user) }, { headers }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Cannot save client book." }, { status: 400, headers }); }
}
