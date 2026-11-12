import type { DatabaseSync } from "node:sqlite";
import { setting } from "../connections/vault";
import { queueMessageInDatabase, recordSmsConsentInDatabase } from "../communications/store";
import { ingestWebsiteRequestInDatabase } from "../email/store";
import { shopSettingsInDatabase } from "../shop-automation/settings";
import { automotiveSmsConsentText, automotiveSmsConsentVersion, type AutomotiveIntakeReceipt, type Form, type Submission } from "./model";

export function automotiveIntakeSummary(input: Submission): string {
  const v = input.vehicle;
  return [input.phone ? `Phone: ${input.phone}` : "", v ? `Vehicle (self-reported): ${[v.year, v.make, v.model].filter(Boolean).join(" ") || "Not supplied"}` : "",
    v?.vin ? `VIN (unverified): ${v.vin}` : "", v?.plate ? `Registration / plate: ${v.plate}` : "", v?.odometer !== undefined ? `Odometer (self-reported): ${v.odometer}` : "",
    input.requestedDate ? `Requested date: ${input.requestedDate} (not confirmed)` : ""].filter(Boolean).join("\n");
}

/** Pure local intake work: no provider is called here. Its receipt, owner inbox,
 * optional consent and outbox reservation share the request's write transaction. */
export function completeAutomotiveIntakeInDatabase(db: DatabaseSync, input: { submission: Submission; form: Form; businessName: string }): AutomotiveIntakeReceipt {
  const { submission, form, businessName } = input;
  const inbox = ingestWebsiteRequestInDatabase(db, { id: submission.id, from: submission.email, fromName: submission.name,
    subject: `Website service request: ${submission.name}`,
    body: [submission.message, automotiveIntakeSummary(submission), `Request reference: ${submission.id}`, "Website contact and vehicle details are self-reported and require review. This request does not confirm an appointment, authorize repairs or approve a price."].filter(Boolean).join("\n\n"),
    receivedAt: submission.createdAt });
  const receipt: AutomotiveIntakeReceipt = { id: submission.id, receivedAt: submission.createdAt, formRevision: form.revision, status: "received", ownerInboxId: inbox.id,
    smsAcknowledgment: submission.smsConsent ? "automation_disabled" : "not_requested", emailAcknowledgment: "automation_disabled" };
  if (submission.smsConsent && submission.phone) recordSmsConsentInDatabase(db, { phone: submission.phone, granted: true, source: `website-form:${form.id}`, requestId: submission.requestId, actor: "Website visitor",
    policyVersion: automotiveSmsConsentVersion, evidence: `Optional SMS checkbox selected for request ${submission.id} at ${submission.createdAt}. Form revision ${form.revision}. Displayed wording: ${automotiveSmsConsentText}` });
  if (!shopSettingsInDatabase(db).enabled || setting("SHOP_AUTOMATION_ENABLED") !== "true") return receipt;
  const client = submission.records?.find(record => record.kind === "client");
  const email = queueMessageInDatabase(db, { eventKey: `website-intake:${submission.id}:email-ack:v1`, channel: "email", to: submission.email,
    subject: "We received your service request", body: `${businessName}: We received your service request.\n\nReference: ${submission.id}\n\nWe'll review your details and follow up. This request does not confirm an appointment, an estimate or repair authorization.`,
    purpose: "service-request-acknowledgment", source: "website-intake", ...(client ? { customerId: client.id } : {}) });
  receipt.emailAcknowledgment = "queued"; receipt.emailMessageId = email.id;
  if (!submission.smsConsent || !submission.phone) return receipt;
  const message = queueMessageInDatabase(db, { eventKey: `website-intake:${submission.id}:sms-ack:v1`, channel: "sms", to: submission.phone,
    body: `${businessName}: We received your service request. Reference: ${submission.id}. We'll review it and follow up. This does not confirm an appointment or authorize repairs. Reply STOP to opt out, HELP for help.`,
    purpose: "service-request-acknowledgment", source: "website-intake", ...(client ? { customerId: client.id } : {}) });
  return { ...receipt, smsAcknowledgment: message.status === "blocked" ? "blocked" : "queued", messageId: message.id };
}
