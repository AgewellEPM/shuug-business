import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import type { BusinessRecord } from "../workspace/model";
import { setting } from "../connections/vault";
import { getBranding } from "../branding/store";
import { consentInDatabase, queueMessageInDatabase } from "../communications/store";
import { shopSettingsInDatabase } from "./settings";

function record(db: DatabaseSync, id: unknown): BusinessRecord | null {
  if (typeof id !== "string") return null;
  const row = db.prepare("SELECT body FROM records WHERE id=?").get(id) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : null;
}
function seen(db: DatabaseSync, key: string) { return Boolean(db.prepare("SELECT id FROM documents WHERE id=?").get(`shop-notification:${key}`)); }
function remember(db: DatabaseSync, key: string, value: unknown) {
  db.prepare("INSERT INTO documents VALUES(?,'shop-notification',?) ON CONFLICT(id) DO NOTHING").run(`shop-notification:${key}`, JSON.stringify(value));
}
/** Called AFTER the record/audit insert in the existing domain transaction.
 * Messages are reserved only; no network operation occurs in the transaction. */
export function queueShopRecordNotifications(db: DatabaseSync, current: BusinessRecord) {
  const settings = shopSettingsInDatabase(db);
  if (!settings.enabled || setting("SHOP_AUTOMATION_ENABLED") !== "true") return;
  const isBooking = current.kind === "booking" && current.status === "scheduled";
  const isJob = current.kind === "job" && ["in_progress", "completed"].includes(current.status);
  const isReceipt = current.kind === "service_payment" && current.status === "confirmed" && current.fields.direction === "receipt" && current.computed?.live !== false;
  if (!isBooking && !isJob && !isReceipt) return;
  const invoice = isReceipt ? record(db, current.fields.invoice) : null;
  const job = isBooking ? record(db, current.fields.job) : isReceipt ? record(db, invoice?.fields.job) : current;
  const client = job ? record(db, job.fields.client) : null;
  if (!job || client?.kind !== "client") return;
  const business = getBranding().businessName;
  const base = isBooking ? `booking:${current.id}:${current.fields.start}:${current.fields.end}` : `${isReceipt ? "payment" : "job"}:${current.id}:${current.status}`;
  const events: { key: string; text: string; notBefore?: string }[] = [];
  if (isBooking) {
    const start = Date.parse(String(current.fields.start));
    if (!Number.isFinite(start) || start <= Date.now()) return;
    const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timeZone }).format(start);
    if (settings.bookingConfirmations) events.push({ key: `${base}:confirmed`, text: `${business}: Your service appointment is confirmed for ${when} (${settings.timeZone}). ${job.title}` });
    if (settings.appointmentReminders) events.push({ key: `${base}:reminder`, text: `${business}: Reminder of your service appointment on ${when} (${settings.timeZone}). ${job.title}`,
      notBefore: new Date(Math.max(Date.now(), start - settings.reminderHours * 3600000)).toISOString() });
  } else if (isReceipt && settings.paymentReceipts) {
    const amount = Number(current.fields.amount);
    if (invoice?.kind === "invoice" && Number.isSafeInteger(amount) && amount > 0) events.push({ key: base,
      text: `${business}: Payment of ${new Intl.NumberFormat("en-US", { style: "currency", currency: current.currency }).format(amount / 100)} has been recorded for ${invoice.title}. Thank you. Receipt reference: ${current.id}.` });
  } else if (isJob && settings.jobUpdates) events.push({ key: base, text: `${business}: ${job.title}. ${current.status === "in_progress" ? "The shop has started the agreed work." : "The shop has marked the agreed work completed. Please contact the shop to arrange pickup."}` });
  for (const event of events) {
    if (seen(db, event.key)) continue;
    const source = { source: "shop-automation", customerId: client.id, recordId: current.id,
      ...(isBooking ? { recordStart: String(current.fields.start), recordEnd: String(current.fields.end), expectedStatus: current.status }
        : isReceipt ? {} : { recordRevision: current.revision, expectedStatus: current.status }),
      ...(event.notBefore ? { notBefore: event.notBefore } : {}) };
    try {
      if (client.fields.email) queueMessageInDatabase(db, { ...source, eventKey: `${event.key}:email`, channel: "email", to: String(client.fields.email),
        body: event.text, subject: `${business} ${isReceipt ? "payment receipt" : "service update"}`, purpose: isReceipt ? "payment_receipt" : "service_updates" });
      if (client.fields.phone) {
        const consent = consentInDatabase(db, String(client.fields.phone));
        if (consent?.granted && !consent.providerStopped) queueMessageInDatabase(db, { ...source, eventKey: `${event.key}:sms`, channel: "sms",
          to: String(client.fields.phone), body: `${event.text}\nReply STOP to opt out.`, purpose: "service_updates" });
      }
      remember(db, event.key, { recordId: current.id, at: new Date().toISOString(), state: "reserved" });
    } catch (error) {
      // A malformed legacy contact must not roll back a completed repair or its
      // accounting. Retain a visible review item instead of losing the event.
      remember(db, event.key, { recordId: current.id, at: new Date().toISOString(), state: "review",
        detail: error instanceof Error ? error.message.slice(0, 250) : "Review the client contact before sending." });
    }
  }
}
export function reserveUpcomingShopNotifications() {
  return workspaceDatabase(db => {
    const rows = db.prepare("SELECT body FROM records WHERE kind IN ('booking','job') AND json_extract(body,'$.status') IN ('scheduled','in_progress','completed') ORDER BY updated_at DESC LIMIT 1000").all() as { body: string }[];
    for (const row of rows) queueShopRecordNotifications(db, JSON.parse(row.body));
    return rows.length;
  }, true);
}
