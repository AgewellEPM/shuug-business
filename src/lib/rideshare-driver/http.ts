import { z } from "zod";
import { appBaseUrl } from "../connections/vault";
import { customerToken } from "../customer-access/accounts";
import { DriverConflict } from "./store";
import { DriverError } from "./model";

export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export function driverToken(request: Request, cookie = false) {
  const value = request.headers.get("authorization");
  return value?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? (!value && cookie ? customerToken(request) : undefined);
}
export function checkDriverOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(appBaseUrl()).origin) throw new DriverError(403, "Origin not permitted.");
}
export async function boundedBytes(request: Request, maximum: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new DriverError(413, "The upload is too large.");
  const reader = request.body?.getReader(); if (!reader) throw new DriverError(400, "A request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maximum) { await reader.cancel(); throw new DriverError(413, "The upload is too large."); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function driverJson(request: Request) {
  checkDriverOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new DriverError(415, "Use application/json.");
  try { return JSON.parse((await boundedBytes(request, 32_000)).toString("utf8")); }
  catch (error) { if (error instanceof DriverError) throw error; throw new DriverError(400, "Invalid JSON."); }
}
export function driverFailure(error: unknown) {
  if (error instanceof DriverConflict) return Response.json({ error: error.message, current: error.current }, { status: 409, headers: privateHeaders });
  const status = error instanceof DriverError ? error.status : error instanceof z.ZodError ? 400 : 500;
  return Response.json({ error: error instanceof DriverError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message : "The workspace could not complete this request. Try again." }, { status, headers: privateHeaders });
}
