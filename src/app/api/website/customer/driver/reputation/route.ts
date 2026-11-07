import { NextResponse } from "next/server";
import { readAuthForm, escapeHtml } from "@/lib/auth/forms";
import { appBaseUrl } from "@/lib/connections/vault";
import { customerPage } from "@/lib/customer-access/page";
import { readReputation, updateReputation } from "@/lib/driver-reputation/store";
import { reputationHtml } from "@/lib/driver-reputation/html";
import { DriverError } from "@/lib/rideshare-driver/model";
import { checkDriverOrigin, driverFailure, driverJson, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/website/customer/driver/reputation";
const html = (request: Request) => request.headers.get("accept")?.includes("text/html") ?? false;
function failure(request: Request, error: unknown) {
  if (!html(request)) return driverFailure(error);
  const status = error instanceof DriverError ? error.status : 400;
  const message = error instanceof DriverError ? error.message : "Check the submitted reputation record and sign in again if needed.";
  return customerPage("Ratings & reviews need attention", `<p role="alert">${escapeHtml(message)}</p><a href="${path}">Return to ratings and reviews</a>`, status);
}
export async function GET(request: Request) {
  try { checkDriverOrigin(request); const state = readReputation(driverToken(request, true));
    return html(request) ? customerPage("Ratings & reviews", reputationHtml(state)) : Response.json(state, { headers: privateHeaders });
  } catch (error) { return failure(request, error); }
}
export async function POST(request: Request) {
  try {
    checkDriverOrigin(request);
    if (!request.headers.has("authorization") && request.headers.get("origin") !== new URL(appBaseUrl()).origin) throw new DriverError(403, "Return to your client account to continue.");
    const isForm = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/x-www-form-urlencoded";
    let raw: unknown;
    if (isForm) {
      const form = await readAuthForm(request, 8000);
      if (form.get("confirmed") !== "yes" || !["deleteRating", "deleteReview"].includes(form.get("action") ?? "")
        || [...form.keys()].some(key => !["action", "mutationId", "id", "confirmed"].includes(key) || form.getAll(key).length !== 1)) throw new DriverError(400, "Confirm one record deletion using its account form.");
      raw = { action: form.get("action"), mutationId: form.get("mutationId"), id: form.get("id") };
    } else raw = await driverJson(request);
    const state = updateReputation(driverToken(request, true), raw);
    if (!isForm) return Response.json(state, { headers: privateHeaders });
    const response = NextResponse.redirect(new URL(path, appBaseUrl()), 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) { return failure(request, error); }
}
