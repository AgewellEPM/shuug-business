import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/connections/vault";
import { CUSTOMER_PATH } from "@/lib/customer-access/accounts";
import { driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
import { completeUberAuthorization } from "@/lib/gig-connections/uber";
import { consumeUberState } from "@/lib/gig-connections/uber-store";
import { uberConfiguration, UberError } from "@/lib/gig-connections/uber-provider";
import { uberFailure } from "@/lib/gig-connections/uber-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams, token = driverToken(request, true), state = parameters.get("state") ?? "";
    if (parameters.has("error")) { consumeUberState(state, token, uberConfiguration().clientId); throw new UberError(400, "Uber authorization was not completed. No new authorization was saved."); }
    await completeUberAuthorization(token, state, parameters.get("code") ?? "");
    const response = NextResponse.redirect(new URL(`${CUSTOMER_PATH}#uber-connection`, appBaseUrl()), 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) { return uberFailure(error); }
}
