import { uberCaller, uberFailure } from "@/lib/gig-connections/uber-http";
import { uberConnectionSummary } from "@/lib/gig-connections/uber";
import { privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return Response.json(uberConnectionSummary(uberCaller(request)), { headers: privateHeaders }); }
  catch (error) { return uberFailure(error); }
}
