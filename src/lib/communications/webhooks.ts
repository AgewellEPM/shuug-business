import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { readVault, sealSecret } from "../connections/vault";
import { communicationPublicOrigin, smsProviderConfig } from "./provider";
import { normalizePhone, type CommunicationInbound, type CommunicationMessage, type MessageStatus } from "./model";
import { communicationHash, readCommunicationDocument, saveCommunicationDocument, providerSmsPreferenceInDatabase, messageInDatabase, saveMessageInDatabase, communicationAudit } from "./store";

const equal = (a: string, b: string) => { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };
export async function boundedRequestText(request: Request, maximum = 24000) {
  const reader = request.body?.getReader(); if (!reader) throw new Error("A request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maximum) { await reader.cancel(); throw new Error("Request is too large."); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export async function twilioParameters(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Use a form-encoded provider request.");
  const form = new URLSearchParams(await boundedRequestText(request)), values: Record<string, string> = {};
  if ([...form].length > 80) throw new Error("Too many provider fields.");
  for (const [key, value] of form) { if (key in values || key.length > 100 || value.length > 8000) throw new Error("Invalid provider fields."); values[key] = value; }
  return values;
}
/** Twilio's URL-plus-sorted-form HMAC-SHA1 scheme; only the configured public URL is trusted.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security */
export function twilioSignature(auth: string, url: string, values: Record<string, string>) {
  return createHmac("sha1", auth).update(url + Object.keys(values).sort().map(key => key + values[key]).join("")).digest("base64");
}
function verifyTwilio(request: Request, pathname: string, values: Record<string, string>) {
  const config = smsProviderConfig(), incoming = new URL(request.url);
  const url = new URL(`${pathname}${incoming.search}`, communicationPublicOrigin()).href;
  if (incoming.pathname !== pathname || values.AccountSid !== config.account || !equal(twilioSignature(config.auth, url, values), request.headers.get("x-twilio-signature") ?? "")) throw new Error("Provider authentication failed.");
  return config;
}
const providerSid = z.string().regex(/^SM[a-f0-9]{32}$/i);
const xml = (value: string) => value.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
export function acceptTwilioInbound(request: Request, values: Record<string, string>) {
  const config = verifyTwilio(request, "/api/communications/twilio/inbound", values);
  const sid = providerSid.parse(values.MessageSid), from = normalizePhone(values.From ?? ""), to = normalizePhone(values.To ?? "");
  if (to !== config.from) throw new Error("This message belongs to another sender.");
  const body = z.string().max(4000).parse(values.Body ?? ""), keyword = body.trim().toUpperCase();
  const action = values.OptOutType === "STOP" || ["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT", "CANCEL", "REVOKE", "OPTOUT"].includes(keyword) ? "STOP"
    : values.OptOutType === "START" || ["START", "UNSTOP", "YES"].includes(keyword) ? "START"
    : values.OptOutType === "HELP" || ["HELP", "INFO"].includes(keyword) ? "HELP" : "message";
  return workspaceDatabase(db => {
    const key = `communication-inbound:${sid}`, digest = communicationHash(values);
    const prior = readCommunicationDocument<{ digest: string }>(db, key, "communication-inbound");
    if (prior) { if (prior.digest !== digest) throw new Error("Provider message already has different content."); return { duplicate: true, response: "<Response/>" }; }
    const inbound: CommunicationInbound = { id: randomUUID(), providerId: sid, from, to, body, action, receivedAt: new Date().toISOString() };
    const { body: content, ...metadata } = inbound;
    saveCommunicationDocument(db, key, "communication-inbound", { ...metadata, digest, sealedBody: sealSecret(content) });
    if (action === "STOP" || action === "START") providerSmsPreferenceInDatabase(db, from, action, sid);
    // Advanced Opt-Out already replies. Standard STOP/START confirmations are
    // Twilio-owned too; never send a second acknowledgement from this webhook.
    const help = action === "HELP" && !values.OptOutType && config.mode === "live" && readVault().COMMUNICATIONS_SEND_ENABLED === "true";
    return { duplicate: false, response: help ? `<Response><Message>${xml("For help, contact the auto shop directly. Reply STOP to opt out.")}</Message></Response>` : "<Response/>" };
  }, true);
}
const statusOrder: Partial<Record<MessageStatus, number>> = { sending: 0, uncertain: 0, accepted: 1, failed: 2, delivered: 3 };
function applyStatus(message: CommunicationMessage, status: MessageStatus, providerId: string, detail: string, at?: number) {
  if (!["sending", "uncertain", "accepted", "failed", "delivered"].includes(message.status)) throw new Error("No matching provider attempt is awaiting this event.");
  if (message.providerId && message.providerId !== providerId) throw new Error("Provider message ID does not match this attempt.");
  message.providerId = providerId;
  if ((statusOrder[status] ?? 0) > (statusOrder[message.status] ?? 0)) { message.status = status; message.detail = detail; }
  message.providerEventAt = Math.max(message.providerEventAt ?? 0, at ?? Date.now());
}
export function acceptTwilioStatus(request: Request, values: Record<string, string>) {
  const config = verifyTwilio(request, "/api/communications/twilio/status", values), query = new URL(request.url).searchParams;
  const id = z.uuid().parse(query.get("message")), attempt = z.uuid().parse(query.get("attempt"));
  const sid = providerSid.parse(values.MessageSid), status = z.enum(["accepted", "scheduled", "queued", "sending", "sent", "delivered", "undelivered", "failed", "canceled"]).parse(values.MessageStatus);
  return workspaceDatabase(db => {
    const message = messageInDatabase(db, id);
    if (!message || message.channel !== "sms" || message.attemptId !== attempt || normalizePhone(values.To ?? "") !== message.to || normalizePhone(values.From ?? "") !== config.from) throw new Error("Provider status belongs to another message.");
    const event = `communication-provider-event:${communicationHash({ attempt, sid, status, error: values.ErrorCode ?? "" })}`;
    if (readCommunicationDocument(db, event, "communication-provider-event")) return { duplicate: true };
    const next = status === "delivered" ? "delivered" : ["failed", "undelivered", "canceled"].includes(status) ? "failed" : "accepted";
    applyStatus(message, next, sid, next === "delivered" ? "Twilio reported delivery to the recipient's device; reading is not established." : next === "failed" ? "Twilio reported failed or undeliverable SMS." : "Twilio reported that the message is queued or sent; delivery is unconfirmed.");
    saveMessageInDatabase(db, message); communicationAudit(db, message, `Twilio status: ${status}`);
    saveCommunicationDocument(db, event, "communication-provider-event", { messageId: id, status, createdAt: new Date().toISOString() });
    return { duplicate: false };
  }, true);
}
/** https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks */
export function acceptMailgunEvent(raw: unknown) {
  const payload = z.object({ signature: z.object({ timestamp: z.union([z.string(), z.number()]).transform(String), token: z.string().min(1).max(100), signature: z.string().regex(/^[a-f0-9]{64}$/i) }), "event-data": z.record(z.string(), z.unknown()) }).parse(raw);
  const secret = readVault().MAILGUN_WEBHOOK_SIGNING_KEY;
  const expected = secret ? createHmac("sha256", secret).update(payload.signature.timestamp + payload.signature.token).digest("hex") : "";
  const age = Date.now() / 1000 - Number(payload.signature.timestamp);
  if (!secret || !equal(expected, payload.signature.signature.toLowerCase()) || !/^\d{10}$/.test(payload.signature.timestamp) || age > 24 * 3600 || age < -300) throw new Error("Provider authentication failed.");
  const data = payload["event-data"], eventId = z.string().min(1).max(200).parse(data.id), eventAt = z.number().finite().positive().parse(data.timestamp);
  const eventType = z.string().max(60).parse(data.event), variables = z.record(z.string(), z.unknown()).parse(data["user-variables"] ?? {});
  const id = z.uuid().parse(variables.shuug_message), attempt = z.uuid().parse(variables.shuug_attempt);
  const recipient = z.email().parse(data.recipient).toLowerCase(), messageData = z.record(z.string(), z.unknown()).parse(data.message);
  const headers = z.record(z.string(), z.unknown()).parse(messageData.headers), providerId = z.string().min(1).max(300).parse(headers["message-id"]);
  return workspaceDatabase(db => {
    const key = `communication-mailgun-event:${communicationHash({ eventId, day: Math.floor(eventAt / 86400) })}`;
    const digest = communicationHash(data), prior = readCommunicationDocument<{ digest: string }>(db, key, "communication-provider-event");
    const tokenKey = `communication-mailgun-token:${communicationHash(payload.signature.token)}`;
    const token = readCommunicationDocument<{ digest: string }>(db, tokenKey, "communication-provider-token");
    if (token) { if (token.digest !== digest) throw new Error("Provider signature token was already used for different details."); return { duplicate: true }; }
    if (prior) {
      if (prior.digest !== digest) throw new Error("Provider event already has different details.");
      saveCommunicationDocument(db, tokenKey, "communication-provider-token", { digest, createdAt: new Date().toISOString() });
      return { duplicate: true };
    }
    const message = messageInDatabase(db, id);
    if (!message || message.channel !== "email" || message.attemptId !== attempt || message.to !== recipient) throw new Error("Provider event belongs to another message.");
    const normalized = providerId.startsWith("<") ? providerId : `<${providerId}>`;
    const status: MessageStatus = eventType === "delivered" ? "delivered" : ["permanent_fail", "permanent-fail", "failed"].includes(eventType) && data.severity !== "temporary" ? "failed" : "accepted";
    const flags = data.flags && typeof data.flags === "object" ? data.flags as Record<string, unknown> : {};
    if (message.providerMode === "test" || flags["is-test-mode"] === true) {
      applyStatus(message, "accepted", normalized, "Mailgun reported a test event; this does not establish recipient delivery.", eventAt * 1000);
    } else applyStatus(message, status, normalized, status === "delivered" ? "Mailgun reported acceptance by the recipient's mail server; reading is not established." : status === "failed" ? "Mailgun reported a permanent delivery failure." : "Mailgun reported acceptance or a temporary delivery delay; recipient delivery remains unconfirmed.", eventAt * 1000);
    saveMessageInDatabase(db, message); communicationAudit(db, message, `Mailgun event: ${eventType}`);
    saveCommunicationDocument(db, key, "communication-provider-event", { digest, messageId: id, status: eventType, createdAt: new Date().toISOString() });
    saveCommunicationDocument(db, tokenKey, "communication-provider-token", { digest, createdAt: new Date().toISOString() });
    return { duplicate: false };
  }, true);
}
