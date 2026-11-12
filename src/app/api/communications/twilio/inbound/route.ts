import { acceptTwilioInbound, twilioParameters } from "@/lib/communications/webhooks";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const result = acceptTwilioInbound(request, await twilioParameters(request));
    return new Response(result.response, { headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Invalid or unauthenticated SMS webhook." }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}
