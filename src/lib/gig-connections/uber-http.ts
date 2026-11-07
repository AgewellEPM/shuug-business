import { z } from "zod";
import { appBaseUrl } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { boundedBytes, driverToken, privateHeaders } from "../rideshare-driver/http";
import { DriverError } from "../rideshare-driver/model";
import { UberError } from "./uber-provider";
import { scopedUber } from "./uber-store";
export function uberCaller(request: Request, write = false) {
  const origin = request.headers.get("origin"), bearer = request.headers.get("authorization")?.startsWith("Bearer ");
  if ((origin && origin !== new URL(appBaseUrl()).origin) || (write && !origin && !bearer)) throw new UberError(403, "Return to your own client workspace to use this connection.");
  const token = driverToken(request, true);
  workspaceDatabase(db => scopedUber(db, token));
  return token!;
}
export async function uberPeriodInput(request: Request) {
  const bytes = await boundedBytes(request, 4000), type = request.headers.get("content-type")?.split(";")[0].trim();
  let raw: unknown;
  if (type === "application/json") { try { raw = JSON.parse(bytes.toString("utf8")); } catch { throw new UberError(400, "Check the requested sync dates."); } }
  else if (type === "application/x-www-form-urlencoded") raw = Object.fromEntries(new URLSearchParams(bytes.toString("utf8")));
  else throw new UberError(415, "Use the connection's sync form.");
  return z.object({ fromDay: z.string().optional(), throughDay: z.string().optional() }).strict().parse(raw);
}
export function uberFailure(error: unknown) {
  const status = error instanceof UberError || error instanceof DriverError ? error.status : error instanceof z.ZodError ? 400 : 500;
  const message = error instanceof UberError || error instanceof DriverError ? error.message : error instanceof z.ZodError ? "Check the requested connection details." : "The provider connection could not complete this request. Your saved records are kept.";
  return Response.json({ error: message }, { status, headers: privateHeaders });
}
