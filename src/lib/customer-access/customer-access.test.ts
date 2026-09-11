// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createLinkedCustomer, customerView, customerSettings, saveCustomerSettings, previewCustomerOrder, submitCustomerOrder } from "./service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, customerSession, changeCustomerPassword, setCustomerEnabled, signOutCustomer, listCustomerAccounts, customerCookie } from "./accounts";
import { getDealStore } from "../data/store";
import { workspaceDatabase } from "../workspace/database";
import { saveBusinessRecord, transitionBusinessRecord, acceptCustomerRecord, listBusinessRecords, publishAppointmentOffer, bookCustomerAppointment, cancelCustomerAppointment, customerAppointmentOffers, withdrawAppointmentOffer } from "../workspace/store";
import { configureOwnerPassword, signInOwner } from "../auth/owner-session";
import { sessionIdentity } from "../auth/identity";
import { POST, GET } from "@/app/api/website/customer/route";
import { POST as adminCommand } from "@/app/api/setup/customers/route";
import { GET as capabilities } from "@/app/api/website/capabilities/route";
import type { CustomerAccount } from "./accounts";
import { ship } from "../ops/store";
vi.mock("../auth/identity", async (original) => ({ ...await original(), requireOwnerAccess: vi.fn(async () => ({ id: "owner" })) }));
import { requireOwnerAccess } from "../auth/identity";
let folder: string, a: CustomerAccount, b: CustomerAccount, tokenA: string, tokenB: string;
const base = "https://business.example.test", password = "synthetic-customer-password";
beforeEach(async () => {
  folder = mkdtempSync(`${tmpdir()}/shuug-customers-`); vi.stubEnv("DEALDESK_DATA_DIR", folder); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("APP_BASE_URL", base); vi.mocked(requireOwnerAccess).mockResolvedValue({ id: "owner" } as never);
  saveCustomerSettings({ enabled: true, pricing: true, ordering: true, orderStatus: true, servicePortal: true });
  const store = await getDealStore();
  async function create(name: string, price: number) {
    const deal = await store.createCustomer({ company: name, channel: "wholesale_bulk", buyerName: name, buyerEmail: `${name}@example.test`, website: null, accountOwner: "Private staff", region: "", billingAddress: "Private billing address", shippingAddress: "", quickbooksCustomerId: "PRIVATE-QBO-ID", requiresPO: true });
    deal.agreement.minCasesPerOrder = 1; deal.agreement.minOrderDollarsCents = 1; deal.agreement.freight = { kind: "included" };
    deal.agreement.lines = [{ ...deal.agreement.lines[0], unitPriceCents: price, tiers: [{ minQty: 1, maxQty: null, unitPriceCents: price }] }];
    await store.saveAgreement({ agreement: deal.agreement, changedBy: "owner", note: "Private pricing rationale" });
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.test` } }, "owner");
    const account = await createLinkedCustomer({ name, email: `${name}@example.test`, customerId: deal.customer.id, clientId: client.id }); acceptCustomerInvitation(issueCustomerInvitation(account.id), password); return account;
  }
  a = await create("Alice", 1200); b = await create("Bob", 3400); tokenA = signInCustomer(a.email, password); tokenB = signInCustomer(b.email, password);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(folder, { recursive: true, force: true }); });
async function draft(token = tokenA) { const data = await customerView(token); return { lines: [{ skuId: data.catalog[0].id, quantity: 2, unit: "case" }], poNumber: "PO-1", note: "Customer instruction" }; }
function request(form: Record<string, string>, token = tokenA, origin = base) { return new Request(`${base}/api/website/customer`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", Cookie: `shuug_customer=${token}` }, body: new URLSearchParams(form) }); }
it("keeps customer and employee/owner sessions completely separate", () => {
  configureOwnerPassword(password); const owner = signInOwner(password);
  expect(sessionIdentity(tokenA)).toBeNull(); expect(customerSession(owner)).toBeNull(); expect(customerSession(tokenA)?.id).toBe(a.id);
  const raw = workspaceDatabase(db => db.prepare("SELECT * FROM customer_sessions").all()); expect(JSON.stringify(raw)).not.toContain(tokenA); expect(JSON.stringify(listCustomerAccounts())).not.toContain("scrypt");
  expect(customerCookie(tokenA, true)).toContain("HttpOnly; SameSite=Lax"); expect(customerCookie(tokenA, true)).toContain("Path=/api/website/customer"); expect(customerCookie(tokenA, true)).toContain("Secure");
});
it("enforces setup link expiry, one use, password reset and immediate revocation", () => {
  const invite = issueCustomerInvitation(a.id); expect(customerSession(tokenA)).toBeNull(); acceptCustomerInvitation(invite, password); expect(() => acceptCustomerInvitation(invite, password)).toThrow("expired");
  const fresh = signInCustomer(a.email, password); changeCustomerPassword(fresh, password, `${password}-changed`); expect(customerSession(fresh)).toBeNull(); expect(() => signInCustomer(a.email, password)).toThrow("incorrect");
  const changed = signInCustomer(a.email, `${password}-changed`); setCustomerEnabled(a.id, false); expect(customerSession(changed)).toBeNull(); setCustomerEnabled(a.id, true); expect(() => signInCustomer(a.email, `${password}-changed`)).toThrow("incorrect");
  const expired = issueCustomerInvitation(a.id); vi.spyOn(Date, "now").mockReturnValue(Date.now() + 49 * 3600000); expect(() => acceptCustomerInvitation(expired, password)).toThrow("expired");
});
it("throttles failed sign-in and signs out without affecting another customer", () => {
  for (let i = 0; i < 8; i++) expect(() => signInCustomer("unknown@example.test", "bad")).toThrow("incorrect"); expect(() => signInCustomer("unknown@example.test", "bad")).toThrow("Too many");
  signOutCustomer(tokenA); expect(customerSession(tokenA)).toBeNull(); expect(customerSession(tokenB)?.id).toBe(b.id);
});
it("only exposes each customer's agreed prices and explicitly safe business fields", async () => {
  const alice = await customerView(tokenA), bob = await customerView(tokenB); expect(alice.catalog[0].priceCents).toBe(1200); expect(bob.catalog[0].priceCents).toBe(3400);
  for (const value of ["costPerCaseCents", "targetMarginFraction", "floorMarginFraction", "PRIVATE-QBO-ID", "Private pricing rationale", "Private billing address", "Bob"]) expect(JSON.stringify(alice)).not.toContain(value);
  const manifest = JSON.stringify(await (await capabilities()).json()); expect(manifest).toContain("customer_login"); expect(manifest).not.toContain(a.email); expect(manifest).not.toContain(a.id);
});
it("validates website orders, blocks price overrides and cross-account reviews, and prevents duplicate orders", async () => {
  const input = await draft();
  await expect(previewCustomerOrder(tokenA, { ...input, lines: [{ ...input.lines[0], overrideUnitPriceCents: 1 }] })).rejects.toThrow();
  await expect(previewCustomerOrder(tokenA, { ...input, lines: [input.lines[0], input.lines[0]] })).rejects.toThrow("one order line");
  await expect(previewCustomerOrder(tokenA, { ...input, poNumber: null })).rejects.toThrow("PO number");
  const quote = await previewCustomerOrder(tokenA, input); expect(quote.totalCents).toBe(2400); expect(JSON.stringify(quote)).not.toContain("costAtOrderCents");
  await expect(submitCustomerOrder(tokenB, quote.id)).rejects.toThrow("unavailable");
  const order = await submitCustomerOrder(tokenA, quote.id), retry = await submitCustomerOrder(tokenA, quote.id); expect(retry.id).toBe(order.id); expect(retry.duplicate).toBe(true);
  expect((await customerView(tokenA)).orders).toHaveLength(1); expect((await customerView(tokenB)).orders).toHaveLength(0); expect(JSON.stringify((await customerView(tokenA)).orders)).not.toContain("costAtOrderCents");
  workspaceDatabase(db => { db.prepare("UPDATE documents SET body=json_set(body,'$.inventory',json(?)) WHERE id='state:operations'").run(JSON.stringify([{ skuId: input.lines[0].skuId, onHandCases: 2, reorderPointCases: 0, targetDaysCover: 0, mfgCostPerCaseCents: 0 }])); }, true);
  ship({ kind: "order", refId: order.id, toCompany: a.name, lines: [{ skuId: input.lines[0].skuId, cases: 2 }], carrier: "Synthetic carrier", shippingCostCents: 12345 });
  const shipped = (await customerView(tokenA)).orders[0]; expect(shipped.fulfillment).toBe("shipped"); expect(shipped.shipments[0].carrier).toBe("Synthetic carrier"); expect(JSON.stringify(shipped)).not.toContain("12345");
});
it("rejects changed or expired agreements and preserves prices on orders already submitted", async () => {
  const input = await draft(), first = await previewCustomerOrder(tokenA, input); await submitCustomerOrder(tokenA, first.id);
  const stale = await previewCustomerOrder(tokenA, input), store = await getDealStore(), deal = (await store.getDeal(a.customerId!))!;
  deal.agreement.lines[0].unitPriceCents = 9999; deal.agreement.lines[0].tiers[0].unitPriceCents = 9999; await store.saveAgreement({ agreement: deal.agreement, changedBy: "owner", note: "New pricing" });
  await expect(submitCustomerOrder(tokenA, stale.id)).rejects.toThrow("agreement changed"); expect((await customerView(tokenA)).orders[0].totalCents).toBe(2400); expect((await customerView(tokenA)).catalog[0].priceCents).toBe(9999);
  deal.agreement.expirationDate = "2000-01-01"; await store.saveAgreement({ agreement: deal.agreement, changedBy: "owner", note: "Expired" }); await expect(previewCustomerOrder(tokenA, input)).rejects.toThrow("renewal");
});
it("scopes proposal acceptance to the linked client and records customer identity in the audit", () => {
  const create = (client: string) => { const r = saveBusinessRecord({ kind: "proposal", title: "Service proposal", fields: { client, scope: "Agreed work", exclusions: "Extra work", amount: 50000, expires: "2099-01-01" } }, "owner"); return transitionBusinessRecord({ id: r.id, revision: r.revision, target: "sent", commandId: randomUUID() }, "owner"); };
  const pa = create(a.clientId!), pb = create(b.clientId!);
  expect(() => acceptCustomerRecord(tokenA, { id: pb.id, revision: pb.revision, accepted: true })).toThrow("changed");
  acceptCustomerRecord(tokenA, { id: pa.id, revision: pa.revision, accepted: true }); const saved = listBusinessRecords(["proposal"]).find(r => r.id === pa.id)!;
  expect(saved.status).toBe("accepted"); expect(saved.fields.acceptedBy).toBe(a.name); expect(saved.fields.evidence).toContain(a.id);
});
it("protects customer HTTP actions against foreign origins and owner management against customer access", async () => {
  expect((await POST(request({ action: "logout" }, tokenA, "https://attacker.test"))).status).toBe(403); expect(customerSession(tokenA)).not.toBeNull();
  const html = await (await GET(new Request(`${base}/api/website/customer`, { headers: { Cookie: `shuug_customer=${tokenA}` } }))).text(); expect(html).toContain("Alice"); expect(html).not.toContain("Bob");
  const invalid = await POST(request({ action: "order.submit", quote: randomUUID(), accepted: "yes" })); expect(invalid.status).toBe(400);
  vi.mocked(requireOwnerAccess).mockRejectedValue(new Error("Forbidden"));
  expect((await adminCommand(new Request(`${base}/api/setup/customers`, { method: "POST", headers: { Cookie: `shuug_customer=${tokenA}`, Origin: base }, body: "{}" }))).status).toBe(403);
});
it("includes selected products beyond the first hundred catalog rows instead of silently dropping them", async () => {
  const input = await draft(); const response = await POST(request({ action: "order.preview", "sku.200": input.lines[0].skuId, "qty.200": "2", "unit.200": "case", poNumber: "PO-1", note: "" }));
  expect(response.status).toBe(200); expect(await response.text()).toContain("USD 24.00");
});
it("disables customer capabilities without changing employee login or exposing old sessions", async () => {
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: false });
  const data = await customerView(tokenA); expect(data.catalog).toEqual([]); expect(data.orders).toEqual([]); await expect(previewCustomerOrder(tokenA, { lines: [] })).rejects.toThrow("not enabled");
  saveCustomerSettings({ enabled: false, pricing: false, ordering: false, orderStatus: false, servicePortal: false }); expect((await GET(new Request(`${base}/api/website/customer`))).status).toBe(404);
});

function bookableJob(account: CustomerAccount, deposit = 0) {
  const proposal = saveBusinessRecord({ kind: "proposal", title: "Agreed scope", fields: { client: account.clientId, scope: "Repair equipment", exclusions: "Replacement", amount: 50000, expires: "2099-01-01", acceptedBy: account.name, evidence: "Synthetic acceptance" } }, "owner");
  const sent = transitionBusinessRecord({ id: proposal.id, revision: proposal.revision, target: "sent", commandId: randomUUID() }, "owner");
  transitionBusinessRecord({ id: sent.id, revision: sent.revision, target: "accepted", commandId: randomUUID() }, "owner");
  let agreement = saveBusinessRecord({ kind: "agreement", title: "Agreed repair", fields: { client: account.clientId, proposal: proposal.id, terms: "Synthetic terms", deposit, signedBy: account.name, evidence: "Synthetic signed agreement" } }, "owner");
  agreement = transitionBusinessRecord({ id: agreement.id, revision: agreement.revision, target: "signed", commandId: randomUUID() }, "owner");
  return saveBusinessRecord({ kind: "job", title: `${account.name} repair`, fields: { client: account.clientId, agreement: agreement.id, instructions: "Repair equipment", requiredChecks: "Verify repair", budget: 20000 } }, "owner");
}
function resource() { const r = saveBusinessRecord({ kind: "resource", title: "Technician", fields: { category: "staff", weeklyHours: 40 } }, "owner"); return transitionBusinessRecord({ id: r.id, revision: r.revision, target: "active", commandId: randomUUID() }, "owner"); }
function slot(jobId: string, resourceId: string) { const start = Date.now() + 3 * 86400000; return { jobId, resourceId, start: new Date(start).toISOString(), end: new Date(start + 3600000).toISOString(), buffer: 15 }; }
it("books published availability atomically, checks conflicts and records the appointment in the service workflow", async () => {
  saveCustomerSettings({ ...customerSettings(), booking: true });
  const ja = bookableJob(a), jb = bookableJob(b), staff = resource(), input = slot(ja.id, staff.id);
  const oa = publishAppointmentOffer(input, "owner"), ob = publishAppointmentOffer({ ...input, jobId: jb.id }, "owner");
  expect(customerAppointmentOffers(tokenA).map(o => o.id)).toEqual([oa.id]); expect(() => bookCustomerAppointment(tokenB, oa.id)).toThrow("unavailable");
  const booked = bookCustomerAppointment(tokenA, oa.id), retry = bookCustomerAppointment(tokenA, oa.id); expect(retry.id).toBe(booked.id); expect(retry.duplicate).toBe(true);
  expect(listBusinessRecords(["booking"])).toHaveLength(1); expect(listBusinessRecords(["job"]).find(j => j.id === ja.id)?.status).toBe("scheduled");
  expect((await customerView(tokenA)).appointments[0].status).toBe("scheduled"); expect(customerAppointmentOffers(tokenB)).toEqual([]);
  expect(() => bookCustomerAppointment(tokenB, ob.id)).toThrow("already booked"); expect(() => cancelCustomerAppointment(tokenB, booked.id)).toThrow("unavailable");
  cancelCustomerAppointment(tokenA, booked.id); expect(customerAppointmentOffers(tokenB).map(o => o.id)).toEqual([ob.id]); expect(bookCustomerAppointment(tokenB, ob.id).status).toBe("scheduled");
  expect(bookCustomerAppointment(tokenA, oa.id).status).toBe("cancelled");
});
it("requires agreed work and deposits and prevents withdrawn, late or disabled website booking", async () => {
  const staff = resource(), unpaid = bookableJob(a, 10000); expect(() => publishAppointmentOffer(slot(unpaid.id, staff.id), "owner")).toThrow("deposit");
  const job = bookableJob(b), offer = publishAppointmentOffer(slot(job.id, staff.id), "owner"); withdrawAppointmentOffer(offer.id); expect(() => bookCustomerAppointment(tokenB, offer.id)).toThrow("no longer");
  const another = publishAppointmentOffer(slot(job.id, staff.id), "owner");
  expect((await POST(request({ action: "booking.book", id: another.id, accepted: "yes" }, tokenB))).status).toBe(400);
  saveCustomerSettings({ ...customerSettings(), booking: true });
  expect((await POST(request({ action: "booking.book", id: another.id }, tokenB))).status).toBe(400);
  const now = Date.parse(another.start) + 1; vi.spyOn(Date, "now").mockReturnValue(now); expect(() => bookCustomerAppointment(tokenB, another.id)).toThrow();
});
