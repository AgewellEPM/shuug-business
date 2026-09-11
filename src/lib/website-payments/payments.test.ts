// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHmac, randomUUID } from "node:crypto";
import { reserveDonation, donationProof, reserveInvoicePayment, refreshWebsitePayment, authorizeDonationReceipt, authorizeInvoicePayment, queueStripeEvent, processWebsitePayments } from "./service";
import { websitePaymentSettings, saveWebsitePaymentSettings } from "./settings";
import { getPayment, putPayment, listWebsitePayments } from "./state";
import { verifyStripeWebhook } from "./stripe";
import { workspaceDatabase } from "../workspace/database";
import { saveBusinessRecord as save, transitionBusinessRecord as transition, listBusinessRecords, reconcileWebsiteReceipt } from "../workspace/store";
import type { BusinessRecord } from "../workspace/model";
import { paymentTotal } from "../workspace/model";
import { acceptCustomerInvitation, createCustomerAccount, issueCustomerInvitation, signInCustomer } from "../customer-access/accounts";
import { saveCustomerSettings } from "../customer-access/service";
import { POST as webhook } from "@/app/api/website/stripe/webhook/route";
import { GET as donateGet, POST as donatePost } from "@/app/api/website/donate/route";
import { POST as customerPost } from "@/app/api/website/customer/route";
import { GET as capabilities } from "@/app/api/website/capabilities/route";
let dir: string;
const base = "https://business.example.test", secret = "whsec_syntheticfixture";
type Session = { id: string; object: string; mode: string; client_reference_id: string; metadata: { shuug_payment: string }; amount_total: number; currency: string; livemode: boolean; status: string; payment_status: string; payment_intent: string | null; url: string | null };
const sessions = new Map<string, Session>(), creations: { key: string; body: string }[] = [];
function provider() { return vi.fn(async (url: string, init?: RequestInit) => {
  expect(url.startsWith("https://api.stripe.com/v1/checkout/sessions")).toBe(true);
  if (url.endsWith("/sessions")) {
    const params = new URLSearchParams(String(init?.body)), id = params.get("client_reference_id")!, key = new Headers(init?.headers).get("Idempotency-Key")!;
    const previous = creations.find(c => c.key === key); if (previous) expect(String(init?.body)).toBe(previous.body); creations.push({ key, body: String(init?.body) });
    const s: Session = sessions.get(id) ?? { id: `cs_test_${id.replaceAll("-", "")}`, object: "checkout.session", mode: "payment", client_reference_id: id, metadata: { shuug_payment: id }, amount_total: Number(params.get("line_items[0][price_data][unit_amount]")), currency: params.get("line_items[0][price_data][currency]")!, livemode: new Headers(init?.headers).get("authorization")?.includes("sk_live_") ?? false, status: "open", payment_status: "unpaid", payment_intent: null, url: `https://checkout.stripe.com/c/pay/${id}` }; sessions.set(id, s); return Response.json(s);
  }
  const id = url.split("/").findLast(v => v.startsWith("cs_")), s = [...sessions.values()].find(s => s.id === id); if (!s) return Response.json({}, { status: 404 });
  if (url.endsWith("/expire")) { if (s.status !== "open") return Response.json({}, { status: 400 }); s.status = "expired"; s.url = null; }
  return Response.json(s);
}); }
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-website-payment-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_syntheticfixture"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret); sessions.clear(); creations.length = 0; vi.stubGlobal("fetch", provider()); saveWebsitePaymentSettings({ ...websitePaymentSettings(), invoiceEnabled: true, donationsEnabled: true }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const go = (r: BusinessRecord, target: string) => transition({ id: r.id, revision: r.revision, target, commandId: randomUUID() }, "Fixture owner");
const record = (kind: string, fields: BusinessRecord["fields"]) => save({ kind, title: kind, currency: "USD", fields }, "Fixture owner");
function invoiceFixture(email = "client@example.test") {
  const client = record("client", { email });
  const proposal = go(go(record("proposal", { client: client.id, scope: "Repair", exclusions: "No additional work", amount: 10000, expires: "2099-01-01", acceptedBy: "Client", evidence: "Signed estimate" }), "sent"), "accepted");
  const agreement = go(record("agreement", { client: client.id, proposal: proposal.id, terms: "Full deposit", deposit: 10000, signedBy: "Client", evidence: "Signed terms" }), "signed");
  const job = record("job", { client: client.id, agreement: agreement.id, instructions: "Repair", requiredChecks: "Test repair", budget: 1000 });
  const invoice = go(record("invoice", { job: job.id, method: "deposit", amount: 10000, description: "Approved deposit" }), "issued");
  const a = createCustomerAccount({ name: "Client", email, customerId: null, clientId: client.id }); acceptCustomerInvitation(issueCustomerInvitation(a.id), "synthetic-payment-password");
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true });
  return { invoice, token: signInCustomer(email, "synthetic-payment-password") };
}
function gift(proof = donationProof()) { return reserveDonation({ proof, name: "Website Donor", email: "donor@example.test", amount: "25.01", consent: true, website: "" }); }
function pay(id: string) { const s = sessions.get(id)!; Object.assign(s, { status: "complete", payment_status: "paid", payment_intent: `pi_${id.replaceAll("-", "")}`, url: null }); }
function formRequest(path: string, data: Record<string, string>, extra: Record<string, string> = {}) { return new Request(`${base}${path}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", ...extra }, body: new URLSearchParams(data) }); }
it("requires explicit configuration, supported currencies and safe payment origins", () => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", ""); expect(() => saveWebsitePaymentSettings({ ...websitePaymentSettings(), donationsEnabled: true })).toThrow("signing secret");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret); vi.stubEnv("APP_BASE_URL", "http://public.example.test"); expect(() => saveWebsitePaymentSettings(websitePaymentSettings())).toThrow("HTTPS");
});
it("reserves server-calculated balances, scopes customers and blocks conflicting manual changes", () => {
  const a = invoiceFixture(), b = invoiceFixture("other@example.test");
  const part = go(record("service_payment", { invoice: a.invoice.id, amount: 2000, direction: "receipt", reference: "manual-before", paidOn: "2026-09-10", evidence: "Bank entry" }), "confirmed"); expect(part.status).toBe("confirmed");
  const p = reserveInvoicePayment(a.token, a.invoice.id); expect(p.amount).toBe(8000); expect(reserveInvoicePayment(a.token, a.invoice.id).id).toBe(p.id);
  expect(() => reserveInvoicePayment(b.token, a.invoice.id)).toThrow("unavailable"); expect(() => authorizeInvoicePayment(b.token, p.id)).toThrow("unavailable");
  expect(() => go(a.invoice, "void")).toThrow("pending");
  expect(() => go(record("service_payment", { invoice: a.invoice.id, amount: 1, direction: "credit", reference: "conflict", paidOn: "2026-09-10", evidence: "Credit" }), "confirmed")).toThrow("pending");
});
it("posts an invoice receipt once across concurrent callbacks and supports reviewed bank reconciliation", async () => {
  const { invoice, token } = invoiceFixture(), p = reserveInvoicePayment(token, invoice.id); await refreshWebsitePayment(p.id); pay(p.id);
  const results = await Promise.all([refreshWebsitePayment(p.id), refreshWebsitePayment(p.id)]); expect(results.every(r => r.status === "paid")).toBe(true);
  expect(listBusinessRecords(["service_payment"])).toHaveLength(1); expect(paymentTotal(listBusinessRecords(), "service_payment", "invoice", invoice.id)).toBe(10000);
  expect(() => reserveInvoicePayment(token, invoice.id)).toThrow("amounts");
  const reconciled = reconcileWebsiteReceipt(results[0].paymentId!, "Reviewed deposit on bank statement page 3", "Owner"); expect(reconciled.status).toBe("reconciled"); expect(reconciled.fields.evidence).toContain("page 3");
});
it("expires an unpaid invoice session before permitting manual settlement", async () => {
  const { invoice, token } = invoiceFixture(), p = reserveInvoicePayment(token, invoice.id); await refreshWebsitePayment(p.id); expect((await refreshWebsitePayment(p.id, "expire")).status).toBe("expired"); expect(go(invoice, "void").status).toBe("void");
});
it("does not release a payment when Stripe or the network is unavailable", async () => {
  const { invoice, token } = invoiceFixture(), p = reserveInvoicePayment(token, invoice.id); vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Synthetic network interruption"); }));
  await expect(refreshWebsitePayment(p.id)).rejects.toThrow("interruption"); expect(reserveInvoicePayment(token, invoice.id).id).toBe(p.id); expect(() => go(invoice, "void")).toThrow("pending");
  vi.stubGlobal("fetch", provider()); await refreshWebsitePayment(p.id); expect(creations[0].key).toBe(`shuug-website-${p.id}`);
});
it("recovers a created session after a response is lost with exact idempotent parameters", async () => {
  const { payment: p } = gift(), real = provider(); let first = true;
  vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof real>) => { const r = await real(...args); if (first) { first = false; throw new Error("Lost provider response"); } return r; }));
  await expect(refreshWebsitePayment(p.id)).rejects.toThrow("Lost"); await refreshWebsitePayment(p.id); expect(creations).toHaveLength(2); expect(creations[0]).toEqual(creations[1]);
});
it("does not recreate an ambiguous old request after the provider idempotency window", async () => {
  const { payment: p } = gift(); workspaceDatabase(db => { p.createdAt = new Date(Date.now() - 25 * 3600000).toISOString(); putPayment(db, p); }, true);
  await expect(refreshWebsitePayment(p.id)).rejects.toThrow("supply its Checkout session ID"); expect(fetch).not.toHaveBeenCalled();
});
it("creates separate donor, donation and confirmed payment records without declaring tax deductibility", async () => {
  const { payment: p, receipt } = gift(); expect(listBusinessRecords()).toHaveLength(0); await refreshWebsitePayment(p.id); pay(p.id); const result = await refreshWebsitePayment(p.id);
  expect(result.status).toBe("paid"); expect(listBusinessRecords(["donation"])[0].status).toBe("recorded"); expect(listBusinessRecords(["gift_payment"])[0].status).toBe("confirmed"); expect(listBusinessRecords(["acknowledgment"])).toHaveLength(0);
  expect(authorizeDonationReceipt(p.id, receipt).status).toBe("paid"); expect(() => authorizeDonationReceipt(p.id, "0".repeat(64))).toThrow("unavailable");
  const html = await donateGet(new Request(`${base}/api/website/donate?payment=${p.id}&receipt=${receipt}`)).text(); expect(html).toContain("not a charitable tax acknowledgment"); expect(html).not.toContain("donor@example.test");
  expect(JSON.stringify(listWebsitePayments())).not.toContain("sealedKey"); expect(JSON.stringify(listWebsitePayments())).not.toContain(receipt);
});
it("binds donation retry details, consent and the displayed purpose", () => {
  const proof = donationProof(), first = gift(proof); expect(gift(proof).payment.id).toBe(first.payment.id);
  expect(() => reserveDonation({ proof, name: "Changed", email: "donor@example.test", amount: "25.01", consent: true, website: "" })).toThrow("different");
  const stale = donationProof(); saveWebsitePaymentSettings({ ...websitePaymentSettings(), purpose: "Different purpose" }); expect(() => gift(stale)).toThrow("changed");
  expect(() => reserveDonation({ proof: donationProof(), name: "Donor", email: "donor@example.test", amount: "-25", consent: false, website: "bot" })).toThrow();
});
it.each(["amount", "currency", "account", "identity", "redirect"])("rejects mismatched provider %s without posting money", async kind => {
  const { payment: p } = gift(); await refreshWebsitePayment(p.id); pay(p.id); const s = sessions.get(p.id)!;
  if (kind === "amount") s.amount_total = 1; if (kind === "currency") s.currency = "eur"; if (kind === "account") s.livemode = false; if (kind === "identity") s.metadata.shuug_payment = randomUUID(); if (kind === "redirect") s.url = "https://attacker.test/pay";
  await expect(refreshWebsitePayment(p.id)).rejects.toThrow(); expect(listBusinessRecords()).toHaveLength(0);
});
it("keeps unapplied captured payments durable and rolls back partial business records", async () => {
  const { payment: p } = gift(); await refreshWebsitePayment(p.id); pay(p.id);
  workspaceDatabase(db => { const p = getPayment(db, sessions.keys().next().value!)!; p.donor!.fund = randomUUID(); putPayment(db, p); }, true);
  const result = await refreshWebsitePayment(p.id); expect(result.status).toBe("paid_review"); expect(result.intentId).toBeTruthy(); expect(listBusinessRecords()).toHaveLength(0);
});
it("verifies raw webhook signatures with time tolerance and queues before applying", async () => {
  const { payment: p } = gift(); await refreshWebsitePayment(p.id); pay(p.id); const event = { id: "evt_fixture", type: "checkout.session.completed", livemode: true, data: { object: sessions.get(p.id) } }, raw = Buffer.from(JSON.stringify(event)), timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex")}`;
  expect(verifyStripeWebhook(raw, signature, secret)).toBe(true); expect(verifyStripeWebhook(Buffer.from("{}"), signature, secret)).toBe(false); expect(verifyStripeWebhook(raw, signature, secret, Date.now() + 360000)).toBe(false);
  const r = await webhook(new Request(`${base}/api/website/stripe/webhook`, { method: "POST", headers: { "stripe-signature": signature }, body: raw })); expect(r.status).toBe(202); expect(listBusinessRecords()).toHaveLength(0);
  queueStripeEvent(event); expect(workspaceDatabase(db => db.prepare("SELECT * FROM website_payment_events").all())).toHaveLength(1); await processWebsitePayments(); expect(listBusinessRecords(["gift_payment"])).toHaveLength(1);
  expect((await webhook(new Request(`${base}/api/website/stripe/webhook`, { method: "POST", headers: { "stripe-signature": "invalid" }, body: raw }))).status).toBe(400);
});
it("serves working donation and invoice forms while denying foreign origins", async () => {
  expect((await donateGet(new Request(`${base}/api/website/donate`)).text())).toContain("Continue to Stripe Checkout");
  const donation = await donatePost(formRequest("/api/website/donate", { action: "donate", proof: donationProof(), name: "Donor", email: "donor@example.test", amount: "25.01", consent: "yes", website: "" })); expect(donation.status).toBe(303); expect(donation.headers.get("location")).toContain("https://checkout.stripe.com/");
  expect((await donatePost(formRequest("/api/website/donate", {}, { Origin: "https://attacker.test" }))).status).toBe(403);
  const { invoice, token } = invoiceFixture(); const checkout = await customerPost(formRequest("/api/website/customer", { action: "payment.start", invoice: invoice.id }, { Cookie: `shuug_customer=${token}` })); expect(checkout.status).toBe(303);
  const manifest = await (await capabilities()).json(); expect(manifest.capabilities.map((c: { id: string }) => c.id)).toContain("pay_invoice"); expect(manifest.capabilities.map((c: { id: string }) => c.id)).toContain("donations");
});

it("keeps Stripe test payments out of real financial records", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_syntheticfixture"); const { payment: p } = gift(); await refreshWebsitePayment(p.id); pay(p.id); expect((await refreshWebsitePayment(p.id)).status).toBe("test_paid"); expect(listBusinessRecords()).toHaveLength(0);
});
