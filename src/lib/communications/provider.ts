import { readVault, appBaseUrl } from "../connections/vault";
import { invoiceDeliveryConfig } from "../accounting/invoice-delivery-provider";
import { getBranding } from "../branding/store";
import { boundedJson } from "../social/http";
import { normalizePhone, type CommunicationMessage } from "./model";
import { communicationHash } from "./store";

export type Fetcher = typeof fetch;
export function communicationPublicOrigin() {
  const origin = new URL(appBaseUrl());
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Set the workspace's exact public HTTPS origin before enabling communications.");
  return origin.origin;
}
export function smsProviderConfig() {
  const vault = readVault(), account = vault.TWILIO_ACCOUNT_SID?.trim(), auth = vault.TWILIO_AUTH_TOKEN?.trim();
  if (!account || !/^AC[a-f0-9]{32}$/i.test(account) || !auth || !/^[!-~]{20,200}$/.test(auth)) throw new Error("SMS needs the shop's Twilio account SID and auth token in Connections.");
  const from = normalizePhone(vault.TWILIO_FROM_NUMBER ?? ""), mode = vault.TWILIO_MODE;
  if (mode !== "test" && mode !== "live") throw new Error("Choose Twilio test or live mode explicitly in Connections.");
  const baseUrl = communicationPublicOrigin();
  return { account, auth, from, mode: mode as "test" | "live", baseUrl, digest: communicationHash({ account, auth: communicationHash(auth), from, mode, baseUrl }) };
}
export function communicationConnectionStatus() {
  const enabled = readVault().COMMUNICATIONS_SEND_ENABLED === "true";
  let sms: { configured: boolean; ready: boolean; mode: string | null; detail: string };
  let email: typeof sms;
  try {
    const config = smsProviderConfig();
    sms = { configured: true, ready: enabled, mode: config.mode, detail: !enabled ? "Outbound dispatch is off." : config.mode === "test" ? "SMS test mode is local simulation; no provider is contacted." : "Twilio live sending is enabled. Account, sender registration and delivery still need verification." };
  } catch (error) { sms = { configured: false, ready: false, mode: null, detail: error instanceof Error ? error.message : "SMS is not configured." }; }
  try {
    const config = invoiceDeliveryConfig();
    email = { configured: true, ready: enabled, mode: config.mode, detail: !enabled ? "Outbound dispatch is off." : config.mode === "test" ? "Mailgun test mode does not deliver mail." : "Mailgun live dispatch is enabled. Acceptance does not establish delivery." };
  } catch (error) { email = { configured: false, ready: false, mode: null, detail: error instanceof Error ? error.message : "Email is not configured." }; }
  return { enabled, sms, email, callbacks: { twilioInbound: "/api/communications/twilio/inbound", twilioStatus: "/api/communications/twilio/status", mailgun: "/api/communications/mailgun" } };
}
export type ProviderConfig = { channel: "sms"; value: ReturnType<typeof smsProviderConfig> } | { channel: "email"; value: ReturnType<typeof invoiceDeliveryConfig> };
export function providerConfig(channel: CommunicationMessage["channel"]): ProviderConfig {
  return channel === "sms" ? { channel, value: smsProviderConfig() } : { channel, value: invoiceDeliveryConfig() };
}
export async function sendCommunication(message: CommunicationMessage, selected: ProviderConfig, fetcher: Fetcher = fetch) {
  if (selected.channel !== message.channel) throw new Error("Message provider does not match its channel.");
  if (selected.channel === "sms" && selected.value.mode === "test") return { status: "simulated" as const, providerId: null };
  const body = new FormData();
  let endpoint: string, authorization: string, payload: BodyInit;
  if (selected.channel === "sms") {
    const config = selected.value;
    const callback = new URL("/api/communications/twilio/status", config.baseUrl);
    callback.searchParams.set("message", message.id); callback.searchParams.set("attempt", message.attemptId!);
    const brand = getBranding().businessName;
    const prefix = `${brand}:`, content = message.body.trim();
    let text = content.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() ? content : `${prefix} ${content}`;
    if (!/\breply\s+stop\s+to\s+opt\s+out\b/i.test(text)) text += "\nReply STOP to opt out.";
    // Preserve private links and agreed content; never silently truncate either.
    if (text.length > 1600) return { status: "failed" as const, providerId: null };
    endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.account}/Messages.json`;
    authorization = `Basic ${Buffer.from(`${config.account}:${config.auth}`).toString("base64")}`;
    payload = new URLSearchParams({ To: message.to, From: config.from, Body: text, StatusCallback: callback.href });
  } else {
    const config = selected.value;
    endpoint = config.endpoint; authorization = `Basic ${Buffer.from(`api:${config.apiKey}`).toString("base64")}`;
    for (const [key, value] of Object.entries({ from: config.from, to: message.to, subject: message.subject!, text: message.body,
      "v:shuug_message": message.id, "v:shuug_attempt": message.attemptId!, "o:tracking": "no", "o:tracking-clicks": "no", "o:tracking-opens": "no", "o:require-tls": "yes", "o:skip-verification": "no", ...(config.mode === "test" ? { "o:testmode": "yes" } : {}) })) body.set(key, value);
    payload = body;
  }
  try {
    const response = await fetcher(endpoint, { method: "POST", headers: { Authorization: authorization }, body: payload,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) { await response.body?.cancel(); return { status: "failed" as const, providerId: null }; }
    if (response.status !== (selected.channel === "sms" ? 201 : 200)) { await response.body?.cancel(); return { status: "uncertain" as const, providerId: null }; }
    const result = await boundedJson(response, 16000), id = selected.channel === "sms" ? result.sid : result.id;
    const valid = typeof id === "string" && (selected.channel === "sms" ? /^SM[a-f0-9]{32}$/i.test(id) : /^[!-~]{1,300}$/.test(id));
    return valid ? { status: "accepted" as const, providerId: id as string } : { status: "uncertain" as const, providerId: null };
  } catch { return { status: "uncertain" as const, providerId: null }; }
}
