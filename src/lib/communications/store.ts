import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { openSecret, sealSecret } from "../connections/vault";
import { queueMessageInput, smsConsentInput, normalizePhone, type CommunicationMessage, type QueueMessageInput, type SmsConsent, type SmsConsentInput, type CommunicationInbound, type MessageStatus } from "./model";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const communicationHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function readCommunicationDocument<T>(db: DatabaseSync, id: string, kind: string): T | null {
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind=?").get(id, kind) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : null;
}
export function saveCommunicationDocument(db: DatabaseSync, id: string, kind: string, value: unknown) {
  db.prepare("INSERT INTO documents VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(id, kind, JSON.stringify(value));
}
export function allCommunicationDocuments<T>(db: DatabaseSync, kind: string, limit = 1000): T[] {
  return (db.prepare("SELECT body FROM documents WHERE kind=? ORDER BY coalesce(json_extract(body,'$.createdAt'),json_extract(body,'$.receivedAt'),json_extract(body,'$.updatedAt')) DESC,id DESC LIMIT ?").all(kind, limit) as { body: string }[]).map(row => JSON.parse(row.body));
}
const messageKey = (id: string) => `communication-message:${id}`;
const consentKey = (phone: string) => `communication-consent:${communicationHash(phone)}`;
type StoredMessage = Omit<CommunicationMessage, "body" | "subject"> & { sealedContent: string };
export function messageInDatabase(db: DatabaseSync, id: string): CommunicationMessage | null {
  const stored = readCommunicationDocument<StoredMessage>(db, messageKey(id), "communication-message");
  if (!stored) return null;
  const { sealedContent, ...metadata } = stored;
  return { ...metadata, ...JSON.parse(openSecret(sealedContent)) };
}
export function messageMetadata(message: CommunicationMessage): CommunicationMessage {
  const readable = (value: string) => value.replace(/\b(?:https?|ftp):\/\/[^\s<>"']+|\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\/api\/[^\s<>"']+/gi, "[private link]");
  return { ...message, body: readable(message.body), ...(message.subject ? { subject: readable(message.subject) } : {}) };
}
export function saveMessageInDatabase(db: DatabaseSync, message: CommunicationMessage) {
  message.updatedAt = new Date().toISOString();
  const { body, subject, ...metadata } = message;
  saveCommunicationDocument(db, messageKey(message.id), "communication-message", { ...metadata, sealedContent: sealSecret(JSON.stringify({ body, ...(subject ? { subject } : {}) })) });
}
export function consentInDatabase(db: DatabaseSync, phone: string) { return readCommunicationDocument<SmsConsent>(db, consentKey(normalizePhone(phone)), "communication-consent"); }
export function communicationAudit(db: DatabaseSync, message: CommunicationMessage, action: string) {
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(message.id, "Communications", action, new Date().toISOString(), JSON.stringify({ id: message.id, channel: message.channel, purpose: message.purpose, status: message.status, providerId: message.providerId }));
}
export function queueMessageInDatabase(db: DatabaseSync, raw: QueueMessageInput): CommunicationMessage {
  const input = queueMessageInput.parse(raw);
  input.to = input.channel === "sms" ? normalizePhone(input.to) : input.to.toLowerCase();
  const eventId = `communication-event:${communicationHash(input.eventKey)}`, digest = communicationHash(input);
  const previous = readCommunicationDocument<{ digest: string; messageId: string }>(db, eventId, "communication-event");
  if (previous) {
    if (previous.digest !== digest) throw new Error("This message event already has different content or recipient.");
    const message = messageInDatabase(db, previous.messageId);
    if (!message) throw new Error("The recorded message is unavailable. Review its event history.");
    return messageMetadata(message);
  }
  const count = db.prepare("SELECT count(*) AS count FROM documents WHERE kind='communication-message'").get() as { count: number };
  if (count.count >= 100000) throw new Error("Message history needs a capacity review.");
  const now = new Date().toISOString(), consent = input.channel === "sms" ? consentInDatabase(db, input.to) : null;
  const blocked = input.channel === "sms" && (!consent?.granted || consent.providerStopped);
  const message: CommunicationMessage = { ...input, id: randomUUID(), provider: input.channel === "sms" ? "twilio" : "mailgun",
    status: blocked ? "blocked" : "queued", detail: blocked ? "SMS needs current affirmative consent and no provider opt-out." : "Queued; no provider request has been made.",
    createdAt: now, updatedAt: now, attemptId: null, attemptedAt: null, providerId: null, providerMode: null, configDigest: null, providerEventAt: null };
  saveMessageInDatabase(db, message);
  saveCommunicationDocument(db, eventId, "communication-event", { digest, messageId: message.id });
  communicationAudit(db, message, "Message queued");
  return messageMetadata(message);
}
export function queueMessage(input: QueueMessageInput) { return workspaceDatabase(db => queueMessageInDatabase(db, input), true); }
export function recordSmsConsentInDatabase(db: DatabaseSync, raw: SmsConsentInput): SmsConsent {
  const input = smsConsentInput.parse(raw), phone = normalizePhone(input.phone), digest = communicationHash({ ...input, phone });
  const eventId = input.requestId ? `communication-consent-event:${input.requestId}` : null;
  if (eventId) {
    const prior = readCommunicationDocument<{ digest: string; consent: SmsConsent }>(db, eventId, "communication-consent-event");
    if (prior) { if (prior.digest !== digest) throw new Error("Consent request ID already has different evidence."); return prior.consent; }
  }
  const previous = consentInDatabase(db, phone);
  const consent: SmsConsent = { phone, granted: input.granted, providerStopped: previous?.providerStopped ?? false,
    source: input.source, evidence: input.evidence, policyVersion: input.policyVersion, actor: input.actor ?? "Recorded consent", updatedAt: new Date().toISOString() };
  saveCommunicationDocument(db, consentKey(phone), "communication-consent", consent);
  saveCommunicationDocument(db, eventId ?? `communication-consent-event:${randomUUID()}`, "communication-consent-event", { digest, consent, createdAt: consent.updatedAt });
  return consent;
}
export function recordSmsConsent(input: SmsConsentInput) { return workspaceDatabase(db => recordSmsConsentInDatabase(db, input), true); }
/** Only a signature-verified provider webhook calls this to clear a provider STOP. */
export function providerSmsPreferenceInDatabase(db: DatabaseSync, phone: string, action: "STOP" | "START", providerId: string) {
  const consent: SmsConsent = { phone: normalizePhone(phone), granted: action === "START", providerStopped: action === "STOP",
    source: "verified-twilio-inbound", evidence: `${action} received in provider message ${providerId}`, policyVersion: "sms-provider-keyword-v1", actor: "Twilio signed webhook", updatedAt: new Date().toISOString() };
  saveCommunicationDocument(db, consentKey(consent.phone), "communication-consent", consent);
  saveCommunicationDocument(db, `communication-consent-event:${randomUUID()}`, "communication-consent-event", { consent, createdAt: consent.updatedAt });
  return consent;
}
export function communicationSnapshot() {
  return workspaceDatabase(db => {
    const counts: Record<MessageStatus, number> = { queued: 0, blocked: 0, sending: 0, accepted: 0, delivered: 0, failed: 0, uncertain: 0, canceled: 0, simulated: 0 };
    const rows = db.prepare("SELECT json_extract(body,'$.status') AS status,count(*) AS count FROM documents WHERE kind='communication-message' GROUP BY json_extract(body,'$.status')").all() as { status: string; count: number }[];
    for (const row of rows) if (Object.hasOwn(counts, row.status)) counts[row.status as MessageStatus] = row.count;
    // Keep old unresolved messages visible even after many newer deliveries.
    const messages = (db.prepare(`SELECT body FROM documents WHERE kind='communication-message' ORDER BY
      CASE json_extract(body,'$.status') WHEN 'uncertain' THEN 0 WHEN 'sending' THEN 1 WHEN 'blocked' THEN 2 WHEN 'queued' THEN 3 WHEN 'failed' THEN 4 ELSE 5 END,
      coalesce(json_extract(body,'$.updatedAt'),json_extract(body,'$.createdAt')) DESC,id DESC LIMIT 500`).all() as { body: string }[])
      .map(row => JSON.parse(row.body) as StoredMessage).map(({ sealedContent, ...metadata }) => messageMetadata({ ...metadata, ...JSON.parse(openSecret(sealedContent)) } as CommunicationMessage));
    return { messages, counts, consents: allCommunicationDocuments<SmsConsent>(db, "communication-consent", 500),
      inbound: allCommunicationDocuments<Omit<CommunicationInbound, "body"> & { sealedBody: string }>(db, "communication-inbound", 500).map(({ sealedBody, ...metadata }) => ({ ...metadata, body: openSecret(sealedBody) })) };
  });
}
export function cancelQueuedMessage(id: string) {
  return workspaceDatabase(db => {
    const message = messageInDatabase(db, id);
    if (!message || !["queued", "blocked"].includes(message.status) || message.attemptId) throw new Error("Only an unattempted message can be canceled.");
    message.status = "canceled"; message.detail = "Canceled before provider dispatch.";
    saveMessageInDatabase(db, message); communicationAudit(db, message, "Message canceled"); return messageMetadata(message);
  }, true);
}
