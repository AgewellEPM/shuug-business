import { createHash } from "node:crypto";
import { z } from "zod";
import { appBaseUrl, setting } from "../connections/vault";
import { DriverError } from "../rideshare-driver/model";

export class ArgyleError extends DriverError {}
export const resourceKinds = ["gigs", "shifts", "ratings", "vehicles"] as const;
export type ResourceKind = typeof resourceKinds[number];
export const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const webhookPath = "/api/integrations/argyle/webhook";
export function argyleConfiguration() {
  const environment = setting("ARGYLE_ENV") === "production" ? "production" : "sandbox";
  const apiKeyId = setting("ARGYLE_API_KEY_ID"), apiKeySecret = setting("ARGYLE_API_KEY_SECRET");
  const webhookSecret = setting("ARGYLE_WEBHOOK_SECRET");
  let publicWorkspace = false;
  try { const url = new URL(appBaseUrl()); publicWorkspace = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && !url.hostname.endsWith(".local") && !url.hostname.endsWith(".internal") && url.hostname.includes(".") && !/^[\d.]+$/.test(url.hostname); } catch {}
  const enabled = setting("ARGYLE_ENABLED") === "true";
  const fingerprint = createHash("sha256").update(`${environment}:${apiKeyId}`).digest("hex");
  return { environment, apiKeyId, apiKeySecret, webhookSecret, fingerprint, publicWorkspace, enabled,
    base: environment === "production" ? "https://api.argyle.com/v2/" : "https://api-sandbox.argyle.com/v2/",
    ready: Boolean(enabled && publicWorkspace && apiKeyId && apiKeySecret && webhookSecret.length >= 32),
    webhookUrl: `${appBaseUrl().replace(/\/$/, "")}${webhookPath}`,
  };
}
export function requireArgyle() {
  const config = argyleConfiguration();
  if (!config.ready) throw new ArgyleError(503, "Your firm needs to finish the Argyle account connection setup.");
  return config;
}
export function requireArgyleCredentials(revoking = false) {
  const config=argyleConfiguration();
  if((!config.enabled&&!revoking)||!config.apiKeyId||!config.apiKeySecret) throw new ArgyleError(503,"Save and enable the firm's Argyle API keys first.");
  return config;
}
export async function argyleRequest<T>(endpoint: string | URL, schema: z.ZodType<T>, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const c = requireArgyleCredentials(method === "DELETE"), url = new URL(endpoint, c.base), base = new URL(c.base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password || url.hash) throw new ArgyleError(502, "The provider returned an unsupported next page.");
  let response: Response;
  try { response = await fetch(url, { method, headers: { Authorization: `Basic ${Buffer.from(`${c.apiKeyId}:${c.apiKeySecret}`).toString("base64")}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) }); }
  catch { throw new ArgyleError(503, "The account provider could not be reached. Your saved records are kept."); }
  if (!response.ok) throw new ArgyleError(response.status === 404 ? 404 : 503, response.status === 429 ? "The provider is busy. Updates will retry later." : "The provider could not complete this request. Check the connection and try again.");
  if (response.status === 204) return schema.parse(null);
  const reader = response.body?.getReader(); if (!reader) throw new ArgyleError(502, "The provider returned an empty response.");
  const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 4_000_000) { await reader.cancel(); throw new ArgyleError(502, "The provider response was too large."); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  try { return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { throw new ArgyleError(502, "The provider returned unsupported data. Your saved records are kept."); }
}
export async function argyleList<T>(resource: string, schema: z.ZodType<T>, filters: Record<string,string>, cap = 5000, workerDeadline = Infinity) {
  let next: URL | null = new URL(resource, requireArgyleCredentials().base); const rows: T[] = [], seen = new Set<string>();
  const deadline=Math.min(Date.now()+90_000,workerDeadline);
  while (next) {
    if(Date.now()>deadline) throw new ArgyleError(503,"The provider update took too long. It will retry without replacing saved records.");
    if (next.pathname !== new URL(resource, requireArgyleCredentials().base).pathname) throw new ArgyleError(502, "The provider changed the requested resource.");
    for (const [key,value] of Object.entries({ ...filters, limit: "200" })) next.searchParams.set(key,value);
    if (seen.has(next.href) || seen.size >= Math.ceil(cap/200)+1) throw new ArgyleError(502, "The provider returned incomplete pagination.");
    seen.add(next.href);
    const page: { next: string | null; results: T[] } = await argyleRequest(next, z.object({ next: z.string().nullable(), results: z.array(schema).max(200) }));
    rows.push(...page.results);
    if (rows.length > cap || (page.next && page.results.length === 0)) throw new ArgyleError(502, "This record window is too large or incomplete. Your saved records are kept.");
    next = page.next ? new URL(page.next, requireArgyleCredentials().base) : null;
  }
  return rows;
}
const text = z.string().max(2000).nullable().optional();
const number = z.union([z.string().max(80),z.number().finite()]).nullable().optional();
const time = z.string().datetime({ offset: true }).nullable().optional();
const location = z.object({ lat: number, lng: number, formatted_address: text }).nullable().optional();
const income = z.object({ currency: z.string().length(3).nullable().optional(), total: number, pay: number, tips: number, fees: number, bonus: number, other: number }).nullable().optional();
export const sourceRecord = z.object({ id: providerId, account: providerId, employer: text, created_at: time, updated_at: time,
  status: text, type: text, earning_type: text, start_datetime: time, end_datetime: time, duration: number, distance: number, distance_unit: text,
  all_datetimes: z.object({ request_at: time, accept_at: time, pickup_at: time, dropoff_at: time, cancel_at: time }).nullable().optional(),
  start_location: location, end_location: location, income, rating: number, acceptance_rate: number, ontime_rate: number,
  make: text, model: text, year: number,
});
export const sourceAccount = z.object({ id: providerId, user: providerId, item: providerId, connection: z.object({ status: text, error_code: text }).optional() });
export const sourceItem = z.object({ id: providerId, name: z.string().max(200), status: z.string().max(50), known_limitations: text,
  features: z.object({ data_retrieval: z.object({ refresh_frequency: text }).optional(), field_coverage: z.record(z.string(),z.unknown()).optional() }).optional() });
export type SourceRecord = z.infer<typeof sourceRecord>;
export type SourceAccount = z.infer<typeof sourceAccount>;
export type SourceItem = z.infer<typeof sourceItem>;
