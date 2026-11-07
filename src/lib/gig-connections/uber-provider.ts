import { z } from "zod";
import { appBaseUrl, setting } from "../connections/vault";

export const UBER_DRIVER_SCOPES = ["partner.accounts", "partner.trips", "partner.payments"] as const;
export const UBER_CALLBACK_PATH = "/api/website/customer/connections/uber/callback";
export class UberError extends Error {
  constructor(public status: number, message: string, public providerAuthorization = false) { super(message); }
}
export function uberConfiguration() {
  const clientId = setting("UBER_DRIVER_CLIENT_ID"), clientSecret = setting("UBER_DRIVER_CLIENT_SECRET");
  let redirectUri = "", publicOrigin = false;
  try { const origin = new URL(appBaseUrl()); publicOrigin = origin.protocol === "https:" && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/" && origin.hostname.includes(".") && !origin.hostname.endsWith(".local") && !origin.hostname.endsWith(".internal") && !origin.hostname.endsWith(".localhost") && !/^[\d.]+$/.test(origin.hostname) && !origin.hostname.includes(":"); redirectUri = new URL(UBER_CALLBACK_PATH, origin).href; } catch {}
  const approved = setting("UBER_DRIVER_APPROVED") === "true";
  const ready = Boolean(publicOrigin && clientId && clientSecret && approved);
  return { ready, approved, clientId, clientSecret, redirectUri,
    reason: ready ? "Uber's approved read-only driver connection is available. You choose whether to authorize it."
      : "Uber driver account sync requires the firm's approved Uber application and secure connection settings. It is not active yet." };
}
export function requireUberConfiguration() {
  const configuration = uberConfiguration();
  if (!configuration.ready) throw new UberError(503, configuration.reason);
  return configuration;
}
export const uberProfileSchema = z.object({ driver_id: z.string().min(1).max(2048), first_name: z.string().max(200), last_name: z.string().max(200), activation_status: z.string().max(100).optional() });
export type UberProfile = z.infer<typeof uberProfileSchema>;
const timestamp = z.number().int().nonnegative().max(253402300799);
const amount = z.number().finite().min(-10_000_000).max(10_000_000);
export const uberPaymentSchema = z.object({ payment_id: z.string().min(1).max(2048), event_time: timestamp, amount, currency_code: z.string().regex(/^[A-Z]{3}$/), driver_id: z.string().min(1).max(2048).optional(), category: z.string().max(100).optional(), trip_id: z.string().max(2048).nullable().optional() });
export const uberTripSchema = z.object({ trip_id: z.string().min(1).max(2048), driver_id: z.string().min(1).max(2048).optional(), status: z.string().max(100), fare: amount.optional(), currency_code: z.string().regex(/^[A-Z]{3}$/).optional(), distance: z.number().finite().min(0).max(1_000_000).nullable().optional(), duration: z.number().finite().min(0).max(31_536_000).optional(), pickup: z.object({ timestamp: timestamp.nullable() }).optional(), dropoff: z.object({ timestamp: timestamp.nullable() }).optional() });
export type UberPayment = z.infer<typeof uberPaymentSchema>;
export type UberTrip = z.infer<typeof uberTripSchema>;
export const uberTokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number().int().positive().max(366 * 86400), token_type: z.string().refine(value => value.toLowerCase() === "bearer"), scope: z.string().optional() });
export type UberTokens = { accessToken: string; refreshToken?: string; expiresAt: number; clientId: string };

