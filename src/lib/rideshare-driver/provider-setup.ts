import { z } from "zod";
import { appBaseUrl, saveSecrets, setting } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { bankConfiguration } from "./bank-provider";

export const bankReturnUri = "https://gigtax.pro/bank-return";
const appIdentifier = /^[A-Z0-9]{10}\.com\.ridesharetaxpros\.driver$/;
const value = z.string().trim().max(500).default("");
export const providerSetupInput = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("plaid"), environment: z.enum(["sandbox", "production"]), clientId: value, secret: value,
    redirectUri: z.literal(bankReturnUri), iosAppId: z.string().trim().max(100).default(""), liveEnabled: z.boolean(), associationVerified: z.boolean().default(false) }).strict(),
  z.object({ provider: z.literal("uber"), clientId: value, secret: value, approved: z.boolean() }).strict(),
]);
export function driverProviderSetup() {
  const bank = bankConfiguration("ios");
  let publicWorkspace = false;
  try { const url = new URL(appBaseUrl()); publicWorkspace = url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname); } catch {}
  const pendingRevocations = workspaceDatabase(db => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='driver_bank_revocations'").get()
    ? Number((db.prepare("SELECT count(*) AS n FROM driver_bank_revocations").get() as { n: number }).n) : 0);
  return { bank: { environment: bank.environment, clientIdConfigured: !!bank.clientId, secretConfigured: !!bank.secret,
    redirectUri: bank.redirect || bankReturnUri, iosAppId: setting("PLAID_IOS_APP_ID"), liveEnabled: setting("PLAID_LIVE_ENABLED") === "true",
    ready: bank.ready, pendingRevocations, associationVerified: setting("PLAID_IOS_ASSOCIATION_VERIFIED") === "true", reason: bank.reason },
    uber: { clientIdConfigured: !!setting("UBER_DRIVER_CLIENT_ID"), secretConfigured: !!setting("UBER_DRIVER_CLIENT_SECRET"),
      approved: setting("UBER_DRIVER_APPROVED") === "true", callbackUri: `${appBaseUrl().replace(/\/$/, "")}/api/website/customer/connections/uber/callback`, publicWorkspace },
  };
}
function activeBankState() {
  return workspaceDatabase(db => {
    const table = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    return {
      items: table("driver_bank_items") ? Number((db.prepare("SELECT count(*) AS n FROM driver_bank_items WHERE connected=1").get() as { n: number }).n) : 0,
      links: table("driver_bank_links") ? Number((db.prepare("SELECT count(*) AS n FROM driver_bank_links WHERE itemId IS NULL AND at>?").get(Date.now()-4*3600_000) as { n: number }).n) : 0,
    };
  });
}
/** Owner routes/actions must authenticate and check Origin before calling. */
export function saveDriverProviderSetup(raw: unknown) {
  const input = providerSetupInput.parse(raw);
  if (input.provider === "uber") {
    const identityChanged = Boolean(input.clientId && input.clientId !== setting("UBER_DRIVER_CLIENT_ID"));
    if (identityChanged && !input.secret) throw new Error("Supply the matching secret when changing the Uber application.");
    if (identityChanged || Boolean(input.secret && input.secret !== setting("UBER_DRIVER_CLIENT_SECRET"))) {
      const linked = workspaceDatabase(db => {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gig_uber_links'").get()) return false;
        return Boolean(db.prepare("SELECT 1 FROM gig_uber_links WHERE secrets IS NOT NULL LIMIT 1").get());
      });
      if (linked) throw new Error("Disconnect existing Uber authorizations before changing application credentials.");
    }
    const id = input.clientId || setting("UBER_DRIVER_CLIENT_ID"), secret = input.secret || setting("UBER_DRIVER_CLIENT_SECRET");
    if (input.approved && (!id || !secret)) throw new Error("Save the approved Uber app credentials before enabling authorization.");
    saveSecrets({ ...(input.clientId ? { UBER_DRIVER_CLIENT_ID: input.clientId } : {}), ...(input.secret ? { UBER_DRIVER_CLIENT_SECRET: input.secret } : {}), UBER_DRIVER_APPROVED: String(input.approved) });
  } else {
    if (input.iosAppId && !appIdentifier.test(input.iosAppId)) throw new Error("Use the signed application identifier for Gig Tax Pros, including its actual ten-character prefix.");
    const previous = bankConfiguration();
    const identityChanged = input.environment !== previous.environment || Boolean(input.clientId && input.clientId !== previous.clientId);
    if (identityChanged && (!input.clientId || !input.secret)) throw new Error("Supply both credentials when changing the Plaid application or environment.");
    const state = activeBankState();
    if (identityChanged && state.items) throw new Error("Disconnect existing banks before changing the provider application or environment.");
    const credentialChanged = identityChanged || Boolean(input.secret && input.secret !== previous.secret) || input.redirectUri !== previous.redirect;
    if (credentialChanged && state.links) throw new Error("Finish or cancel pending bank connections before changing provider credentials.");
    const id = input.clientId || previous.clientId, secret = input.secret || previous.secret;
    if (input.liveEnabled && (input.environment !== "production" || !id || !secret || !input.iosAppId || !input.associationVerified)) {
      throw new Error("Live linking requires production credentials, the actual signed app identifier and a verified published app association.");
    }
    saveSecrets({ PLAID_ENV: input.environment, ...(input.clientId ? { PLAID_CLIENT_ID: input.clientId } : {}), ...(input.secret ? { PLAID_SECRET: input.secret } : {}),
      PLAID_IOS_REDIRECT_URI: input.redirectUri, PLAID_IOS_APP_ID: input.iosAppId,
      PLAID_LIVE_ENABLED: String(input.liveEnabled), PLAID_IOS_ASSOCIATION_VERIFIED: String(input.associationVerified) });
  }
  return driverProviderSetup();
}
