import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { readVault } from "../connections/vault";
import { shopSettingsInDatabase } from "../shop-automation/settings";
import { messageInDatabase, saveMessageInDatabase, allCommunicationDocuments, consentInDatabase, messageMetadata, communicationAudit } from "./store";
import { normalizePhone, type CommunicationMessage } from "./model";
import { providerConfig, sendCommunication, type Fetcher } from "./provider";
export { queueMessage, queueMessageInDatabase, recordSmsConsent, recordSmsConsentInDatabase, communicationSnapshot } from "./store";
export { communicationConnectionStatus } from "./provider";

function sourceProblem(db: DatabaseSync, message: CommunicationMessage): string | null {
  if (message.recordId) {
    const row = db.prepare("SELECT body FROM records WHERE id=?").get(message.recordId) as { body: string } | undefined;
    if (!row) return "The source record is unavailable.";
    const current = JSON.parse(row.body);
    if ((message.recordRevision && current.revision !== message.recordRevision) || (message.expectedStatus && current.status !== message.expectedStatus)) return "The source changed before dispatch. Review a new message.";
    if ((message.recordStart && current.fields?.start !== message.recordStart) || (message.recordEnd && current.fields?.end !== message.recordEnd)) return "The appointment time changed before dispatch. Review a new message.";
    if (current.status === "canceled" || current.status === "cancelled" || current.status === "void") return "The source was canceled before dispatch.";
  }
  if (message.customerId) {
    const customer = db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(message.customerId) as { body: string } | undefined;
    if (!customer) return "The service client is unavailable.";
    const values = JSON.parse(customer.body);
    const contact = message.channel === "email" ? String(values.fields?.email ?? "").toLowerCase() : String(values.fields?.phone ?? "");
    if (message.channel === "email" && contact !== message.to) return "The client's email changed before dispatch.";
    if (message.channel === "sms") { try { if (normalizePhone(contact) !== message.to) return "The client's phone changed before dispatch."; } catch { return "The client's phone is no longer available."; } }
  }
  return null;
}
function automationPaused(db: DatabaseSync, message: CommunicationMessage) {
  return ["shop-automation", "website-intake", "shop-invoicing"].includes(message.source ?? "")
    && (readVault().SHOP_AUTOMATION_ENABLED !== "true" || !shopSettingsInDatabase(db).enabled);
}
/** At most one reserved provider request per immutable event. Ambiguous sends never retry. */
export async function dispatchQueuedMessages(limit = 20, options: { fetcher?: Fetcher } = {}) {
  z.number().int().min(1).max(100).parse(limit);
  const candidates = workspaceDatabase(db => {
    const rows = allCommunicationDocuments<{ id: string; status: CommunicationMessage["status"]; attemptedAt: string | null; updatedAt: string; notBefore?: string }>(db, "communication-message", 100000);
    for (const row of rows.filter(item => item.status === "sending" && item.attemptedAt && Date.now() - Date.parse(item.attemptedAt) > 60000)) {
      const message = messageInDatabase(db, row.id)!;
      message.status = "uncertain"; message.detail = "Dispatch was interrupted. Check provider evidence; this message will not be resent.";
      saveMessageInDatabase(db, message); communicationAudit(db, message, "Interrupted dispatch needs review");
    }
    return rows.filter(item => (item.status === "queued" || item.status === "blocked") && (!item.notBefore || Date.parse(item.notBefore) <= Date.now()))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)).slice(0, limit).map(item => item.id);
  }, true);
  const results: CommunicationMessage[] = [];
  for (const id of candidates) {
    const reservation = workspaceDatabase(db => {
      const message = messageInDatabase(db, id);
      if (!message || !["queued", "blocked"].includes(message.status) || message.attemptId || (message.notBefore && Date.parse(message.notBefore) > Date.now())) return null;
      const stale = sourceProblem(db, message);
      if (stale) { message.status = "canceled"; message.detail = stale; saveMessageInDatabase(db, message); communicationAudit(db, message, "Stale message canceled"); return { message, send: false as const }; }
      let problem: string | null = readVault().COMMUNICATIONS_SEND_ENABLED !== "true" ? "Outbound sending is off. Configure the shop's providers and enable it explicitly." : null;
      if (automationPaused(db, message)) problem = "Shop automation is paused. This automatic message will wait.";
      if (message.channel === "sms") { const consent = consentInDatabase(db, message.to); if (!consent?.granted || consent.providerStopped) problem = "SMS is blocked by missing consent or a recorded opt-out."; }
      let config: ReturnType<typeof providerConfig> | null = null;
      if (!problem) { try { config = providerConfig(message.channel); } catch (error) { problem = error instanceof Error ? error.message : "Provider is not configured."; } }
      if (problem || !config) { message.status = "blocked"; message.detail = problem ?? "Provider is unavailable."; saveMessageInDatabase(db, message); return { message, send: false as const }; }
      message.status = "sending"; message.attemptId = randomUUID(); message.attemptedAt = new Date().toISOString();
      message.configDigest = config.value.digest; message.providerMode = config.value.mode; message.detail = "Provider request reserved. Outcome is not confirmed; do not resend.";
      saveMessageInDatabase(db, message); communicationAudit(db, message, "Provider attempt reserved");
      return { message, config, send: true as const };
    }, true);
    if (!reservation) continue;
    if (!reservation.send) { results.push(messageMetadata(reservation.message)); continue; }
    // Re-read current settings/consent immediately before the single asynchronous request.
    const check = workspaceDatabase(db => {
      const message = messageInDatabase(db, id)!;
      const consent = message.channel === "sms" ? consentInDatabase(db, message.to) : null;
      return message.status === "sending" && readVault().COMMUNICATIONS_SEND_ENABLED === "true" && !automationPaused(db, message) && !sourceProblem(db, message)
        && (message.channel !== "sms" || Boolean(consent?.granted && !consent.providerStopped));
    });
    if (!check) {
      results.push(workspaceDatabase(db => {
        const current = messageInDatabase(db, id)!;
        if (current.status === "sending" && current.attemptId === reservation.message.attemptId && !current.providerId) {
          const stale = sourceProblem(db, current);
          current.status = stale ? "canceled" : "blocked";
          current.detail = stale ?? "Sending, automation or SMS consent was paused before provider dispatch. No request was made.";
          current.attemptId = null; current.attemptedAt = null; current.configDigest = null;
          saveMessageInDatabase(db, current); communicationAudit(db, current, "Dispatch stopped before provider request");
        }
        return messageMetadata(current);
      }, true));
      continue;
    }
    let outcome: Awaited<ReturnType<typeof sendCommunication>> = { status: "uncertain", providerId: null };
    try {
      const config = providerConfig(reservation.message.channel);
      if (config.value.digest === reservation.message.configDigest) outcome = await sendCommunication(reservation.message, config, options.fetcher);
    } catch { /* Provider secrets and response bodies never enter errors or logs. */ }
    results.push(workspaceDatabase(db => {
      const current = messageInDatabase(db, id)!;
      // A signed delivery callback can arrive before the HTTP send response.
      if (current.status !== "sending") return messageMetadata(current);
      current.status = outcome.status; current.providerId = outcome.providerId;
      current.detail = outcome.status === "accepted" ? current.providerMode === "test" ? "Provider accepted a test request; no email was delivered." : "Provider accepted the request. Recipient delivery remains unconfirmed."
        : outcome.status === "simulated" ? "SMS test preview completed locally. No provider was contacted and no text was sent."
        : outcome.status === "failed" ? "The request was blocked or explicitly rejected. Review evidence before creating a new event."
        : "The provider outcome is uncertain. Check provider evidence; no automatic resend will occur.";
      saveMessageInDatabase(db, current); communicationAudit(db, current, "Provider attempt result"); return messageMetadata(current);
    }, true));
  }
  return results;
}
export function resolveUncertainMessage(id: string, outcome: "accepted" | "not_sent", evidence: string, providerId?: string) {
  z.uuid().parse(id); z.string().trim().min(10).max(2000).parse(evidence); z.enum(["accepted", "not_sent"]).parse(outcome);
  if (outcome === "accepted") z.string().trim().min(1).max(300).parse(providerId);
  return workspaceDatabase(db => {
    const message = messageInDatabase(db, id);
    if (!message || message.status !== "uncertain") throw new Error("Choose an uncertain message after checking provider evidence.");
    message.status = outcome === "accepted" ? "accepted" : "failed"; message.providerId = providerId ?? null;
    message.detail = outcome === "accepted" ? "Staff recorded provider acceptance from reviewed evidence; recipient delivery remains unconfirmed." : "Staff recorded that no send occurred. A new explicit message may be queued.";
    saveMessageInDatabase(db, message); communicationAudit(db, message, "Uncertain provider result reviewed");
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(message.id, "Workspace owner", "Provider evidence", new Date().toISOString(), JSON.stringify({ evidence }));
    return messageMetadata(message);
  }, true);
}