async function boundedJson(response: Response) {
  if (!response.body) throw new UberError(503, "Uber returned an incomplete response. Your saved records are unchanged.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 2_000_000) { await reader.cancel(); throw new UberError(503, "Uber returned more data than this request can safely process."); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new UberError(503, "Uber returned an unexpected response. Your saved records are unchanged."); }
}
export async function uberRequest<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) }); }
  catch { throw new UberError(503, "Uber could not be reached. Your saved records are unchanged."); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new UberError(409, "Uber authorization needs to be renewed. Reconnect through Uber to continue.", true);
    if (response.status === 400 && url === "https://auth.uber.com/oauth/v2/token") {
      const error = await boundedJson(response);
      if (error?.error === "invalid_grant" || error?.error === "token not found") throw new UberError(409, "Uber authorization needs to be renewed. Reconnect through Uber to continue.", true);
    }
    throw new UberError(503, response.status === 429 ? "Uber is limiting requests. Try syncing again later." : "Uber could not complete this request. Your saved records are unchanged.");
  }
  const parsed = schema.safeParse(await boundedJson(response));
  if (!parsed.success) throw new UberError(503, "Uber returned unsupported data. Your saved records are unchanged.");
  return parsed.data;
}
export async function exchangeUberToken(fields: Record<string, string>, previous?: UberTokens): Promise<UberTokens> {
  const configuration = requireUberConfiguration();
  const input = new URLSearchParams({ client_id: configuration.clientId, client_secret: configuration.clientSecret, ...fields });
  const token = await uberRequest("https://auth.uber.com/oauth/v2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: input }, uberTokenSchema);
  const scopes = (token.scope ?? (previous ? UBER_DRIVER_SCOPES.join(" ") : "")).split(/\s+/);
  const result = { accessToken: token.access_token, refreshToken: token.refresh_token ?? previous?.refreshToken, expiresAt: Date.now() + token.expires_in * 1000, clientId: configuration.clientId };
  if (!UBER_DRIVER_SCOPES.every(scope => scopes.includes(scope))) { await revokeUberToken(result); throw new UberError(409, "Uber did not grant all requested read-only permissions. Reconnect and review the permissions."); }
  return result;
}
export function uberGetProfile(tokens: UberTokens) {
  return uberRequest("https://api.uber.com/v1/partners/me", { headers: { Authorization: `Bearer ${tokens.accessToken}` } }, uberProfileSchema);
}
export async function revokeUberToken(tokens: UberTokens) {
  const configuration = uberConfiguration();
  if (!configuration.clientSecret || configuration.clientId !== tokens.clientId) return false;
  try {
    const response = await fetch("https://auth.uber.com/oauth/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: configuration.clientId, client_secret: configuration.clientSecret, token: tokens.accessToken }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return response.ok;
  } catch { return false; }
}

/** Complete windows only. Bounded pagination fails before any facts are committed. */
export async function uberFacts(tokens: UberTokens, driverId: string, from: number, to: number, recheck: () => void) {
  const trips: UberTrip[] = [], payments: UberPayment[] = [];
  const started = Date.now(); let requests = 0;
  for (let start = from; start < to; start += 10 * 86400) {
    const end = Math.min(to, start + 10 * 86400);
    for (const kind of ["trips", "payments"] as const) {
      let offset = 0, expectedCount: number | undefined;
      for (;;) {
        recheck();
        if (++requests > 24 || Date.now() - started > 90_000) throw new UberError(409, "This period contains too many provider records. Sync a shorter date range.");
        const url = new URL(`https://api.uber.com/v1/partners/${kind}`);
        for (const [key, value] of Object.entries({ from_time: start, to_time: end, offset, limit: 50 })) url.searchParams.set(key, String(value));
        const headers = { Authorization: `Bearer ${tokens.accessToken}` };
        const page = kind === "trips"
          ? await uberRequest(url.href, { headers }, z.object({ count: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), trips: z.array(uberTripSchema).max(50) }))
          : await uberRequest(url.href, { headers }, z.object({ count: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), payments: z.array(uberPaymentSchema).max(50) }));
        recheck();
        if (page.offset !== offset) throw new UberError(503, "Uber pagination changed. Try the sync again.");
        if (expectedCount !== undefined && expectedCount !== page.count) throw new UberError(503, "Uber records changed during pagination. Try the sync again.");
        expectedCount = page.count;
        const rows = "trips" in page ? page.trips : page.payments;
        if (rows.some(row => row.driver_id && row.driver_id !== driverId)) throw new UberError(409, "Uber returned records for a different driver. No records were imported.");
        if ("trips" in page) trips.push(...page.trips); else payments.push(...page.payments);
        offset += rows.length;
        if (offset >= page.count) break;
        if (!rows.length) throw new UberError(503, "Uber returned an incomplete page. No records were imported.");
      }
    }
  }
  return { trips: [...new Map(trips.map(row => [row.trip_id, row])).values()], payments: [...new Map(payments.map(row => [row.payment_id, row])).values()] };
}
