import { z } from "zod";
import { setting } from "../connections/vault";
import { DriverError } from "./model";

export function bankConfiguration(platform?: "ios" | "android") {
  const environment = setting("PLAID_ENV") || "sandbox";
  const clientId = setting("PLAID_CLIENT_ID"), secret = setting("PLAID_SECRET"), redirect = setting("PLAID_IOS_REDIRECT_URI");
  let validRedirect = false;
  try { const url = new URL(redirect); validRedirect = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; } catch {}
  const androidPackage = setting("PLAID_ANDROID_PACKAGE_NAME");
  const platformReady = platform === "ios" ? validRedirect : platform === "android" ? androidPackage === "com.ridesharetaxpros.driver" : true;
  const credentialsReady = !!clientId && !!secret && ["sandbox", "production"].includes(environment);
  const ready = credentialsReady && platformReady
    && (environment === "sandbox" || setting("PLAID_LIVE_ENABLED") === "true");
  return { ready, credentialsReady, environment, clientId, secret, redirect, androidPackage,
    reason: ready ? (environment === "sandbox" ? "Sandbox uses test banks only." : "Available banks appear in the secure connection screen.")
      : "Your firm has not activated bank linking. CSV, OFX and QFX imports are available now." };
}
export class BankProviderError extends DriverError {
  constructor(public code: string) {
    super(503, code === "ITEM_LOGIN_REQUIRED" ? "This bank needs you to reconnect securely." : "The bank provider could not complete this request. Your saved records are kept.");
  }
}
export async function plaid<T>(path: string, input: object, schema: z.ZodType<T>, pinned?: ReturnType<typeof bankConfiguration>): Promise<T> {
  const config = pinned ?? bankConfiguration();
  // Pausing new/live links must not prevent a customer from revoking an
  // existing provider authorization with the still-valid credential pair.
  if (!config.ready && !(path === "/item/remove" && config.credentialsReady)) throw new DriverError(503, config.reason);
  let response: Response;
  try {
    response = await fetch(`https://${config.environment}.plaid.com${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "Plaid-Version": "2020-09-14" },
      body: JSON.stringify({ client_id: config.clientId, secret: config.secret, ...input }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new BankProviderError("NETWORK_ERROR"); }
  const text = await response.text();
  if (text.length > 6_000_000) throw new BankProviderError("INVALID_RESPONSE");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new BankProviderError("INVALID_RESPONSE"); }
  if (!response.ok) {
    const error = z.object({ error_code: z.string() }).safeParse(value);
    throw new BankProviderError(error.success ? error.data.error_code : "PROVIDER_ERROR");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BankProviderError("INVALID_RESPONSE");
  return parsed.data;
}
const bankAccount = z.object({ account_id: z.string(), name: z.string(), mask: z.string().nullable().optional() });
export const providerTransaction = z.object({
  transaction_id: z.string(), account_id: z.string(), date: z.iso.date(), name: z.string(),
  merchant_name: z.string().nullable().optional(), amount: z.number().finite().min(-1_000_000).max(1_000_000),
  iso_currency_code: z.string().nullable(), pending: z.boolean(), pending_transaction_id: z.string().nullable().optional(),
  personal_finance_category: z.object({ primary: z.string(), detailed: z.string() }).nullable().optional(),
});
export type ProviderTransaction = z.infer<typeof providerTransaction>;
export const syncReply = z.object({ added: z.array(providerTransaction).max(500), modified: z.array(providerTransaction).max(500),
  removed: z.array(z.object({ transaction_id: z.string() })).max(500), next_cursor: z.string().max(4000), has_more: z.boolean(),
  accounts: z.array(bankAccount).max(200).optional() });
export const accountsReply = z.object({ accounts: z.array(bankAccount).max(200), item: z.object({ institution_id: z.string().nullable().optional() }).optional() });
