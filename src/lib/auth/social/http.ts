import { appBaseUrl, setting } from "../../connections/vault";
import { secureJson } from "../../secure-tax/http";
import { privateHeaders } from "../../rideshare-driver/http";
import { callbackUrl, SocialSignInError, type SocialProvider } from "./providers";
import { assertLegacyRouteAllowed } from "../../secure-tax/client-only/guard";
import { SecureTaxError } from "../../secure-tax/manifest";
export function socialCallbackUrl(request: Request, provider: SocialProvider) {
  const actual = new URL(request.url), expected = new URL(callbackUrl(provider));
  if (actual.pathname !== expected.pathname || actual.username || actual.password) throw new SocialSignInError();
  if (actual.origin === expected.origin) return actual;
  // Next constructs request.url from the container's listening hostname. Behind
  // HTTPS termination, require the exact public Host and unambiguous proxy
  // headers instead. Never derive the registered callback from these headers.
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (request.headers.get("host") !== expected.host || request.headers.get("x-forwarded-proto") !== "https" ||
      (forwardedHost !== null && forwardedHost !== expected.host)) throw new SocialSignInError();
  return actual;
}
export function socialRequestSurface(request: Request): "owner" | "portal" | "native" {
  assertLegacyRouteAllowed(request);
  const origin = request.headers.get("origin");
  if (origin === new URL(appBaseUrl()).origin) return "owner";
  const trusted = setting("SHUUG_SECURE_TAX_TRUSTED_ORIGIN");
  if (trusted && origin === trusted && trusted !== new URL(appBaseUrl()).origin && trusted.startsWith("https://")) return "portal";
  if (!request.headers.has("origin") && !request.headers.has("sec-fetch-site") && !request.headers.has("cookie")) return "native";
  throw new SocialSignInError("Use the trusted app or sign-in website.", 403);
}
export function workspacePortalOrigin() {
  const value = setting("SHUUG_SECURE_TAX_TRUSTED_ORIGIN");
  const origin = value ? URL.parse(value) : null;
  if (process.env.GIGTAX_REQUIRE_CLIENT_ONLY !== "true" || !origin || origin.protocol !== "https:" || origin.origin !== value || origin.origin === new URL(appBaseUrl()).origin) {
    throw new SocialSignInError("The shared Gig Tax Pros workspace is unavailable.", 503);
  }
  return origin.origin;
}
export function requireWorkspacePortal(request: Request) {
  if (request.headers.get("origin") !== workspacePortalOrigin()) throw new SocialSignInError("Continue from the Gig Tax Pros sign-in page.", 403);
}
export const socialJson = (request: Request) => secureJson(request, 8192);
export function socialResponse(request: Request, value: unknown, status = 200) {
  const response = Response.json(value, { status, headers: { ...privateHeaders, Vary: "Origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  const origin = request.headers.get("origin");
  try { const surface = socialRequestSurface(request); if (origin && surface !== "native") { response.headers.set("Access-Control-Allow-Origin", origin); response.headers.set("Access-Control-Allow-Credentials", "true"); } } catch { /* No CORS authority for a foreign origin. */ }
  return response;
}
export function socialFailure(request: Request, error: unknown) {
  const known = error instanceof SocialSignInError || error instanceof SecureTaxError;
  return socialResponse(request, { error: known ? error.message : "Sign-in could not be completed. Start again." }, known ? error.status : 400);
}
export function socialOptions(request: Request) {
  try {
    socialRequestSurface(request);
    const response = socialResponse(request, {});
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return response;
  } catch (error) { return socialFailure(request, error); }
}
