import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/connections/vault";
import { escapeHtml, readAuthForm } from "@/lib/auth/forms";
import { customerPage } from "@/lib/customer-access/page";
import { readCoach, updateCoach } from "@/lib/driver-coach/store";
import { coachPeriod } from "@/lib/driver-coach/model";
import { coachFormMutation, coachPortalHtml } from "@/lib/driver-coach/html";
import { DriverError } from "@/lib/rideshare-driver/model";
import { checkDriverOrigin, driverFailure, driverJson, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
import { workspaceDatabase } from "@/lib/workspace/database";
import { driverAccount } from "@/lib/rideshare-driver/policy";
import { assertPlaintextTaxAllowed, SecureTaxRequiredError } from "@/lib/secure-tax/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/website/customer/driver/coach";
const htmlRequest = (request: Request) => request.headers.get("accept")?.includes("text/html") ?? false;
export async function GET(request: Request) {
  try {
    checkDriverOrigin(request);
    const query = new URL(request.url).searchParams;
    const period = coachPeriod({ from: query.get("from") ?? undefined, through: query.get("through") ?? undefined });
    const state = readCoach(driverToken(request, true), period);
    return htmlRequest(request) ? customerPage("Tax & Goals", coachPortalHtml(state, period)) : Response.json(state, { headers: privateHeaders });
  } catch (error) {
    if (!htmlRequest(request)) return driverFailure(error);
    return customerPage("Tax & Goals unavailable", `<p role="alert">${escapeHtml(error instanceof DriverError ? error.message : "Sign in again or review the selected dates.")}</p><p><a href="/api/website/customer">Return to your client account</a></p>`, error instanceof DriverError ? error.status : 400);
  }
}
export async function POST(request: Request) {
  let submitted: URLSearchParams | undefined;
  try {
    checkDriverOrigin(request);
    const isForm = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/x-www-form-urlencoded";
    // Browser cookies require a same-origin POST. Native bearer requests can omit Origin.
    if (!request.headers.has("authorization") && request.headers.get("origin") !== new URL(appBaseUrl()).origin) throw new DriverError(403, "Return to your client workspace to continue.");
    const token = driverToken(request, true);
    workspaceDatabase(db => { const account = driverAccount(db, token); assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db); });
    const raw = isForm ? coachFormMutation(submitted = await readAuthForm(request, 16_000)) : await driverJson(request);
    const state = await updateCoach(token, raw);
    if (!isForm) return Response.json(state, { headers: privateHeaders });
    const period = coachPeriod(raw);
    const response = NextResponse.redirect(new URL(`${path}?${new URLSearchParams(period)}#tax-goals`, appBaseUrl()), 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) {
    if (!htmlRequest(request)) return driverFailure(error);
    const failure = driverFailure(error), body = await failure.json() as { error: string };
    if (failure.status === 401 || failure.status === 403 || error instanceof SecureTaxRequiredError) return customerPage("Coach access unavailable", `<p role="alert">${escapeHtml(body.error)}</p><a href="/api/website/customer">Return to your client account</a>`, failure.status);
    try {
      const period = coachPeriod({ from: submitted?.get("from") ?? undefined, through: submitted?.get("through") ?? undefined });
      const state = readCoach(driverToken(request, true), period);
      const draft = submitted?.get("action") === "message" && /^[a-f\d-]{36}$/i.test(submitted.get("messageId") ?? "") && /^[a-f\d-]{36}$/i.test(submitted.get("mutationId") ?? "")
        ? { text: submitted.get("text") ?? "", messageId: submitted.get("messageId")!, mutationId: submitted.get("mutationId")! } : undefined;
      return customerPage("Tax & Goals", coachPortalHtml(state, period, body.error, draft), failure.status);
    } catch {
      return customerPage("Coach needs attention", `<p role="alert">${escapeHtml(body.error)}</p><a href="/api/website/customer">Return to your client account</a>`, failure.status);
    }
  }
}
