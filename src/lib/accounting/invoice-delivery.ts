import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { WorkspaceUser } from "../auth/identity";
import { openSecret, sealSecret } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { checkBook } from "./client-books";
import { billingStateInDatabase, tokenHash } from "./billing-share";
import { invoiceDeliverySchemas, type InvoiceDeliveryReceipt, type InvoiceDeliveryResult, type InvoiceEmailPreview } from "./invoice-delivery-model";
import { deliveryHash, invoiceDeliveryConfig, sendInvoiceEmail } from "./invoice-delivery-provider";
export { invoiceDeliverySchemas } from "./invoice-delivery-model";
export { invoiceDeliveryConnection } from "./invoice-delivery-provider";

interface Delivery extends InvoiceDeliveryReceipt {
  bookId: string; actorId: string; previewDigest: string; configDigest: string;
  sealedPreview: string; shareHash: string; shareSnapshot: string; previewExpiresAt: string; expiresAt: string;
  resolution: null | { actor: string; at: string; evidence: string };
}
function must(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const key = (id: string) => `invoice-delivery:${id}`;
function read(db: DatabaseSync, id: string): Delivery {
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='invoice-delivery'").get(key(id)) as { body: string } | undefined;
  must(row, "Invoice delivery is unavailable."); return JSON.parse(row.body);
}
function save(db: DatabaseSync, delivery: Delivery) {
  db.prepare("INSERT INTO documents VALUES(?,'invoice-delivery',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(key(delivery.deliveryId), JSON.stringify(delivery));
}
function all(db: DatabaseSync, bookId: string): Delivery[] {
  return (db.prepare("SELECT body FROM documents WHERE kind='invoice-delivery' AND json_extract(body,'$.bookId')=? ORDER BY json_extract(body,'$.createdAt') DESC").all(bookId) as { body: string }[]).map(row => JSON.parse(row.body));
}
function sharesDigest(db: DatabaseSync, bookId: string, documentId: string) {
  return deliveryHash(db.prepare("SELECT id,body FROM documents WHERE kind='billing-share' AND json_extract(body,'$.bookId')=? AND json_extract(body,'$.documentId')=? ORDER BY id").all(bookId, documentId));
}
function receipt(delivery: Delivery): InvoiceDeliveryReceipt {
  const { deliveryId, documentId, revision, recipient, mode, status, createdAt, attemptedAt, providerId, message, verification } = delivery;
  return { deliveryId, documentId, revision, recipient, mode, status, createdAt, attemptedAt, providerId, message, verification };
}
export function invoiceDeliveryHistory(bookId: string, user: WorkspaceUser) {
  return workspaceDatabase(db => { checkBook(db, bookId, user); return all(db, bookId).map(receipt); });
}
function result(delivery: Delivery, includePreview = false): InvoiceDeliveryResult {
  return { deliveryId: delivery.deliveryId, status: delivery.status, message: delivery.message, providerId: delivery.providerId,
    ...(includePreview && delivery.status === "preview" ? { previewDigest: delivery.previewDigest, preview: JSON.parse(openSecret(delivery.sealedPreview)) as InvoiceEmailPreview } : {}) };
}
function invoice(db: DatabaseSync, bookId: string, id: string, revision: number, allowVoid = false) {
  const doc = billingStateInDatabase(db, bookId).billing?.find(item => item.id === id);
  must(doc?.kind === "invoice" && (doc.status === "posted" || (allowVoid && doc.status === "void")) && doc.revision === revision, "Choose the current invoice revision; only posted invoices can be emailed.");
  must(z.email().max(200).safeParse(doc.party.email).success, "Save the customer's exact email address on the invoice draft before issuing it.");
  return doc;
}
function audit(db: DatabaseSync, delivery: Delivery, actor: string, action: string) {
  // The private URL/message and provider secret are never copied into audit rows.
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(delivery.documentId, actor, action, new Date().toISOString(), JSON.stringify(receipt(delivery)));
}
export async function executeInvoiceDelivery(bookId: string, raw: unknown, user: WorkspaceUser): Promise<InvoiceDeliveryResult> {
  const command = z.object({ requestId: z.uuid(), action: z.enum(["billing.delivery.preview", "billing.delivery.send", "billing.delivery.resolve"]), input: z.record(z.string(), z.unknown()) }).strict().parse(raw);
  const input = invoiceDeliverySchemas[command.action].parse(command.input), request = JSON.stringify({ bookId, actor: user.id, ...command, input });
  const reservation = workspaceDatabase(db => {
    checkBook(db, bookId, user, true);
    const prior = db.prepare("SELECT request,result FROM commands WHERE id=?").get(command.requestId) as { request: string; result: string } | undefined;
    if (prior) {
      must(prior.request === request, "This request ID belongs to different invoice email details or an author.");
      const delivery = read(db, JSON.parse(prior.result).deliveryId); must(delivery.bookId === bookId, "Invoice delivery is unavailable in this book.");
      return { delivery, send: false };
    }
    let delivery: Delivery;
    if (command.action === "billing.delivery.preview") {
      const doc = invoice(db, bookId, input.id, input.revision), config = invoiceDeliveryConfig(), now = Date.now();
      must(all(db, bookId).length < 100000, "Invoice email history needs a capacity review.");
      const token = randomBytes(32).toString("hex"), url = new URL(`/api/accounting/share/${token}`, config.baseUrl).href;
      const preview: InvoiceEmailPreview = { from: config.from, recipient: doc.party.email, subject: "Your invoice is available", text: `Your invoice is available at this private link:\n\n${url}\n\nKeep this link private. It expires in 30 days.`, url, mode: config.mode, expiresAt: new Date(now + 30 * 86400000).toISOString(), previewExpiresAt: new Date(now + 10 * 60000).toISOString() };
      delivery = { deliveryId: randomUUID(), documentId: doc.id, revision: doc.revision, recipient: doc.party.email, mode: config.mode, status: "preview", createdAt: new Date(now).toISOString(), attemptedAt: null, providerId: null, message: "Preview only. No email has been sent and this link is not active.", verification: "none", bookId, actorId: user.id, configDigest: config.digest, previewDigest: deliveryHash({ bookId, documentId: doc.id, revision: doc.revision, configDigest: config.digest, preview }), sealedPreview: sealSecret(JSON.stringify(preview)), shareHash: tokenHash(token), shareSnapshot: sharesDigest(db, bookId, doc.id), previewExpiresAt: preview.previewExpiresAt, expiresAt: preview.expiresAt, resolution: null };
    } else {
      const selected = command.action === "billing.delivery.send" ? invoiceDeliverySchemas["billing.delivery.send"].parse(input) : invoiceDeliverySchemas["billing.delivery.resolve"].parse(input);
      delivery = read(db, selected.deliveryId);
      must(delivery.bookId === bookId && delivery.documentId === selected.id, "Invoice delivery is unavailable for this invoice.");
      if (command.action === "billing.delivery.send") {
        const v = invoiceDeliverySchemas["billing.delivery.send"].parse(selected), doc = invoice(db, bookId, v.id, v.revision), config = invoiceDeliveryConfig();
        must(delivery.actorId === user.id && delivery.status === "preview", "This email preview has already been used or belongs to another author. Inspect its delivery history.");
        must(delivery.previewExpiresAt > new Date().toISOString() && delivery.revision === doc.revision && delivery.recipient === doc.party.email && v.recipient === doc.party.email && delivery.previewDigest === v.previewDigest && delivery.configDigest === config.digest, "Invoice, recipient, connection or reviewed preview changed. Prepare and review a new preview.");
        const previous = all(db, bookId).filter(item => item.documentId === doc.id && item.deliveryId !== delivery.deliveryId);
        must(!previous.some(item => ["sending", "uncertain"].includes(item.status)), "An earlier email may have been accepted. Review that request in Mailgun and record its outcome before sending again.");
        must(!previous.some(item => item.status === "accepted" && item.mode === delivery.mode && item.revision === doc.revision && item.recipient === doc.party.email), "Mailgun already accepted an email for this invoice revision and recipient. Inspect delivery history instead of sending a duplicate.");
        must(delivery.shareSnapshot === sharesDigest(db, bookId, doc.id), "Invoice link permissions changed after preview. Review a new preview before sending.");
        const preview = JSON.parse(openSecret(delivery.sealedPreview)) as InvoiceEmailPreview;
        must(deliveryHash({ bookId, documentId: doc.id, revision: doc.revision, configDigest: config.digest, preview }) === delivery.previewDigest, "The saved email preview does not match its reviewed content.");
        // Activate only this exact reviewed link. Existing invoice links remain valid.
        const share = { id: randomUUID(), bookId, documentId: doc.id, hash: delivery.shareHash, expiresAt: delivery.expiresAt, revoked: false, createdBy: user.id };
        db.prepare("INSERT INTO documents VALUES(?,'billing-share',?)").run(`billing-share:${share.hash}`, JSON.stringify(share));
        delivery.status = "sending"; delivery.attemptedAt = new Date().toISOString(); delivery.message = "The send attempt started. Its provider outcome is not confirmed; do not resend.";
      } else {
        const v = invoiceDeliverySchemas["billing.delivery.resolve"].parse(selected);
        // Resolution records reviewed provider evidence; it never sends or claims recipient delivery.
        invoice(db, bookId, v.id, v.revision, true);
        must(delivery.status === "uncertain" || (delivery.status === "sending" && !!delivery.attemptedAt && Date.now() - Date.parse(delivery.attemptedAt) > 60000), "Only an uncertain or interrupted send requires provider review.");
        must(v.outcome !== "accepted" || !!v.providerId, "Record the actual Mailgun message ID from the reviewed provider evidence.");
        delivery.status = v.outcome; delivery.providerId = v.providerId ?? null; delivery.verification = "staff_recorded_provider_evidence";
        delivery.resolution = { actor: user.id, at: new Date().toISOString(), evidence: v.evidence };
        delivery.message = v.outcome === "accepted" ? "Staff recorded Mailgun acceptance from reviewed provider evidence. Recipient delivery remains unconfirmed." : "Staff reviewed provider evidence and recorded that this request was not sent. A new reviewed send may be prepared.";
      }
    }
    save(db, delivery); audit(db, delivery, user.id, command.action);
    db.prepare("INSERT INTO commands VALUES(?,?,?)").run(command.requestId, request, JSON.stringify({ deliveryId: delivery.deliveryId }));
    return { delivery, send: command.action === "billing.delivery.send" };
  }, true);
  if (!reservation.send) return result(reservation.delivery, command.action === "billing.delivery.preview");

  // One request after durable reservation. A crash or uncertain response never
  // triggers an automatic resend. Retrying the command only reads its receipt.
  const delivery = reservation.delivery;
  let outcome: Awaited<ReturnType<typeof sendInvoiceEmail>> = { status: "uncertain", providerId: null };
  try {
    const config = invoiceDeliveryConfig();
    if (config.digest === delivery.configDigest) outcome = await sendInvoiceEmail(config, JSON.parse(openSecret(delivery.sealedPreview)), delivery.deliveryId);
  } catch { /* No original provider/input/credential details enter logs or errors. */ }
  return workspaceDatabase(db => {
    const current = read(db, delivery.deliveryId);
    if (current.status !== "sending") return result(current);
    current.status = outcome.status; current.providerId = outcome.providerId; current.verification = outcome.status === "accepted" ? "provider_response" : "none";
    current.message = outcome.status === "accepted" ? current.mode === "test" ? "Mailgun accepted the test request. No email was delivered in test mode." : "Mailgun accepted the email request. Recipient delivery has not been confirmed." : outcome.status === "rejected" ? "Mailgun rejected the request. Review the connection and prepare a new preview before another explicit send." : "The provider outcome is uncertain. Do not resend. Review this request in Mailgun and record the outcome.";
    save(db, current); audit(db, current, user.id, "billing.delivery.result"); return result(current);
  }, true);
}
