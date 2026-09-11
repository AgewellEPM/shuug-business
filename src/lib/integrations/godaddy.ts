/**
 * GoDaddy integration — connect the account where many small businesses already own
 * their domain, DNS and email. Fail-closed: without an API key/secret nothing is
 * called; the live request is built and gated until real credentials exist.
 *
 * Keys (production): GODADDY_API_KEY, GODADDY_API_SECRET. GoDaddy issues these at
 * developer.godaddy.com; the header is `Authorization: sso-key KEY:SECRET`.
 */
import { setting } from "../connections/vault";

export interface GodaddyConfig { key: string; secret: string; base: string }

export function getGodaddyConfig(): GodaddyConfig | null {
  const key = setting("GODADDY_API_KEY");
  const secret = setting("GODADDY_API_SECRET");
  if (!key || !secret) return null;
  // OTE (test) vs production API host.
  const base = setting("GODADDY_ENVIRONMENT") === "ote" ? "https://api.ote-godaddy.com" : "https://api.godaddy.com";
  return { key, secret, base };
}

export function godaddyStatus() {
  const cfg = getGodaddyConfig();
  return {
    configured: cfg !== null,
    detail: cfg
      ? "Connected. Your domains, DNS and GoDaddy email are available to the workspace."
      : "Add your GoDaddy API key and secret to connect domains, DNS and email.",
  };
}

export interface GodaddyDomain { domain: string; status: string; expires: string | null; renewAuto: boolean }

/** List the account's domains. Fail-closed (returns not-connected without credentials). */
export async function listDomains(): Promise<{ ok: boolean; domains: GodaddyDomain[]; error?: string }> {
  const cfg = getGodaddyConfig();
  if (!cfg) return { ok: false, domains: [], error: "Connect GoDaddy first (API key + secret)." };
  try {
    const res = await fetch(`${cfg.base}/v1/domains?limit=100`, {
      headers: { Authorization: `sso-key ${cfg.key}:${cfg.secret}`, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, domains: [], error: `GoDaddy returned ${res.status}. Check the API key and secret.` };
    const raw = (await res.json()) as Array<{ domain: string; status: string; expires?: string; renewAuto?: boolean }>;
    return {
      ok: true,
      domains: raw.map((d) => ({ domain: d.domain, status: d.status, expires: d.expires ?? null, renewAuto: Boolean(d.renewAuto) })),
    };
  } catch (e) {
    return { ok: false, domains: [], error: e instanceof Error ? e.message : "Could not reach GoDaddy." };
  }
}
