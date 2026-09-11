// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fixturePricing, fixtureEstimate } from "./fixture";
import { validatePricingDefinition } from "./model";
import { changePricingBook, importPricingDefinitions } from "./library";
import { reviewRepairEstimate, createRepairEstimate, repairWorkspace } from "./service";
import { addRecord, updateRecord, setArchived } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { listBusinessRecords, saveBusinessRecord as save, transitionBusinessRecord, recordHistory, acceptPortalRecord } from "../workspace/store";
import type { BusinessRecord, FieldValue } from "../workspace/model";
import { paymentTotal } from "../workspace/model";
import { createPortalGrant, portalView } from "../workspace/portal";
import { exportBusinessTemplate, importBusinessTemplate, previewBusinessTemplate } from "../branding/templates";
let dir: string, client: BusinessRecord, vehicle: ReturnType<typeof addRecord>, bookId: string;
const actor = { id: "repair-owner", name: "Fixture owner" }, today = "2026-09-21";
const book = () => repairWorkspace().books.find(b => b.id === bookId)!;
const input = () => fixtureEstimate(bookId, vehicle.id, today);
const publish = () => changePricingBook("book.publish", { requestId: randomUUID(), id: bookId, revision: book().revision, reviewed: true, review: "Reviewed fixture terms" }, actor);
const review = () => reviewRepairEstimate(input(), actor);
const apply = (proof: string, requestId = randomUUID()) => createRepairEstimate({ proof, requestId, reviewed: true }, actor);
const create = (kind: string, fields: Record<string, FieldValue>) => save({ kind, title: kind, currency: "USD", fields }, actor.name);
const go = (r: BusinessRecord, target: string) => transitionBusinessRecord({ id: r.id, revision: r.revision, target, commandId: randomUUID() }, actor.name);
const edit = (r: BusinessRecord, fields: Record<string, FieldValue>) => save({ id: r.id, revision: r.revision, kind: r.kind, title: r.title, currency: r.currency, fields: { ...r.fields, ...fields } }, actor.name);
beforeEach(() => {
  dir = mkdtempSync(`${tmpdir()}/shuug-repair-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(`${today}T12:00:00Z`));
  client = create("client", { email: "repair@example.test", notes: "PRIVATE client notes" }); vehicle = addRecord("vehicles", moduleById("vehicles")!.fields, { customer_id: client.id, vin: "1HGCM82633A004352", make: "Honda", model: "Accord", year: 2003, notes: "PRIVATE vehicle notes" });
  bookId = changePricingBook("book.save", { requestId: randomUUID(), definition: fixturePricing(today), shareInTemplates: false }, actor).id;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("bills minimum time and increments, rounds selling price per unit, and taxes the parts subtotal", () => {
  publish(); const r = review(); expect(r.quote.labor[0]).toMatchObject({ requestedMinutes: 31, billedMinutes: 45, amount: 9259 }); expect(r.quote.parts[0]).toMatchObject({ unitCost: 101, unitPrice: 152, quantity: 3, amount: 456 }); expect(r.quote).toMatchObject({ subtotal: 9715, laborTax: 0, partsTax: 29, tax: 29, total: 9744 });
  expect(reviewRepairEstimate({ ...input(), labor: [{ ...input().labor[0], minutes: 1 }] }, actor).quote.labor[0]).toMatchObject({ billedMinutes: 30, amount: 6173 }); expect(listBusinessRecords(["proposal"])).toHaveLength(0);
});
it("uses the next markup band exactly at the boundary and supports parts-only work", () => { publish(); const quote = reviewRepairEstimate({ ...input(), labor: [], parts: [{ ...input().parts[0], unitCost: 10000, quantity: 1 }] }, actor).quote; expect(quote.parts[0]).toMatchObject({ markupBasisPoints: 2500, unitPrice: 12500 }); expect(quote).toMatchObject({ laborSubtotal: 0, partsTax: 781, total: 13281 }); });
it.each(["gap", "overlap", "no-unlimited", "duplicate", "negative", "bad-date"])("rejects invalid reusable pricing definitions: %s", issue => {
  const d = fixturePricing(today); if (issue === "gap") d.parts[0].bands[1].fromCost = 10001; if (issue === "overlap") d.parts[0].bands[1].fromCost = 9999; if (issue === "no-unlimited") d.parts[0].bands[1].untilCost = 20000; if (issue === "duplicate") d.labor.push({ ...d.labor[0], category: "mechanical" }); if (issue === "negative") d.labor[0].hourlyRate = -1; if (issue === "bad-date") d.effectiveTo = "2026-09-20";
  expect(() => validatePricingDefinition(d)).toThrow(); expect(() => importPricingDefinitions([d])).toThrow(); expect(repairWorkspace().books).toHaveLength(1);
});
it("requires publication and effective dates and blocks unknown categories or empty work", () => {
  expect(() => review()).toThrow("published"); publish(); expect(() => reviewRepairEstimate({ ...input(), labor: [], parts: [] }, actor)).toThrow("Add labor"); expect(() => reviewRepairEstimate({ ...input(), labor: [{ ...input().labor[0], category: "Unknown" }] }, actor)).toThrow("category"); expect(() => reviewRepairEstimate({ ...input(), expires: "2099-01-01" }, actor)).toThrow("expiry");
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z")); expect(() => review()).toThrow("effective");
});
it("preserves published terms, enforces revisions, retires pricing and records the actor", () => {
  publish(); expect(() => changePricingBook("book.save", { requestId: randomUUID(), id: bookId, revision: 2, definition: fixturePricing(today), shareInTemplates: false }, actor)).toThrow("preserved"); expect(() => changePricingBook("book.retire", { requestId: randomUUID(), id: bookId, revision: 1, reviewed: true, review: "Retired fixture" }, actor)).toThrow("changed");
  changePricingBook("book.retire", { requestId: randomUUID(), id: bookId, revision: 2, reviewed: true, review: "Retired fixture" }, actor); expect(() => review()).toThrow("published"); expect(recordHistory(bookId)[0]).toMatchObject({ actor: "Fixture owner (repair-owner)", action: "book.retire" });
});
it("rejects a changed vehicle, even when it is edited back, and refuses archived or unlinked vehicles", () => {
  publish(); const r = review(); updateRecord("vehicles", vehicle.id, moduleById("vehicles")!.fields, { ...vehicle.values, odometer: 50 }); updateRecord("vehicles", vehicle.id, moduleById("vehicles")!.fields, vehicle.values); expect(() => apply(r.proof)).toThrow("changed during review"); setArchived("vehicles", vehicle.id, true); expect(() => review()).toThrow("active vehicle"); setArchived("vehicles", vehicle.id, false); updateRecord("vehicles", vehicle.id, moduleById("vehicles")!.fields, { ...vehicle.values, customer_id: "missing" }); expect(() => review()).toThrow("existing service client");
});
it.each(["client", "pricing"])("rejects stale %s review without creating a proposal", which => { publish(); const r = review(); if (which === "client") edit(client, { notes: "Changed" }); else changePricingBook("book.share", { requestId: randomUUID(), id: bookId, revision: book().revision, shareInTemplates: true }, actor); expect(() => apply(r.proof)).toThrow("changed during review"); expect(listBusinessRecords(["proposal"])).toHaveLength(0); });
it("binds proof to the actor and reviewed inputs and rejects tampering and an expired unused review", () => {
  publish(); const r = review(); expect(() => createRepairEstimate({ proof: r.proof, requestId: randomUUID(), reviewed: true }, { ...actor, id: "other" })).toThrow("another user"); expect(() => apply("a".repeat(50))).toThrow("invalid"); expect(() => createRepairEstimate({ proof: r.proof, requestId: randomUUID(), reviewed: false }, actor)).toThrow(); vi.setSystemTime(new Date(`${today}T12:16:00Z`)); expect(() => apply(r.proof)).toThrow("expired");
});
it("creates one proposal per review across new request IDs, exact retries and equivalent proof encodings", () => {
  publish(); const r = review(), requestId = randomUUID(), result = apply(r.proof, requestId); expect(apply(r.proof, requestId)).toEqual(result); expect(apply(r.proof)).toEqual(result); expect(apply(Buffer.from(r.proof, "base64url").toString("base64"))).toEqual(result); vi.setSystemTime(new Date(`${today}T12:16:00Z`)); expect(apply(r.proof, requestId)).toEqual(result); expect(listBusinessRecords(["proposal"])).toHaveLength(1); expect(recordHistory(result.id)).toHaveLength(1); expect(() => apply(r.proof + "=", requestId)).toThrow("different action");
});
it("locks the reviewed proposal scope and amount while retaining normal proposals and customer approval", () => {
  publish(); const result = apply(review().proof); let proposal = listBusinessRecords(["proposal"]).find(r => r.id === result.id)!;
  expect(() => edit(proposal, { amount: 1 })).toThrow("preserved"); expect(() => edit(proposal, { scope: "Different work" })).toThrow("preserved"); proposal = edit(proposal, { evidence: "Owner review", acceptedBy: "Customer" }); expect(proposal.computed?.repairEstimate).toBeTruthy(); expect(go(go(proposal, "sent"), "accepted").fields.amount).toBe(9744);
  const normal = create("proposal", { client: client.id, scope: "Other work", exclusions: "None", expires: today, amount: 100 }); expect(edit(normal, { amount: 200 }).fields.amount).toBe(200);
});
it("runs a private customer approval, completed job, exact fixed invoice and reconciled payment", () => {
  publish(); const created = apply(review().proof); let proposal = go(listBusinessRecords(["proposal"]).find(r => r.id === created.id)!, "sent");
  const grant = createPortalGrant(client.id), customer = portalView(grant.token), serialized = JSON.stringify(customer); expect(customer.proposals[0].scope).toContain("USD 1.52 each"); for (const text of ["PRIVATE", "unitCost", "markupBasisPoints", "fingerprints", "taxReview", "repairEstimate"]) expect(serialized).not.toContain(text);
  acceptPortalRecord(grant.token, { id: proposal.id, revision: proposal.revision, name: "Fixture customer", accepted: true }); proposal = listBusinessRecords(["proposal"]).find(r => r.id === proposal.id)!; expect(proposal.computed?.repairEstimate).toBeTruthy();
  const agreement = go(create("agreement", { client: client.id, proposal: proposal.id, terms: "Payment on completion", deposit: 0, signedBy: "Fixture customer", evidence: "Signed terms" }), "signed"); let job = create("job", { client: client.id, agreement: agreement.id, instructions: "Replace pads", requiredChecks: "Brake check", budget: 5000 }); const technician = go(create("resource", { category: "staff", weeklyHours: 40 }), "active"); go(create("booking", { job: job.id, resource: technician.id, start: `${today}T13:00:00Z`, end: `${today}T14:00:00Z` }), "scheduled"); job = go(go(job, "scheduled"), "in_progress"); job = edit(job, { completedChecks: "Brake check", evidence: "Recorded checks", acceptedBy: "Fixture customer" }); job = go(go(job, "completed"), "accepted");
  let invoice = create("invoice", { job: job.id, method: "fixed", amount: 9743, description: "Reviewed repair service" }); expect(() => go(invoice, "issued")).toThrow("97.44"); invoice = go(edit(invoice, { amount: 9744 }), "issued"); expect(() => go(create("invoice", { ...invoice.fields }), "issued")).toThrow("already been invoiced");
  const payment = go(go(create("service_payment", { invoice: invoice.id, amount: 9744, direction: "receipt", reference: "fixture-bank-1", paidOn: today, evidence: "Synthetic external receipt" }), "confirmed"), "reconciled"); expect(payment.status).toBe("reconciled"); expect(paymentTotal(listBusinessRecords(), "service_payment", "invoice", invoice.id)).toBe(9744); expect(portalView(grant.token).invoices[0].paid).toBe(9744);
});
it("exports only deliberately shared published definitions and imports them as local-review drafts", () => {
  expect(exportBusinessTemplate().version).toBe(2); publish(); apply(review().proof); expect(exportBusinessTemplate().version).toBe(2);
  changePricingBook("book.share", { requestId: randomUUID(), id: bookId, revision: book().revision, shareInTemplates: true }, actor); const template = exportBusinessTemplate(); expect(template.version).toBe(3); expect(template.autoRepairPricing).toEqual([fixturePricing(today)]);
  for (const secret of ["PRIVATE", vehicle.id, client.id, bookId, "1HGCM82633A004352", "publishedBy", "unitCost", "taxReview"]) expect(JSON.stringify(template)).not.toContain(secret);
  const target = mkdtempSync(`${tmpdir()}/shuug-repair-import-`); try {
    vi.stubEnv("DEALDESK_DATA_DIR", target); expect(previewBusinessTemplate(template)).toMatchObject({ newPricingVersions: 1, existingPricingVersions: 0 }); expect(importBusinessTemplate(template).pricingVersionsCreated).toBe(1); expect(importBusinessTemplate(template).pricingVersionsCreated).toBe(0); expect(repairWorkspace().books[0]).toMatchObject({ status: "draft", imported: true, shareInTemplates: false, publishedAt: null, publishedBy: null, review: "" }); expect(repairWorkspace().estimates).toHaveLength(0);
    const changed = structuredClone(template); changed.autoRepairPricing![0].labor[0].hourlyRate++; expect(() => importBusinessTemplate(changed)).toThrow("different rules"); expect(repairWorkspace().books).toHaveLength(1);
  } finally { vi.stubEnv("DEALDESK_DATA_DIR", dir); rmSync(target, { recursive: true, force: true }); }
});
it("requires explicit format-3 module dependencies and does not silently change existing pricing", () => {
  publish(); changePricingBook("book.share", { requestId: randomUUID(), id: bookId, revision: 2, shareInTemplates: true }, actor); const template = exportBusinessTemplate(); expect(() => previewBusinessTemplate({ ...template, version: 2 })).toThrow("format version 3"); expect(() => previewBusinessTemplate({ ...template, requiredModules: [] })).toThrow("dependencies"); expect(() => previewBusinessTemplate({ ...template, autoRepairPricing: [fixturePricing(today), fixturePricing(today)] })).toThrow("repeat"); expect(importBusinessTemplate(template).pricingVersionsCreated).toBe(0); expect(book().status).toBe("published");
});
