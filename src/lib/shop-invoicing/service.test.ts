// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { saveBusinessRecord as save, transitionBusinessRecord, listBusinessRecords } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { type BusinessRecord, paymentTotal } from "../workspace/model";
import { addRecord } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { changePricingBook } from "../auto-repair/library";
import { reviewRepairEstimate, createRepairEstimate } from "../auto-repair/service";
import { serviceLedgerData } from "../accounting/service-posting";
import { billingDocuments } from "../accounting/billing-store";
import { standardAccounts } from "../accounting/account-model";
import { issueAcceptedShopInvoice, processShopInvoices, saveShopInvoiceSettings, shopInvoiceSettings } from "./service";
import { createShopInvoiceGrantInDatabase, revokeShopInvoiceGrant, reserveShopInvoicePayment, shopInvoicePayment, shopInvoiceView } from "./invoice-link";
import { saveSecrets } from "../connections/vault";
import { saveWebsitePaymentSettings, websitePaymentSettings } from "../website-payments/settings";
import { refreshWebsitePayment } from "../website-payments/service";
import type { WorkspaceUser } from "../auth/identity";
import { GET as invoiceGet, POST as invoicePost } from "@/app/api/shop-invoicing/invoice/[token]/route";
import { saveShopSettings, shopSettings } from "../shop-automation/settings";

let directory: string;
const today = "2026-11-12", actor = { id: "workspace-owner", name: "Synthetic owner" };
const owner: WorkspaceUser = { ...actor, memberId: "owner", email: "", role: "Owner", isOwner: true };
const create = (kind: string, fields: BusinessRecord["fields"], title = kind) => save({ kind, fields, title }, actor.id);
const go = (record: BusinessRecord, target: string) => transitionBusinessRecord({ id: record.id, revision: record.revision, target, commandId: randomUUID() }, actor.id);
const edit = (record: BusinessRecord, patch: BusinessRecord["fields"]) => save({ id: record.id, revision: record.revision, kind: record.kind, title: record.title, currency: record.currency, fields: { ...record.fields, ...patch } }, actor.id);
const settings = (patch = {}) => saveShopInvoiceSettings({ ...shopInvoiceSettings(), enabled: true, emailOnIssue: false, reviewed: true, ...patch }, owner);
const automation = (enabled = true) => {
  const { updatedAt: _at, updatedBy: _by, ...current } = shopSettings();
  return saveShopSettings({ ...current, enabled, reviewed: true }, owner.id);
};
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-shop-invoice-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
  vi.stubEnv("APP_BASE_URL", "https://shop.example.invalid"); vi.stubEnv("STRIPE_SECRET_KEY", ""); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(`${today}T12:00:00Z`);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected provider request."); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
function fixture(deposit = 0) {
  const client = create("client", { email: "sample@example.invalid", notes: "PRIVATE CUSTOMER NOTE" });
  const vehicle = addRecord("vehicles", moduleById("vehicles")!.fields, { customer_id: client.id, vin: "DEMO-NOT-A-REAL-VIN", make: "Demo", model: "Car", year: 2020 });
  const book = changePricingBook("book.save", { requestId: randomUUID(), shareInTemplates: false, definition: { name: `Synthetic reviewed pricing ${client.id.slice(0, 8)}`, version: 1, currency: "USD", effectiveFrom: today, effectiveTo: null,
    labor: [], parts: [{ category: "Parts", bands: [{ fromCost: 0, untilCost: null, markupBasisPoints: 0 }] }] } }, actor);
  changePricingBook("book.publish", { requestId: randomUUID(), id: book.id, revision: 1, reviewed: true, review: "Synthetic owner reviewed pricing" }, actor);
  const review = reviewRepairEstimate({ bookId: book.id, vehicleId: vehicle.id, title: "Reviewed repair", scope: "Replace agreed parts", exclusions: "No additional work", expires: today,
    labor: [], parts: [{ category: "Parts", description: "Agreed repair parts", unitCost: 10000, quantity: 1 }], laborTaxBasisPoints: 0, partsTaxBasisPoints: 625, taxReviewed: true, taxReview: "PRIVATE REVIEW: supplied synthetic rate" }, actor);
  const result = createRepairEstimate({ requestId: randomUUID(), proof: review.proof, reviewed: true }, actor);
  let proposal = listBusinessRecords(["proposal"]).find(r => r.id === result.id)!;
  proposal = edit(proposal, { acceptedBy: "Synthetic customer", evidence: "Explicit customer approval" }); proposal = go(go(proposal, "sent"), "accepted");
  const agreement = go(create("agreement", { client: client.id, proposal: proposal.id, terms: "Agreed terms", deposit, signedBy: "Synthetic customer", evidence: "Explicit signature" }), "signed");
  let job = create("job", { client: client.id, agreement: agreement.id, instructions: "Agreed repair", requiredChecks: "Safety check", budget: 0 });
  if (deposit) {
    const invoice = go(create("invoice", { job: job.id, method: "deposit", amount: deposit, issuedOn: today, description: "Agreed deposit" }), "issued");
    go(create("service_payment", { invoice: invoice.id, amount: deposit, direction: "receipt", reference: "SYNTHETIC-DEPOSIT", paidOn: today, evidence: "Recorded external deposit evidence" }), "confirmed");
  }
  const resource = go(create("resource", { category: "equipment", weeklyHours: 40 }), "active");
  go(create("booking", { job: job.id, resource: resource.id, start: `${today}T14:00:00Z`, end: `${today}T15:00:00Z` }), "scheduled");
  job = go(go(job, "scheduled"), "in_progress");
  job = edit(job, { completedChecks: "Safety check", evidence: "Recorded checks and customer completion approval", acceptedBy: "Synthetic customer" });
  job = go(go(job, "completed"), "accepted");
  return { client, job, proposal };
}
const invoice = (id: string) => listBusinessRecords(["invoice"]).find(r => r.id === id)!;
const grant = (id: string) => { const record = invoice(id); return workspaceDatabase(db => createShopInvoiceGrantInDatabase(db, record, 30), true); };
const token = (url: string) => new URL(url).pathname.split("/").at(-1)!;

