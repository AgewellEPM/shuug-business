/** Aggregate connection status for the integrations settings screen. */
import { getShopifyConfig, getQuickBooksConfig, type IntegrationStatus } from "./config";
import { getQboTokens } from "./token-store";

export function getIntegrationStatuses(): IntegrationStatus[] {
  const shopify = getShopifyConfig();
  const qbo = getQuickBooksConfig();
  const qboTokens = getQboTokens();

  return [
    {
      kind: "shopify",
      configured: shopify !== null,
      connected: shopify !== null, // token-based: configured == connected
      detail: shopify
        ? `Store ${shopify.storeDomain} (API ${shopify.apiVersion})`
        : "Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN to connect.",
    },
    {
      kind: "quickbooks",
      configured: qbo !== null,
      connected: qboTokens !== null,
      detail: !qbo
        ? "Set QBO_CLIENT_ID and QBO_CLIENT_SECRET, then connect."
        : qboTokens
          ? `Connected to realm ${qboTokens.realmId} (${qbo.environment}).`
          : `App configured (${qbo.environment}) — click Connect to authorize.`,
    },
  ];
}
