import { z } from "zod";
import { setting } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { rateLimit } from "../security/rate-limit";
import { driverAccount } from "./policy";
import { DriverError } from "./model";

const endpoint = "https://routes.googleapis.com/directions/v2:computeRoutes";
const fieldMask = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description";
export const maximumRouteBytes = 4 * 1024 * 1024;
const maximumPoints = 50_000;
const unavailable = "Google Maps route comparisons are not available for this workspace yet. You can open Google Maps for directions.";
const invalidProvider = "Google Maps did not return a usable driving route. Try again or open Google Maps for directions.";
const point = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }).strict();
export const driverRouteInput = z.object({ origin: point, destination: point, alternatives: z.boolean().default(false) }).strict();
export type DriverRoutePoint = z.infer<typeof point>;
export type DriverRoadRoute = { distanceMeters: number; durationSeconds: number; points: DriverRoutePoint[]; name: string };

/** This dedicated credential never reuses the staff Visits key or authorization. */
function configuration() {
  const serverKey = setting("GOOGLE_MAPS_DRIVER_SERVER_KEY");
  const enabled = setting("GOOGLE_MAPS_DRIVER_ROUTES_ENABLED") === "true";
  return { serverKey, enabled, ready: enabled && Boolean(serverKey) };
}
export function googleDriverRouteConfiguration() {
  const { serverKey, enabled, ready } = configuration();
  return { serverKeyConfigured: Boolean(serverKey), enabled, ready };
}
export function driverRouteReadiness(token: string | undefined) {
  workspaceDatabase(db => driverAccount(db, token));
  const { ready } = configuration();
  return { provider: "googleRoutes" as const, ready, reason: ready ? "Google Maps route comparisons are enabled." : unavailable };
}

/** Decode Google's precision-5 polyline without accepting truncation or overflow. */
function decodePolyline(value: string, remaining: number): DriverRoutePoint[] {
  const points: DriverRoutePoint[] = [];
  let position = 0, latitude = 0, longitude = 0;
  function component() {
    let encoded = 0, shift = 0, more: boolean;
    do {
      if (position >= value.length || shift > 30) throw new DriverError(502, invalidProvider);
      const byte = value.charCodeAt(position++) - 63;
      if (byte < 0 || byte > 63) throw new DriverError(502, invalidProvider);
      encoded += (byte & 31) * 2 ** shift;
      if (encoded > 0x7fffffff) throw new DriverError(502, invalidProvider);
      more = (byte & 32) !== 0; shift += 5;
    } while (more);
    return encoded % 2 ? -(Math.floor(encoded / 2) + 1) : encoded / 2;
  }
  while (position < value.length) {
    if (points.length >= remaining) throw new DriverError(502, invalidProvider);
    latitude += component(); longitude += component();
    const current = { latitude: latitude / 100_000, longitude: longitude / 100_000 };
    if (!point.safeParse(current).success) throw new DriverError(502, invalidProvider);
    points.push(current);
  }
  if (points.length < 2) throw new DriverError(502, invalidProvider);
  return points;
}

const providerRoute = z.object({
  distanceMeters: z.number().int().min(0).max(10_000_000),
  duration: z.string().regex(/^\d+(?:\.\d{1,9})?s$/).max(40),
  polyline: z.object({ encodedPolyline: z.string().min(2).max(maximumRouteBytes) }),
  description: z.string().max(2000).optional(),
});
function endpointDistance(a: DriverRoutePoint, b: DriverRoutePoint) {
  const radians = Math.PI / 180, lat = (b.latitude - a.latitude) * radians, lng = (b.longitude - a.longitude) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function routesFromProvider(raw: unknown, input: z.infer<typeof driverRouteInput>): DriverRoadRoute[] {
  const parsed = z.object({ routes: z.array(providerRoute).max(3).default([]) }).safeParse(raw);
  if (!parsed.success) throw new DriverError(502, invalidProvider);
  if (!parsed.data.routes.length) throw new DriverError(404, "Google Maps could not find a driving route between these places.");
  let count = 0;
  return parsed.data.routes.map((route, index) => {
    const durationSeconds = Number(route.duration.slice(0, -1));
    if (!Number.isFinite(durationSeconds) || durationSeconds > 30 * 86400 || route.distanceMeters > 0 && durationSeconds === 0) throw new DriverError(502, invalidProvider);
    const points = decodePolyline(route.polyline.encodedPolyline, maximumPoints - count);
    if (endpointDistance(points[0], input.origin) > 5000 || endpointDistance(points[points.length - 1], input.destination) > 5000) throw new DriverError(502, invalidProvider);
    count += points.length;
    const name = route.description?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240) || `Google Maps route ${index + 1}`;
    return { distanceMeters: route.distanceMeters, durationSeconds, points, name };
  });
}
async function providerJSON(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumRouteBytes)) {
    await response.body?.cancel(); throw new DriverError(502, invalidProvider);
  }
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    await response.body?.cancel(); throw new DriverError(502, invalidProvider);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new DriverError(502, invalidProvider);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maximumRouteBytes) { await reader.cancel(); throw new DriverError(502, invalidProvider); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof DriverError) throw error;
    throw new DriverError(502, invalidProvider);
  } finally { reader.releaseLock(); }
}

/** Transient, authenticated comparisons; coordinates and Google results are never saved. */
export async function computeDriverRoutes(token: string | undefined, raw: unknown) {
  const account = workspaceDatabase(db => driverAccount(db, token));
  const input = driverRouteInput.parse(raw);
  const config = configuration();
  if (!config.ready) throw new DriverError(503, unavailable);
  if (!rateLimit(`driver-google-routes:${account.id}`, 30, 60_000).allowed) {
    throw new DriverError(429, "Map lookup limit reached. Try again shortly or open Google Maps for directions.");
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": config.serverKey, "X-Goog-FieldMask": fieldMask },
      body: JSON.stringify({
        origin: { location: { latLng: input.origin } }, destination: { location: { latLng: input.destination } },
        travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", computeAlternativeRoutes: input.alternatives,
        polylineQuality: "HIGH_QUALITY", polylineEncoding: "ENCODED_POLYLINE", languageCode: "en-US", units: "IMPERIAL",
      }),
    });
  } catch { throw new DriverError(503, "Google Maps could not complete this route lookup. Try again or open Google Maps for directions."); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new DriverError(response.status === 429 ? 429 : 503, "Google Maps route comparisons are temporarily unavailable. Try again or open Google Maps for directions.");
  }
  const routes = routesFromProvider(await providerJSON(response), input);
  workspaceDatabase(db => driverAccount(db, token));
  const current = configuration();
  if (!current.ready || current.serverKey !== config.serverKey) throw new DriverError(409, "Map settings changed. Try this lookup again.");
  const result = { provider: "googleRoutes" as const, measuredAt: new Date().toISOString(), routes };
  if (Buffer.byteLength(JSON.stringify(result)) > maximumRouteBytes) throw new DriverError(502, invalidProvider);
  return result;
}