it("issues one canonical invoice with exact reviewed tax and one office AR posting", () => {
  const { job } = fixture(), requestId = randomUUID(); settings({ emailOnIssue: true });
  const result = issueAcceptedShopInvoice({ jobId: job.id, jobRevision: job.revision, requestId }, actor.id);
  expect(issueAcceptedShopInvoice({ jobId: job.id, jobRevision: job.revision, requestId }, actor.id)).toEqual(result);
  expect(issueAcceptedShopInvoice({ jobId: job.id }, actor.id).invoiceId).toBe(result.invoiceId);
  expect(processShopInvoices()).toEqual([]); expect(listBusinessRecords(["invoice"])).toHaveLength(1);
  const entry = serviceLedgerData().entries[0];
  expect(entry.lines).toEqual([{ accountNumber: 1200, debitCents: 10625, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 10000 }, { accountNumber: 2200, debitCents: 0, creditCents: 625 }]);
  expect(invoice(result.invoiceId).computed?.reviewedTaxSnapshot).toMatchObject({ subtotal: 10000, tax: 625, total: 10625 });
  expect(billingDocuments("office")).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  const stored = workspaceDatabase(db => JSON.stringify(db.prepare("SELECT body FROM documents WHERE kind IN ('shop-invoice-grant','communication-message','shop-invoice-job') UNION ALL SELECT snapshot AS body FROM audit").all()));
  expect(stored).not.toContain("/api/shop-invoicing/invoice/"); expect(stored).not.toContain("sample@example.invalid\n");
});

it("holds drafts, unaccepted work, unreviewed pricing and scope changes without posting", () => {
  const { job } = fixture();
  expect(processShopInvoices()).toEqual([]); settings(); automation();
  const draft = create("invoice", { job: job.id, method: "fixed", amount: 10625, description: "Human draft" });
  expect(processShopInvoices()[0]).toMatchObject({ status: "review" }); expect(serviceLedgerData().entries).toHaveLength(0);
  go(draft, "void");
  go(go(create("change", { job: job.id, scope: "Added work", amount: 100, scheduleImpact: "None", acceptedBy: "Customer", evidence: "Customer approved changed scope" }), "submitted"), "approved");
  expect(() => issueAcceptedShopInvoice({ jobId: job.id }, actor.id)).toThrow(/allocated|scope changes/);
  expect(serviceLedgerData().entries).toHaveLength(0);
});

it("uses exact deposit liability once and does not duplicate tax on the final invoice", () => {
  const { job } = fixture(1000), result = issueAcceptedShopInvoice({ jobId: job.id }, actor.id), final = invoice(result.invoiceId);
  expect(final.fields.amount).toBe(9625);
  expect(serviceLedgerData().entries.at(-1)!.lines).toEqual([{ accountNumber: 1200, debitCents: 9625, creditCents: 0 }, { accountNumber: 2100, debitCents: 1000, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 10000 }, { accountNumber: 2200, debitCents: 0, creditCents: 625 }]);
  const credit = create("service_payment", { invoice: final.id, direction: "credit", amount: 1, reference: "SYNTHETIC-CREDIT", paidOn: today, evidence: "Review required" });
  expect(() => go(credit, "confirmed")).toThrow(/deposit-applied/);
});

