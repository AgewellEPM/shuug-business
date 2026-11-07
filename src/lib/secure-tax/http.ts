import { z } from "zod";
import { appBaseUrl } from "../connections/vault";
import { boundedBytes, driverToken, privateHeaders } from "../rideshare-driver/http";
import { DriverError } from "../rideshare-driver/model";
import { SecureTaxError } from "./manifest";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount } from "../rideshare-driver/policy";

function trustedOrigin() {
  const value = process.env.SHUUG_SECURE_TAX_TRUSTED_ORIGIN;
  if (!value) return undefined;
  try { const origin = new URL(value), loopback = ["localhost", "127.0.0.1"].includes(origin.hostname); if (origin.origin !== value || (origin.protocol !== "https:" && !loopback) || (!loopback && origin.origin === new URL(appBaseUrl()).origin)) throw new Error("Invalid independent origin"); return origin.origin; }
  catch { throw new SecureTaxError(503, "The trusted encrypted-client origin is not configured correctly."); }
}
export function secureRequestToken(request: Request, mutation = false) {
  const origin = request.headers.get("origin"), permitted = trustedOrigin();
  if (origin && origin !== permitted) throw new SecureTaxError(403, "Use the separately trusted encrypted client to access this vault.");
  const bearer = request.headers.get("authorization");
  if (mutation && !bearer && (!permitted || origin !== permitted)) throw new SecureTaxError(403, "Encrypted browser changes require an explicitly configured independent trusted origin.");
  return driverToken(request, true);
}
export function authenticateSecureRequest(token: string | undefined) { workspaceDatabase(db => driverAccount(db, token)); }
export async function secureJson(request: Request, maximum: number) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new SecureTaxError(415, "Use a JSON encrypted envelope.");
  try { return JSON.parse((await boundedBytes(request, maximum)).toString("utf8")); }
  catch (error) { if (error instanceof DriverError) throw error; throw new SecureTaxError(400, "Invalid encrypted request JSON."); }
}
export function secureResponse(request: Request, value: unknown, status = 200) {
  const response = Response.json(value, { status, headers: { ...privateHeaders, "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", Vary: "Origin" } });
  const origin = request.headers.get("origin");
  if (origin && origin === trustedOrigin()) { response.headers.set("Access-Control-Allow-Origin", origin); response.headers.set("Access-Control-Allow-Credentials", "true"); }
  return response;
}
export function secureFailure(request: Request, error: unknown) {
  const status = error instanceof SecureTaxError || error instanceof DriverError ? error.status : error instanceof z.ZodError ? 400 : 500;
  const message = error instanceof SecureTaxError || error instanceof DriverError ? error.message : error instanceof z.ZodError ? "The encrypted envelope or request does not match the supported schema." : "The encrypted vault could not complete this request.";
  // Do not reflect submitted payloads, provider values or key material in errors.
  try { return secureResponse(request, { error: message }, status); }
  catch { return Response.json({ error: message }, { status, headers: privateHeaders }); }
}
export function secureOptions(request: Request) {
  try {
    secureRequestToken(request);
    const response = new Response(null, { status: 204, headers: { ...privateHeaders, Vary: "Origin" } });
    const origin = request.headers.get("origin");
    if (origin === trustedOrigin()) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      response.headers.set("Access-Control-Max-Age", "300");
    }
    return response;
  } catch (error) { return secureFailure(request, error); }
}
