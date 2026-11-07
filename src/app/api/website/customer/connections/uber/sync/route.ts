import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/connections/vault";
import { CUSTOMER_PATH } from "@/lib/customer-access/accounts";
import { uberCaller, uberPeriodInput, uberFailure } from "@/lib/gig-connections/uber-http";
import { syncUber } from "@/lib/gig-connections/uber";
import { privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const token = uberCaller(request, true), period = await uberPeriodInput(request);
    const result = await syncUber(token, period.fromDay, period.throughDay);
    if (request.headers.get("accept")?.includes("application/json")) return Response.json(result, { headers: privateHeaders });
    const response = NextResponse.redirect(new URL(`${CUSTOMER_PATH}#uber-connection`, appBaseUrl()), 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) { return uberFailure(error); }
}
