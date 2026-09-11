import { setting, appBaseUrl } from "../connections/vault";
/**
 * Integration config — reads Shopify + QuickBooks credentials from the
 * environment (never from code). Fail-closed: if a credential is missing the
 * integration reports "not configured" rather than pretending to be live.
 *
 * Required env (see .env.example):
 *   Shopify:  SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN, [SHOPIFY_API_VERSION]
 *   QuickBooks: QBO_CLIENT_ID, QBO_CLIENT_SECRET, [QBO_ENVIRONMENT],
 *               [QBO_REDIRECT_URI]
 */

export interface ShopifyConfig {
  storeDomain: string; // e.g. "shuug.myshopify.com"
  adminToken: string;
  apiVersion: string;
}

export interface QuickBooksConfig {
  clientId: string;
  clientSecret: string;
  environment: "sandbox" | "production";
  redirectUri: string;
}

const DEFAULT_SHOPIFY_API_VERSION = "2026-07";

export function getShopifyConfig(): ShopifyConfig | null {
  const storeDomain = setting("SHOPIFY_STORE_DOMAIN");
  const adminToken = setting("SHOPIFY_ADMIN_TOKEN");
  if (!storeDomain || !adminToken || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) return null;
  return {
    storeDomain,
    adminToken,
    apiVersion: setting("SHOPIFY_API_VERSION") || DEFAULT_SHOPIFY_API_VERSION,
  };
}

export function getQuickBooksConfig(): QuickBooksConfig | null {
  const clientId = setting("QBO_CLIENT_ID");
  const clientSecret = setting("QBO_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const environment = setting("QBO_ENVIRONMENT") === "production" ? "production" : "sandbox";
  return {
    clientId,
    clientSecret,
    environment,
    redirectUri:
      setting("QBO_REDIRECT_URI") || `${appBaseUrl()}/api/quickbooks/callback`,
  };
}

/** QBO API + OAuth base URLs by environment. */
export function quickBooksUrls(env: "sandbox" | "production") {
  return {
    // OAuth endpoints are the same across environments.
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    apiBase:
      env === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com",
  };
}

export type IntegrationKind = "shopify" | "quickbooks";

export interface IntegrationStatus {
  kind: IntegrationKind;
  /** true when required credentials are present in the environment. */
  configured: boolean;
  /** for QBO: whether an OAuth token has been obtained (see token-store). */
  connected: boolean;
  detail: string;
}
