import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { appBaseUrl, sealSecret } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { numberField, paymentTotal, type BusinessRecord } from "../workspace/model";
import { getStripeConfig } from "../payments/config";
import { websitePaymentReady, websitePaymentSettings } from "../website-payments/settings";
import { digest, getPayment, pendingInvoice, putPayment, type WebsitePayment } from "../website-payments/state";
import { transactionRecords, type ServiceTaxSnapshot } from "./tax-snapshot";

export const SHOP_INVOICE_COOKIE = "shuug_shop_invoice";
interface InvoiceGrant { id: string; invoiceId: string; hash: string; expiresAt: string; revoked: boolean; createdAt: string }
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export function shopInvoiceOrigin() {
  const url = new URL(appBaseUrl());
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Set the exact public HTTPS workspace origin before sharing invoices. Local demos may use loopback.");
  return url.origin;
}
export function createShopInvoiceGrantInDatabase(db: DatabaseSync, invoice: BusinessRecord, days: number) {
  z.number().int().min(1).max(90).parse(days);
  if (invoice.kind !== "invoice" || invoice.status !== "issued") throw new Error("Issue the service invoice before creating its private link.");
  const token = randomBytes(32).toString("hex"), now = new Date().toISOString();
  const grant: InvoiceGrant = { id: randomUUID(), invoiceId: invoice.id, hash: hash(token), expiresAt: new Date(Date.now() + days * 86400000).toISOString(), revoked: false, createdAt: now };
  db.prepare("INSERT INTO documents VALUES(?,'shop-invoice-grant',?)").run(`shop-invoice-grant:${grant.hash}`, JSON.stringify(grant));
  return { id: grant.id, url: `${shopInvoiceOrigin()}/api/shop-invoicing/invoice/${token}`, expiresAt: grant.expiresAt };
}
function grantedInvoice(db: DatabaseSync, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invoice link unavailable.");
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='shop-invoice-grant'").get(`shop-invoice-grant:${hash(token)}`) as { body: string } | undefined;
  const grant: InvoiceGrant | undefined = row ? JSON.parse(row.body) : undefined;
  if (!grant || grant.revoked || grant.expiresAt <= new Date().toISOString()) throw new Error("This invoice link expired or was revoked. Ask the shop for a new link.");
  const records = transactionRecords(db), invoice = records.find(r => r.id === grant.invoiceId && r.kind === "invoice" && r.status === "issued");
  if (!invoice) throw new Error("Invoice unavailable.");
  return { grant, invoice, records };
}
export function shopInvoiceView(token: string) {
  const enabled = websitePaymentSettings().invoiceEnabled && websitePaymentReady(), config = getStripeConfig();
  return workspaceDatabase(db => {
    const { invoice, records, grant } = grantedInvoice(db, token), paid = paymentTotal(records, "service_payment", "invoice", invoice.id);
    const amount = numberField(invoice, "amount"), snapshot = invoice.computed?.reviewedTaxSnapshot as ServiceTaxSnapshot | undefined;
    return { id: invoice.id, title: invoice.title, description: String(invoice.fields.description ?? ""), currency: invoice.currency,
      amount, paid, outstanding: amount - paid, due: String(invoice.fields.due ?? ""), issuedOn: String(invoice.fields.issuedOn ?? invoice.updatedAt.slice(0, 10)),
      ...(snapshot ? { subtotal: snapshot.subtotal, tax: snapshot.tax, gross: snapshot.total, depositApplied: snapshot.depositApplied } : {}),
      expiresAt: grant.expiresAt, canPay: enabled && invoice.currency === "USD" && amount - paid >= 100 && amount - paid <= 99_999_999,
      testMode: !!config && !config.live };
  });
}
export function shopInvoicePayment(token: string, id: string) {
  z.uuid().parse(id);
  return workspaceDatabase(db => {
    const { invoice, grant } = grantedInvoice(db, token), payment = getPayment(db, id);
    if (!payment || payment.kind !== "invoice" || payment.invoiceId !== invoice.id || payment.accountId !== null || payment.receiptHash !== grant.hash) throw new Error("Payment unavailable for this invoice link.");
    return payment;
  });
}
/** Customer-initiated Checkout uses the existing verified service-payment settlement. */
export function reserveShopInvoicePayment(token: string) {
  const config = getStripeConfig(), origin = shopInvoiceOrigin();
  if (!config || !websitePaymentReady() || !websitePaymentSettings().invoiceEnabled || (config.live && !origin.startsWith("https:"))) throw new Error("Online payment is not connected for this invoice. Contact the shop.");
  return workspaceDatabase(db => {
    const { invoice, grant, records } = grantedInvoice(db, token);
    const old = pendingInvoice(db, invoice.id);
    if (old) {
      if (old.kind !== "invoice" || old.accountId !== null || old.receiptHash !== grant.hash) throw new Error("A payment is already pending for this invoice. Contact the shop before paying again.");
      return old;
    }
    const amount = numberField(invoice, "amount") - paymentTotal(records, "service_payment", "invoice", invoice.id);
    if (invoice.currency !== "USD" || !Number.isSafeInteger(amount) || amount < 100 || amount > 99_999_999) throw new Error("This balance is unavailable for online payment. Contact the shop.");
    const id = randomUUID(), returnUrl = `${origin}/api/shop-invoicing/invoice-return?payment=${id}`;
    const parameters = new URLSearchParams({ mode: "payment", client_reference_id: id, "metadata[shuug_payment]": id,
      "payment_intent_data[metadata][shuug_payment]": id, "adaptive_pricing[enabled]": "false", "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": invoice.title, success_url: returnUrl, cancel_url: returnUrl,
      expires_at: String(Math.floor(Date.now() / 1000) + 23 * 3600) });
    const payment: WebsitePayment = { id, kind: "invoice", invoiceId: invoice.id, accountId: null, amount, currency: "USD", title: invoice.title,
      status: "creating", live: config.live, createdAt: new Date().toISOString(), checkedAt: null, nextCheck: Date.now() + 60000, attempts: 0,
      sessionId: null, intentId: null, checkoutUrl: null, sealedKey: sealSecret(config.secretKey), parameters: parameters.toString(), requestHash: digest(`${grant.hash}:${invoice.id}:${amount}`),
      receiptHash: grant.hash, donor: null, recordId: null, paymentId: null, error: null };
    return putPayment(db, payment);
  }, true);
}
export function revokeShopInvoiceGrant(id: string) {
  z.uuid().parse(id);
  return workspaceDatabase(db => {
    const rows = db.prepare("SELECT id,body FROM documents WHERE kind='shop-invoice-grant'").all() as { id: string; body: string }[];
    const row = rows.find(r => (JSON.parse(r.body) as InvoiceGrant).id === id);
    if (!row) throw new Error("Invoice link unavailable.");
    const grant = JSON.parse(row.body) as InvoiceGrant; grant.revoked = true;
    db.prepare("UPDATE documents SET body=? WHERE id=?").run(JSON.stringify(grant), row.id);
    return { id, revoked: true };
  }, true);
}