it("allocates partial credits cumulatively and never reverses reviewed tax twice", () => {
  const { job } = fixture(), result = issueAcceptedShopInvoice({ jobId: job.id }, actor.id);
  for (const [index, amount] of [1, 4999, 5625].entries()) go(create("service_payment", { invoice: result.invoiceId, direction: "credit", amount, reference: `SYNTHETIC-CREDIT-${index}`, paidOn: today, evidence: "Approved synthetic correction" }), "confirmed");
  const lines = serviceLedgerData().entries.flatMap(e => e.lines);
  expect(lines.filter(l => l.accountNumber === 2200).reduce((n, l) => n + l.creditCents - l.debitCents, 0)).toBe(0);
  expect(lines.filter(l => l.accountNumber === 4000).reduce((n, l) => n + l.creditCents - l.debitCents, 0)).toBe(0);
  expect(paymentTotal(listBusinessRecords(), "service_payment", "invoice", result.invoiceId)).toBe(10625);
});

it("rolls back future dates, closed periods and a failed atomic outbox reservation", () => {
  const { job } = fixture();
  const future = create("invoice", { job: job.id, method: "fixed", amount: 10625, description: "Future issue", issuedOn: "2099-01-01" });
  expect(() => go(future, "issued")).toThrow(/future/); expect(invoice(future.id).status).toBe("draft"); go(future, "void");
  workspaceDatabase(db => db.prepare("INSERT INTO documents VALUES('accounting-periods:office','accounting-periods',?)").run(JSON.stringify({ active: { through: today }, history: [] })), true);
  expect(() => issueAcceptedShopInvoice({ jobId: job.id }, actor.id)).toThrow(/closed/);
  workspaceDatabase(db => db.prepare("DELETE FROM documents WHERE id='accounting-periods:office'").run(), true);
  settings({ emailOnIssue: true }); vi.stubEnv("APP_BASE_URL", "http://public.example.invalid");
  expect(() => issueAcceptedShopInvoice({ jobId: job.id }, actor.id)).toThrow(/HTTPS/);
  expect(listBusinessRecords(["invoice"]).filter(r => r.status === "issued")).toHaveLength(0); expect(serviceLedgerData().entries).toHaveLength(0);
});

it("keeps private links scoped, revocable and free of internal pricing or tokens at rest", () => {
  const { job } = fixture(), result = issueAcceptedShopInvoice({ jobId: job.id }, actor.id), link = grant(result.invoiceId), key = token(link.url);
  expect(shopInvoiceView(key)).toMatchObject({ amount: 10625, subtotal: 10000, tax: 625, outstanding: 10625, canPay: false });
  for (const hidden of ["PRIVATE", "unitCost", "markupBasisPoints", "taxReview"]) expect(JSON.stringify(shopInvoiceView(key))).not.toContain(hidden);
  expect(workspaceDatabase(db => JSON.stringify(db.prepare("SELECT body FROM documents WHERE kind='shop-invoice-grant'").all()))).not.toContain(key);
  expect(() => reserveShopInvoicePayment(key)).toThrow(/not connected/); expect(fetch).not.toHaveBeenCalled();
  revokeShopInvoiceGrant(link.id); expect(() => shopInvoiceView(key)).toThrow(/expired|revoked/);
});

it("serves the scoped invoice and rejects foreign-origin, oversized or unconfigured payment actions", async () => {
  const { job } = fixture(), result = issueAcceptedShopInvoice({ jobId: job.id }, actor.id), link = grant(result.invoiceId), key = token(link.url), context = { params: Promise.resolve({ token: key }) };
  const response = await invoiceGet(new Request(link.url), context), html = await response.text();
  expect(response.status).toBe(200); expect(html).toContain("Tax USD 6.25");
  for (const hidden of ["PRIVATE", "unitCost", "markupBasisPoints", "taxReview"]) expect(html).not.toContain(hidden);
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'self' https://checkout.stripe.com;");
  const request = (origin: string, body: string) => new Request(link.url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body });
  expect((await invoicePost(request("https://attacker.example.invalid", "action=pay"), context)).status).toBe(403);
  expect((await invoicePost(request("https://shop.example.invalid", `action=pay&x=${"x".repeat(3000)}`), context)).status).toBe(400);
  expect((await invoicePost(request("https://shop.example.invalid", "action=pay"), context)).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects future payment dates and keeps failed credits out of accounting", () => {
  const { job } = fixture(), result = issueAcceptedShopInvoice({ jobId: job.id }, actor.id);
  const future = create("service_payment", { invoice: result.invoiceId, direction: "receipt", amount: 100, reference: "SYNTHETIC-FUTURE", paidOn: "2099-01-01", evidence: "Future receipt is not a real received payment" });
  expect(() => go(future, "confirmed")).toThrow(/future/);
  expect(listBusinessRecords(["service_payment"])[0].status).toBe("draft"); expect(serviceLedgerData().entries).toHaveLength(1);
});

