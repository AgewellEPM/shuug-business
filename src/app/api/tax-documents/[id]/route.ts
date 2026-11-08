import { z } from "zod";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedBytes, privateHeaders } from "@/lib/rideshare-driver/http";
import { staffTaxDocument, taxDocumentResponse, reviewTaxDocument } from "@/lib/customer-access/tax-documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { await requireSectionAccess("services", "view"); return taxDocumentResponse(staffTaxDocument((await context.params).id, await requireIdentity())); }
  catch { return new Response("Document unavailable.", { status: 404, headers: privateHeaders }); }
}
export async function POST(request: Request, context: Context) {
  try { await requireSectionAccess("services", "edit"); } catch { return Response.json({ error: "Document review is not permitted." }, { status: 403, headers: privateHeaders }); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return Response.json({ error: "Origin not permitted." }, { status: 403, headers: privateHeaders });
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("JSON required");
    const input = z.object({ status: z.enum(["received", "reviewed", "replacement_requested"]) }).strict().parse(JSON.parse((await boundedBytes(request, 2048)).toString("utf8")));
    const user=await requireIdentity(); reviewTaxDocument((await context.params).id, input.status, user.id, user);
    return Response.json({ ok: true, status: input.status }, { headers: privateHeaders });
  } catch { return Response.json({ error: "Document review could not be recorded." }, { status: 400, headers: privateHeaders }); }
}
