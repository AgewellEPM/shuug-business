import { setting, dataDirectory } from "../connections/vault";
/** Server-side REST adapter. OAuth credentials never cross into client results. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { mapKeywordIdeas, microsToCents, type KeywordMetric, type KeywordIdeaRaw } from "./google-ads-map";
import { campaignOperations, validatedDraft } from "./campaign";
import { MARKETS, publicWebsite, type Market } from "./market";
import type { CampaignPlan, GeneratedAds } from "./plan";

export interface GoogleAdsConfig {
  developerToken: string; clientId: string; clientSecret: string; refreshToken: string;
  customerId: string; loginCustomerId: string | null; apiVersion: string;
}
export function getGoogleAdsConfig(): GoogleAdsConfig | null {
  const value = (name: string) => setting(`GOOGLE_ADS_${name}`);
  const customerId = value("CUSTOMER_ID").replace(/-/g, ""), loginCustomerId = value("LOGIN_CUSTOMER_ID").replace(/-/g, "") || null;
  const cfg = { developerToken: value("DEVELOPER_TOKEN"), clientId: value("CLIENT_ID"), clientSecret: value("CLIENT_SECRET"), refreshToken: value("REFRESH_TOKEN"), customerId, loginCustomerId, apiVersion: value("API_VERSION") || "v25" };
  if (!cfg.developerToken || !cfg.clientId || !cfg.clientSecret || !cfg.refreshToken || !/^\d{10}$/.test(customerId)) return null;
  if ((loginCustomerId && !/^\d{10}$/.test(loginCustomerId)) || !/^v\d+$/.test(cfg.apiVersion)) return null;
  return cfg;
}
export function googleAdsStatus() {
  const required = ["DEVELOPER_TOKEN", "CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN", "CUSTOMER_ID"];
  return { configured: !!getGoogleAdsConfig(), missing: required.filter(k => !setting(`GOOGLE_ADS_${k}`)).map(k => `GOOGLE_ADS_${k}`), pushEnabled: setting("GOOGLE_ADS_ENABLE_CAMPAIGN_PUSH") === "true" };
}
class GoogleError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}
const oauthCache = new Map<string, { token?: string; expiresAt: number; pending?: Promise<string> }>();

export class GoogleAdsClient {
  constructor(readonly cfg: GoogleAdsConfig, private transport: typeof fetch = fetch) {}
  private cacheKey() { return createHash("sha256").update([this.cfg.clientId, this.cfg.clientSecret, this.cfg.refreshToken].join("\0")).digest("hex"); }
  private async token(force = false): Promise<string> {
    const key = this.cacheKey();
    let entry = oauthCache.get(key);
    if (!entry) { entry = { expiresAt: 0 }; oauthCache.set(key, entry); }
    if (entry.pending) return entry.pending;
    if (!force && entry.token && entry.expiresAt > Date.now() + 60_000) return entry.token;
    const current = entry;
    current.pending = (async () => {
      const res = await this.transport("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, refresh_token: this.cfg.refreshToken, grant_type: "refresh_token" }),
        cache: "no-store", signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new GoogleError(`Google OAuth refresh failed (${res.status}). Reconnect the Google account and check the OAuth client.`);
      const data = await res.json() as { access_token?: string; expires_in?: number };
      if (!data.access_token || typeof data.access_token !== "string") throw new GoogleError("Google OAuth returned no access token.");
      current.token = data.access_token;
      current.expiresAt = Date.now() + Math.max(0, Math.min(Number(data.expires_in) || 3600, 3600)) * 1000;
      return current.token;
    })();
    try { return await current.pending; } finally { current.pending = undefined; }
  }
  async request<T>(endpoint: string, body: unknown, mutation = false): Promise<T> {
    let token = await this.token();
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await this.transport(`https://googleads.googleapis.com/${this.cfg.apiVersion}/customers/${this.cfg.customerId}${endpoint}`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "developer-token": this.cfg.developerToken,
            "Content-Type": "application/json", ...(this.cfg.loginCustomerId ? { "login-customer-id": this.cfg.loginCustomerId } : {}) },
          body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(30_000),
        });
      } catch { throw new GoogleError(mutation ? "Google did not confirm the result. Check the campaign in Google Ads before attempting another creation." : "Google Ads request timed out or the network is unavailable. Try again.", mutation); }
      if (response.status === 401 && attempt === 0) { token = await this.token(true); continue; }
      if (!response.ok) {
        // Return codes/field paths, never Google's raw payload (can contain submitted secrets/data).
        const raw = await response.json().catch(() => ({})) as { error?: { details?: { errors?: { errorCode?: Record<string, string>; location?: { fieldPathElements?: { fieldName?: string }[] } }[] }[] } };
        const errors = raw.error?.details?.flatMap(d => d.errors ?? []).slice(0, 3).map(e => {
          const code = Object.values(e.errorCode ?? {}).filter(v => /^[A-Z_]+$/.test(v)).join(", ");
          const field = e.location?.fieldPathElements?.map(f => f.fieldName).filter(f => f && /^[a-zA-Z_]+$/.test(f)).join(".");
          return [code, field].filter(Boolean).join(" at ");
        }).filter(Boolean).join("; ");
        const hint = response.status === 429 ? "Quota reached; wait before retrying." : response.status === 403 ? "Check developer-token access and account permissions." : "Check the account and request settings.";
        throw new GoogleError(`Google Ads ${response.status}: ${errors || hint}`, mutation && response.status >= 500);
      }
      try { return await response.json() as T; }
      catch { throw new GoogleError("Google Ads returned an unreadable response. Check the account before retrying a creation.", mutation); }
    }
    throw new GoogleError("Google Ads authentication failed.");
  }
  async account(): Promise<AdsAccount> {
    const data = await this.request<{ results?: { customer?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string } }[] }>("/googleAds:search", { query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1" });
    const c = data.results?.[0]?.customer;
    if (!c?.id || !c.currencyCode) throw new GoogleError("Google returned no advertising account. Select a client account, not the manager account.");
    return { id: c.id, name: c.descriptiveName || c.id, currency: c.currencyCode, timeZone: c.timeZone || "Unknown" };
  }
}
function configuredClient() {
  const cfg = getGoogleAdsConfig();
  if (!cfg) throw new GoogleError("Connect Google Ads in Data connections. Required credentials or account IDs are missing or invalid.");
  return new GoogleAdsClient(cfg);
}
function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map(i => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; ");
  return err instanceof GoogleError || err instanceof Error && /Negative keyword|different headlines/.test(err.message) ? err.message : "The request could not be completed. Check the connection and try again.";
}
export interface AdsAccount { id: string; name: string; currency: string; timeZone: string }
export interface AccountResult { ok: boolean; account?: AdsAccount; campaigns?: { name: string; status: string; spendCents: number; clicks: number; impressions: number; conversions: number }[]; error?: string; fetchedAt?: string }
export async function pullAccountPerformance(): Promise<AccountResult> {
  try {
    const client = configuredClient(), account = await client.account();
    const data = await client.request<{ results?: { campaign: { name: string; status: string }; metrics: { costMicros?: string; clicks?: string; impressions?: string; conversions?: number } }[] }>("/googleAds:search", { query: "SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100" });
    return { ok: true, account, fetchedAt: new Date().toISOString(), campaigns: (data.results ?? []).map(r => ({ ...r.campaign, spendCents: microsToCents(Number(r.metrics.costMicros || 0)), clicks: Number(r.metrics.clicks || 0), impressions: Number(r.metrics.impressions || 0), conversions: Number(r.metrics.conversions || 0) })) };
  } catch (err) { return { ok: false, error: errorMessage(err) }; }
}
export interface KeywordPullResult { ok: boolean; keywords: KeywordMetric[]; error?: string; fetchedAt?: string; currency?: string; market?: Market }
export async function pullKeywordIdeas(seedKeywords: string[], market: Market = "US", website?: string, historical = false): Promise<KeywordPullResult> {
  try {
    const seeds = z.array(z.string().trim().min(1).max(80)).min(1).max(20).parse(seedKeywords);
    const target = MARKETS[z.enum(["US", "CA", "GB", "AU"]).parse(market)];
    if (website && !publicWebsite(website)) throw new GoogleError("Enter a public HTTPS competitor website.");
    const client = configuredClient(), account = await client.account();
    if (account.currency !== "USD") throw new GoogleError(`This planner uses USD product margins; your account uses ${account.currency}. Use a USD account to compare costs accurately.`);
    const data = await client.request<{ results?: KeywordIdeaRaw[] }>(historical ? ":generateKeywordHistoricalMetrics" : ":generateKeywordIdeas", {
      ...(historical ? { keywords: seeds } : website ? { keywordAndUrlSeed: { keywords: seeds, url: publicWebsite(website) } } : { keywordSeed: { keywords: seeds } }),
      geoTargetConstants: [`geoTargetConstants/${target.geoId}`], language: `languageConstants/${target.languageId}`,
      keywordPlanNetwork: "GOOGLE_SEARCH", historicalMetricsOptions: { includeAverageCpc: true },
      ...(!historical ? { includeAdultKeywords: false, pageSize: 50 } : {}),
    });
    return { ok: true, keywords: mapKeywordIdeas(data.results ?? []), fetchedAt: new Date().toISOString(), currency: account.currency, market };
  } catch (err) { return { ok: false, keywords: [], error: errorMessage(err) }; }
}

export interface PushResult { ok: boolean; message: string; campaignResourceName?: string; reviewId?: string; account?: AdsAccount; expiresAt?: string }
interface Review { accountId: string; apiVersion: string; draft: ReturnType<typeof validatedDraft>; expiresAt: string }
function ledgerDir() { return process.env.GOOGLE_ADS_LEDGER_DIR || path.join(dataDirectory(), "ppc-reviews"); }
export async function validateCampaign(plan: CampaignPlan, ads: GeneratedAds): Promise<PushResult> {
  try {
    const draft = validatedDraft(plan, ads), client = configuredClient(), account = await client.account();
    if (account.currency !== "USD") throw new GoogleError("Campaign budgets are in USD. Connect a USD account.");
    const reviewId = randomUUID(), expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await client.request("/googleAds:mutate", { mutateOperations: campaignOperations(client.cfg.customerId, draft, reviewId), partialFailure: false, validateOnly: true });
    await mkdir(ledgerDir(), { recursive: true, mode: 0o700 });
    await writeFile(path.join(ledgerDir(), `${reviewId}.json`), JSON.stringify({ accountId: account.id, apiVersion: client.cfg.apiVersion, draft, expiresAt } satisfies Review), { flag: "wx", mode: 0o600 });
    return { ok: true, message: "Google accepted the complete draft. Creating it will leave the campaign, ad group and ad paused.", reviewId, account, expiresAt };
  } catch (err) { return { ok: false, message: errorMessage(err) }; }
}
/** Consume an immutable reviewed snapshot once. An uncertain mutation is never replayed. */
export async function pushCampaignToGoogleAds(reviewId: string): Promise<PushResult> {
  if (setting("GOOGLE_ADS_ENABLE_CAMPAIGN_PUSH") !== "true") return { ok: false, message: "Campaign creation is disabled. Enable it in the server connection settings after reviewing the account." };
  if (!z.uuid().safeParse(reviewId).success) return { ok: false, message: "Validate this draft with Google first." };
  const base = path.join(ledgerDir(), reviewId);
  try {
    const client = configuredClient();
    const review: Review = JSON.parse(await readFile(`${base}.json`, "utf8"));
    if (review.accountId !== client.cfg.customerId || review.apiVersion !== client.cfg.apiVersion) throw new GoogleError("The account or API version changed. Validate the draft again.");
    // Completed/uncertain receipts survive browser retries and server restarts.
    try { return JSON.parse(await readFile(`${base}.result.json`, "utf8")) as PushResult; } catch { /* no result yet */ }
    if (Date.parse(review.expiresAt) < Date.now()) throw new GoogleError("Review expired. Validate the draft again.");
    try { await writeFile(`${base}.claimed`, "claimed", { flag: "wx", mode: 0o600 }); }
    catch { return { ok: false, message: `This creation was already submitted. Check Google Ads for [${reviewId.slice(0, 8)}] before creating another draft.` }; }
    let result: PushResult;
    try {
      const data = await client.request<{ mutateOperationResponses?: { campaignResult?: { resourceName?: string } }[] }>("/googleAds:mutate", { mutateOperations: campaignOperations(client.cfg.customerId, review.draft, reviewId), partialFailure: false, validateOnly: false }, true);
      const campaign = data.mutateOperationResponses?.find(r => r.campaignResult)?.campaignResult?.resourceName;
      result = campaign ? { ok: true, message: `Created paused campaign [${reviewId.slice(0, 8)}]. Review and enable the campaign, ad group and ad in Google Ads when ready.`, campaignResourceName: campaign } : { ok: false, message: `Google returned no campaign receipt. Check for [${reviewId.slice(0, 8)}] in Google Ads; this request will not be replayed.` };
    } catch (err) { result = { ok: false, message: `${errorMessage(err)} Reference: [${reviewId.slice(0, 8)}].` }; }
    await writeFile(`${base}.result.json`, JSON.stringify(result), { mode: 0o600 });
    return result;
  } catch (err) { return { ok: false, message: errorMessage(err) }; }
}
