import { createHash } from "node:crypto";
import { z } from "zod";
import { appBaseUrl, readVault } from "../connections/vault";
import { boundedJson } from "../social/http";
import type { InvoiceEmailPreview } from "./invoice-delivery-model";

// Mailgun Messages API: multipart/form-data, HTTP Basic api:KEY; no idempotency
// guarantee is assumed. Never retry a possibly accepted request automatically.
// https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages/post-v3--domain-name--messages
export const deliveryHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const domainInput = z.string().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
const settings = z.object({
  apiKey: z.string().regex(/^[!-~]{10,500}$/), domain: domainInput,
  from: z.email().max(200).refine(value => !/[\r\n<>]/.test(value)),
  region: z.enum(["US", "EU"]), mode: z.enum(["test", "live"]),
});
export function invoiceDeliveryConfig() {
  // Provider credentials are read only from the encrypted Connections vault.
  const vault = readVault();
  const value = settings.safeParse({ apiKey: vault.MAILGUN_API_KEY?.trim(), domain: vault.MAILGUN_DOMAIN?.trim(), from: vault.MAILGUN_FROM_EMAIL?.trim(), region: vault.MAILGUN_REGION?.trim(), mode: vault.MAILGUN_MODE?.trim() });
  if (!value.success) throw new Error("Invoice email needs Mailgun API key, verified sending domain, matching sender email, region US/EU and mode test/live in Connections.");
  const config = value.data;
  if (config.from.split("@")[1].toLowerCase() !== config.domain) throw new Error("Use a sender email on the configured Mailgun sending domain.");
  const base = new URL(appBaseUrl());
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Set the workspace's exact public HTTPS origin before emailing private invoice links.");
  const endpoint = `https://${config.region === "EU" ? "api.eu.mailgun.net" : "api.mailgun.net"}/v3/${config.domain}/messages`;
  const digest = deliveryHash({ ...config, apiKey: deliveryHash(config.apiKey), baseUrl: base.origin });
  return { ...config, baseUrl: base.origin, endpoint, digest };
}
export function invoiceDeliveryConnection() {
  try { const config = invoiceDeliveryConfig(); return { ready: true, mode: config.mode, from: config.from, domain: config.domain, region: config.region, message: "Mailgun settings are present. Verify the sending domain and account with Mailgun before live use." }; }
  catch (error) { return { ready: false, mode: null, from: null, domain: null, region: null, message: error instanceof Error ? error.message : "Invoice email is not configured." }; }
}
export async function sendInvoiceEmail(config: ReturnType<typeof invoiceDeliveryConfig>, preview: InvoiceEmailPreview, deliveryId: string): Promise<{ status: "accepted" | "rejected" | "uncertain"; providerId: string | null }> {
  const body = new FormData();
  for (const [key, value] of Object.entries({ from: preview.from, to: preview.recipient, subject: preview.subject, text: preview.text, "v:shuug_delivery": deliveryId, "o:tracking": "no", "o:tracking-clicks": "no", "o:tracking-opens": "no", "o:require-tls": "yes", "o:skip-verification": "no", ...(config.mode === "test" ? { "o:testmode": "yes" } : {}) })) body.set(key, value);
  try {
    const response = await fetch(config.endpoint, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString("base64")}` }, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) { await response.body?.cancel(); return { status: "rejected", providerId: null }; }
    if (response.status !== 200) { await response.body?.cancel(); return { status: "uncertain", providerId: null }; }
    const result = z.object({ id: z.string().regex(/^[!-~]{1,300}$/), message: z.string().max(1000) }).safeParse(await boundedJson(response, 16000));
    return result.success ? { status: "accepted", providerId: result.data.id } : { status: "uncertain", providerId: null };
  } catch { return { status: "uncertain", providerId: null }; }
}
