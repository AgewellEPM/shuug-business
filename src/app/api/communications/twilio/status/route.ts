import { acceptTwilioStatus, twilioParameters } from "@/lib/communications/webhooks";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return Response.json({ ok: true, ...acceptTwilioStatus(request, await twilioParameters(request)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Invalid or unauthenticated SMS status." }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}
