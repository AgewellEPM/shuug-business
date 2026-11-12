import { boundedJson } from "@/lib/social/http";
import { acceptMailgunEvent } from "@/lib/communications/webhooks";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return Response.json({ ok: true, ...acceptMailgunEvent(await boundedJson(new Response(request.body), 32000)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Invalid or unauthenticated mail webhook." }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}
