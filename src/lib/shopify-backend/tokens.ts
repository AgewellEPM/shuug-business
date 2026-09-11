import { z } from "zod";
import { getShopifyConfig } from "../integrations/config";
import { setting, saveSecrets } from "../connections/vault";
import { ShopifyStore } from "./store";
import { ConnectorError } from "./model";

/** Refresh rotated offline tokens once across the web and worker processes. */
export async function freshShopifyConfig(fetcher: typeof fetch = fetch) {
  let config = getShopifyConfig();
  if (!config) return null;
  const expires = Number(setting("SHOPIFY_TOKEN_EXPIRES_AT"));
  if (!expires || expires > Date.now() + 60000) return config;
  const store = new ShopifyStore(), lock = `token:${config.storeDomain}`, owner = store.acquire(lock);
  if (!owner) { store.close(); throw new ConnectorError("Shopify token refresh is already running. Retry shortly.", 503, true); }
  try {
    config = getShopifyConfig();
    if (!config) return null;
    if (Number(setting("SHOPIFY_TOKEN_EXPIRES_AT")) > Date.now() + 60000) return config;
    const refreshToken = setting("SHOPIFY_REFRESH_TOKEN");
    if (!refreshToken) throw new ConnectorError("The Shopify authorization expired. Reconnect the store.", 401);
    let response: Response;
    try { response = await fetcher(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: setting("SHOPIFY_CLIENT_ID"), client_secret: setting("SHOPIFY_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: refreshToken }), redirect: "error", signal: AbortSignal.timeout(20000), cache: "no-store" }); }
    catch { throw new ConnectorError("Shopify token refresh could not connect. Retry shortly.", 503, true); }
    if (response.status === 429 || response.status >= 500) throw new ConnectorError("Shopify token refresh is temporarily unavailable.", 503, true);
    if (!response.ok) {
      saveSecrets({ SHOPIFY_ADMIN_TOKEN: "", SHOPIFY_REFRESH_TOKEN: "", SHOPIFY_TOKEN_EXPIRES_AT: "" });
      throw new ConnectorError("Shopify authorization is no longer valid. Reconnect the store.", 401);
    }
    const token = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().positive(), scope: z.string().optional() }).parse(await response.json());
    saveSecrets({ SHOPIFY_ADMIN_TOKEN: token.access_token, SHOPIFY_REFRESH_TOKEN: token.refresh_token, SHOPIFY_TOKEN_EXPIRES_AT: String(Date.now() + token.expires_in * 1000), ...(token.scope ? { SHOPIFY_GRANTED_SCOPES: token.scope } : {}) });
    return getShopifyConfig();
  } finally { store.release(lock, owner); store.close(); }
}