it.each([false, true])("uses native Stripe verification and posts exactly one %s-mode service receipt", async live => {
  const { job } = fixture(), result = issueAcceptedShopInvoice({ jobId: job.id }, actor.id), key = token(grant(result.invoiceId).url);
  saveSecrets({ STRIPE_SECRET_KEY: `sk_${live ? "live" : "test"}_synthetic123`, STRIPE_WEBHOOK_SECRET: "whsec_synthetic" });
  saveWebsitePaymentSettings({ ...websitePaymentSettings(), invoiceEnabled: true });
  const reserved = reserveShopInvoicePayment(key); expect(reserveShopInvoicePayment(key).id).toBe(reserved.id);
  expect(reserved.parameters).not.toContain(key);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "cs_synthetic123", object: "checkout.session", mode: "payment", client_reference_id: reserved.id,
    amount_total: 10625, currency: "usd", livemode: live, metadata: { shuug_payment: reserved.id }, status: "complete", payment_status: "paid", payment_intent: "pi_synthetic123", url: null })));
  await Promise.all([refreshWebsitePayment(reserved.id), refreshWebsitePayment(reserved.id)]);
  expect(shopInvoicePayment(key, reserved.id).status).toBe(live ? "paid" : "test_paid");
  expect(listBusinessRecords(["service_payment"])).toHaveLength(live ? 1 : 0);
  expect(serviceLedgerData().entries).toHaveLength(live ? 2 : 1);
  expect(shopInvoiceView(key).outstanding).toBe(live ? 0 : 10625);
});

it("enforces owner settings revisions and preserves unrelated workspaces", () => {
  expect(() => saveShopInvoiceSettings({ ...shopInvoiceSettings(), reviewed: true }, { ...owner, isOwner: false })).toThrow(/owner/);
  const old = shopInvoiceSettings(); settings(); expect(() => saveShopInvoiceSettings({ ...old, reviewed: true }, owner)).toThrow(/changed/);
  workspaceDatabase(db => db.prepare("INSERT INTO documents VALUES('state:manual-journal','state',?)").run(JSON.stringify({ entries: [], commands: {}, audit: [], accounts: standardAccounts().map(a => a.number === 2200 ? { ...a, active: false } : a) })), true);
  const { job } = fixture(); expect(() => issueAcceptedShopInvoice({ jobId: job.id }, actor.id)).toThrow(/inactive/);
  expect(serviceLedgerData().entries).toHaveLength(0);
});

it("pauses automatic financial posting through both global switches and preserves explicit manual issue", () => {
  const { job } = fixture(); settings(); automation(false);
  expect(processShopInvoices()).toEqual([]); expect(serviceLedgerData().entries).toHaveLength(0);
  automation(); saveSecrets({ SHOP_AUTOMATION_ENABLED: "false" });
  expect(processShopInvoices()).toEqual([]); expect(serviceLedgerData().entries).toHaveLength(0);
  saveSecrets({ SHOP_AUTOMATION_ENABLED: "true" });
  expect(processShopInvoices()).toMatchObject([{ jobId: job.id, status: "issued" }]);
  expect(processShopInvoices()).toEqual([]); expect(serviceLedgerData().entries).toHaveLength(1);
  automation(false); const another = fixture();
  expect(issueAcceptedShopInvoice({ jobId: another.job.id }, owner.id).status).toBe("issued");
  expect(serviceLedgerData().entries).toHaveLength(2);
});

it("uses the shop's calendar day and due date near UTC midnight", () => {
  const { job } = fixture(); settings({ dueDays: 7 });
  vi.setSystemTime("2026-11-13T02:30:00Z"); // Still November 12 in Windsor Locks.
  const result = issueAcceptedShopInvoice({ jobId: job.id }, owner.id);
  expect(invoice(result.invoiceId).fields).toMatchObject({ issuedOn: "2026-11-12", due: "2026-11-19" });
  expect(serviceLedgerData().entries[0].date).toBe("2026-11-12");
});

it("processes unreviewed eligible jobs before a slow, aged review backlog", () => {
  const held = fixture(); settings(); automation();
  create("invoice", { job: held.job.id, method: "fixed", amount: 10625, description: "Human draft needs review" });
  expect(processShopInvoices(1)).toMatchObject([{ jobId: held.job.id, status: "review" }]);
  vi.setSystemTime(Date.now() + 61000);
  const eligible = fixture();
  expect(processShopInvoices(1)).toMatchObject([{ jobId: eligible.job.id, status: "issued" }]);
  expect(serviceLedgerData().entries).toHaveLength(1);
  expect(processShopInvoices(1)).toMatchObject([{ jobId: held.job.id, status: "review" }]);
});
