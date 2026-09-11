import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { appBaseUrl, openSecret, sealSecret } from "../connections/vault";
import { getStripeConfig } from "../payments/config";
import { workspaceDatabase } from "../workspace/database";
import { paymentTotal, type BusinessRecord } from "../workspace/model";
import { settleWebsitePayment } from "../workspace/store";
import { customerFromDatabase, CUSTOMER_PATH } from "../customer-access/accounts";
import { customerSettings, requireCustomer } from "../customer-access/service";
import { digest, getPayment, paymentRows, paymentRate, pendingInvoice, putPayment, type WebsitePayment } from "./state";
import { paymentCurrencies, websitePaymentReady, websitePaymentSettings } from "./settings";
import { stripeSession, type CheckoutSession } from "./stripe";

const requireReady = () => { const config = getStripeConfig(); if (!config || !websitePaymentReady()) throw new Error("Online payments are not configured. Contact the organization."); return config; };
const amountCheck = (amount: number, currency: string) => { if (!Number.isSafeInteger(amount) || amount < 100 || amount > 99_999_999 || !paymentCurrencies.includes(currency as typeof paymentCurrencies[number])) throw new Error("Online payments support USD, EUR, GBP, CAD and AUD, from 1.00 to 999,999.99. Contact the organization for other amounts or currencies."); };
function draft(input: Pick<WebsitePayment, "id" | "kind" | "invoiceId" | "accountId" | "amount" | "currency" | "title" | "donor" | "receiptHash" | "requestHash">, returnUrl: string, email: string): WebsitePayment {
  const config = requireReady(); amountCheck(input.amount, input.currency);
  const params = new URLSearchParams({ mode: "payment", client_reference_id: input.id, "metadata[shuug_payment]": input.id, "payment_intent_data[metadata][shuug_payment]": input.id, "payment_method_types[0]": "card", "adaptive_pricing[enabled]": "false", "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": input.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(input.amount), "line_items[0][price_data][product_data][name]": input.title, customer_email: email, success_url: returnUrl, cancel_url: returnUrl, expires_at: String(Math.floor(Date.now() / 1000) + 23 * 3600) });
  return { ...input, status: "creating", live: config.live, sealedKey: sealSecret(config.secretKey), parameters: params.toString(), createdAt: new Date().toISOString(), checkedAt: null, nextCheck: Date.now() + 60000, attempts: 0, sessionId: null, intentId: null, checkoutUrl: null, recordId: null, paymentId: null, error: null };
}
export function reserveInvoicePayment(token: string, invoiceId: string) {
  z.uuid().parse(invoiceId); requireCustomer(token);
  if (!customerSettings().servicePortal || !websitePaymentSettings().invoiceEnabled) throw new Error("Online invoice payments are not enabled."); requireReady();
  return workspaceDatabase(db => {
    const account = customerFromDatabase(db, token); if (!account?.clientId) throw new Error("Sign in with the customer account for this invoice.");
    const records = (db.prepare("SELECT body FROM records").all() as { body: string }[]).map(r => JSON.parse(r.body) as BusinessRecord), invoice = records.find(r => r.id === invoiceId && r.kind === "invoice" && r.status === "issued");
    const job = invoice && records.find(r => r.id === invoice.fields.job && r.kind === "job" && r.fields.client === account.clientId);
    if (!invoice || !job) throw new Error("Invoice unavailable for this account.");
    const existing = pendingInvoice(db, invoice.id); if (existing) { if (existing.accountId !== account.id) throw new Error("Another customer account has a payment pending for this invoice. Contact the organization before paying again."); return existing; }
    const amount = Number(invoice.fields.amount) - paymentTotal(records, "service_payment", "invoice", invoice.id), id = randomUUID();
    return putPayment(db, draft({ id, kind: "invoice", invoiceId, accountId: account.id, amount, currency: invoice.currency, title: invoice.title, donor: null, receiptHash: null, requestHash: digest(invoice.id) }, new URL(`${CUSTOMER_PATH}?payment=${id}#invoices`, appBaseUrl()).href, account.email));
  }, true);
}
const proofSchema = z.object({ id: z.uuid(), token: z.string().regex(/^[a-f0-9]{64}$/), at: z.number().int(), settings: z.string() }).strict();
export function donationProof() { return sealSecret(JSON.stringify({ id: randomUUID(), token: randomBytes(32).toString("hex"), at: Date.now(), settings: digest(JSON.stringify(websitePaymentSettings())) })); }
export const donationInputSchema = z.object({ proof: z.string().max(4000), name: z.string().trim().min(2).max(100), email: z.email().max(160).transform(s => s.toLowerCase()), amount: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount with up to two decimal places."), consent: z.literal(true), website: z.literal("") }).strict();
export function reserveDonation(raw: unknown) {
  const input = donationInputSchema.parse(raw), settings = websitePaymentSettings();
  if (!settings.donationsEnabled) throw new Error("Online donations are not available."); requireReady();
  let proof: z.infer<typeof proofSchema>; try { proof = proofSchema.parse(JSON.parse(openSecret(input.proof))); } catch { throw new Error("Reload the donation form before continuing."); }
  const amount = Math.round(Number(input.amount) * 100), requestHash = digest(JSON.stringify({ name: input.name, email: input.email, amount, settings: proof.settings }));
  const receipt = workspaceDatabase(db => {
    const old = getPayment(db, proof.id);
    if (old) { if (old.requestHash !== requestHash || old.receiptHash !== digest(proof.token)) throw new Error("This form was already used with different donation details. Reload for a new donation."); return old; }
    if (proof.at > Date.now() || Date.now() - proof.at > 3600000 || proof.settings !== digest(JSON.stringify(settings))) throw new Error("The donation form expired or changed. Reload and review it again.");
    if (amount < settings.minimum || amount > settings.maximum) throw new Error("Choose an amount within the displayed donation limits.");
    if (!paymentRate(db, "donation:all", 300) || !paymentRate(db, `donation:${digest(input.email)}`, 10)) return null;
    const returnUrl = new URL(`/api/website/donate?receipt=${proof.token}&payment=${proof.id}`, appBaseUrl()).href;
    return putPayment(db, draft({ id: proof.id, kind: "donation", invoiceId: null, accountId: null, amount, currency: settings.currency, title: settings.title, receiptHash: digest(proof.token), requestHash, donor: { name: input.name, email: input.email, purpose: settings.purpose, fund: settings.fund, campaign: settings.campaign, consentAt: new Date().toISOString() } }, returnUrl, input.email));
  }, true);
  if (!receipt) throw new Error("Too many donation requests. Try again in an hour or contact the organization.");
  return { payment: receipt, receipt: proof.token };
}
export function authorizeInvoicePayment(token: string, id: string) {
  z.uuid().parse(id); requireCustomer(token);
  return workspaceDatabase(db => { const a = customerFromDatabase(db, token), p = getPayment(db, id); if (!a || !p || p.kind !== "invoice" || p.accountId !== a.id) throw new Error("Payment unavailable for this account."); return p; });
}
export function authorizeDonationReceipt(id: string, token: string) {
  z.uuid().parse(id); if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Donation receipt unavailable.");
  return workspaceDatabase(db => { const p = getPayment(db, id); if (!p || p.kind !== "donation" || p.receiptHash !== digest(token)) throw new Error("Donation receipt unavailable."); return p; });
}
export function paymentNotice(p: WebsitePayment) { return p.status === "test_paid" ? "Stripe test payment completed. No money was collected and no business receipt was posted." : p.status === "paid" ? "Payment confirmed by Stripe. Thank you." : p.status === "paid_review" ? "Stripe confirmed your payment. The organization is reviewing how to apply it. Please do not pay again." : p.status === "expired" ? "This Checkout session expired without a confirmed payment." : p.status === "review" ? "Payment status needs review. Contact the organization before trying another payment." : "Payment has not been confirmed yet. Refresh its status or continue to Checkout."; }

function acceptSession(id: string, session: CheckoutSession) {
  return workspaceDatabase(db => {
    const p = getPayment(db, id); if (!p) throw new Error("Payment unavailable.");
    if ((p.sessionId && p.sessionId !== session.id) || (p.intentId && p.intentId !== session.payment_intent)) throw new Error("A different provider session is already linked to this payment.");
    if (p.status === "paid" || p.status === "test_paid") return p; // Out-of-order events cannot reverse a receipt.
    p.sessionId = session.id; p.checkedAt = new Date().toISOString(); p.checkoutUrl = session.url; p.error = null; p.nextCheck = Date.now() + 60000;
    if (session.status === "complete" && session.payment_status === "paid" && session.payment_intent) {
      p.intentId = session.payment_intent;
      if (!p.live) { p.status = "test_paid"; return putPayment(db, p); }
      db.exec("SAVEPOINT website_receipt");
      try { Object.assign(p, settleWebsitePayment(db, p, session.payment_intent)); db.exec("RELEASE website_receipt"); p.status = "paid"; }
      catch (error) { db.exec("ROLLBACK TO website_receipt; RELEASE website_receipt"); p.status = "paid_review"; p.error = error instanceof Error ? error.message : "The received payment needs staff review."; }
    } else if (p.status !== "paid_review") {
      p.status = session.status === "expired" && session.payment_status === "unpaid" ? "expired" : session.status === "open" && session.payment_status === "unpaid" ? "open" : "processing";
    }
    return putPayment(db, p);
  }, true);
}
/** Network work is outside SQLite transactions. Every settlement re-reads its
 * receipt under an immediate write lock; retries cannot post a second receipt. */
export async function refreshWebsitePayment(id: string, operation: "refresh" | "expire" = "refresh", recoveredId?: string) {
  z.uuid().parse(id);
  const p = workspaceDatabase(db => getPayment(db, id)); if (!p) throw new Error("Payment unavailable."); if (p.status === "paid" || p.status === "test_paid" || p.status === "expired") return p;
  try {
    let recovery = recoveredId;
    if (!p.sessionId && !recovery) recovery = workspaceDatabase(db => (db.prepare("SELECT session_id FROM website_payment_events WHERE payment_id=? ORDER BY created_at DESC LIMIT 1").get(p.id) as { session_id: string } | undefined)?.session_id);
    if (!p.sessionId && !recovery && (operation === "expire" || Date.now() - Date.parse(p.createdAt) > 22 * 3600000)) throw new Error("Checkout creation could not be confirmed. Find this request ID in Stripe and supply its Checkout session ID for recovery. Do not start a second charge.");
    let session: CheckoutSession;
    if (operation === "expire") {
      try { session = await stripeSession(p, "expire", recovery); } catch { session = await stripeSession(p, "read", recovery); }
    } else session = await stripeSession(p, p.sessionId || recovery ? "read" : "create", recovery);
    return acceptSession(p.id, session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment status could not be checked.";
    workspaceDatabase(db => { const latest = getPayment(db, id); if (latest && !["paid", "test_paid", "expired", "paid_review"].includes(latest.status)) { latest.error = message; latest.attempts++; latest.nextCheck = Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(latest.attempts, 6)); if (latest.attempts >= 5 || Date.now() - Date.parse(latest.createdAt) > 22 * 3600000) latest.status = "review"; putPayment(db, latest); } }, true);
    throw new Error(message);
  }
}
export function queueStripeEvent(raw: unknown) {
  const event = z.object({ id: z.string().regex(/^evt_[a-zA-Z0-9_]+$/), type: z.string(), livemode: z.boolean(), data: z.object({ object: z.record(z.string(), z.unknown()) }) }).parse(raw);
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) return;
  const object = z.object({ id: z.string().regex(/^cs_[a-zA-Z0-9_]+$/), metadata: z.record(z.string(), z.unknown()).nullable() }).parse(event.data.object), id = z.uuid().safeParse(object.metadata?.shuug_payment); if (!id.success) return;
  workspaceDatabase(db => { const p = getPayment(db, id.data); if (!p || p.live !== event.livemode) return; if (p.sessionId && p.sessionId !== object.id) throw new Error("Webhook session does not match this payment."); const existing = db.prepare("SELECT session_id,payment_id FROM website_payment_events WHERE id=?").get(event.id) as { session_id: string; payment_id: string } | undefined; if (existing) { if (existing.session_id !== object.id || existing.payment_id !== p.id) throw new Error("Conflicting webhook receipt."); return; } db.prepare("INSERT INTO website_payment_events VALUES(?,?,?,?)").run(event.id, p.id, object.id, new Date().toISOString()); p.nextCheck = Date.now(); putPayment(db, p); }, true);
}
export async function processWebsitePayments(limit = 20) {
  const ids = workspaceDatabase(db => { const rows = paymentRows(db).filter(p => !["paid", "test_paid", "expired", "paid_review"].includes(p.status) && p.nextCheck <= Date.now()).slice(0, Math.min(limit, 100)); for (const p of rows) { p.nextCheck = Date.now() + 120000; putPayment(db, p); } return rows.map(p => p.id); }, true);
  const results = []; for (const id of ids) { try { const p = await refreshWebsitePayment(id); results.push({ id, status: p.status }); } catch { results.push({ id, status: "retry" }); } } return results;
}
