import { NextResponse } from "next/server";
import { uberCaller, uberFailure } from "@/lib/gig-connections/uber-http";
import { authorizeUber } from "@/lib/gig-connections/uber";
import { privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const authorization = authorizeUber(uberCaller(request, true), Boolean(request.headers.get("authorization")));
    if (request.headers.get("accept")?.includes("application/json")) return Response.json(authorization, { headers: privateHeaders });
    const response = NextResponse.redirect(authorization.authorizationUrl, 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) { return uberFailure(error); }
}
