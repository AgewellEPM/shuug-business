// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceUser } from "../auth/identity";
import { saveSecrets } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { bookCommand, bookView } from "./book-service";
import { billingDocuments } from "./billing-store";
import { billingBalance } from "./billing-model";
import { saveClientBook } from "./client-books";
import { saveBusinessRecord } from "../workspace/store";
import { executeBillingShare, sharedBillingDocument } from "./billing-share";
import { invoiceDeliveryConnection, invoiceDeliveryHistory } from "./invoice-delivery";
import type { InvoiceDeliveryResult } from "./invoice-delivery-model";
let directory: string;
const owner: WorkspaceUser = { id: "workspace-owner", memberId: "owner", name: "Synthetic owner", email: "", role: "Owner", isOwner: true };
const connection = { MAILGUN_API_KEY: "synthetic-private-mailgun-key", MAILGUN_DOMAIN: "billing.example.invalid", MAILGUN_FROM_EMAIL: "office@billing.example.invalid", MAILGUN_REGION: "US", MAILGUN_MODE: "test" };
const command = (action: string, input: object, requestId = randomUUID(), bookId = "office", user = owner) => bookCommand(bookId, { requestId, action, input: { ...input, reviewed: true } }, user);
async function invoice(bookId = "office", email = "client@example.invalid") {
  await command("billing.save", { revision: 0, kind: "invoice", currency: "USD", number: randomUUID(), heading: "Tax invoice", date: "2026-10-01", due: "2026-10-31", party: { name: "Synthetic client", email, address: "Private customer address" }, issuer: "Synthetic firm", terms: "Private terms", notes: "Private client-specific invoice text", privateNotes: "PRIVATE SSN 000-12-3456", custom: [], controlAccount: 1200, lines: [{ description: "Private return work", quantity: "1", unit: "", unitCents: 10000, discountCents: 0, taxCents: 0, accountNumber: 4000, taxAccountNumber: 2200 }] }, undefined, bookId);
  const doc = billingDocuments(bookId).at(-1)!; await command("billing.post", { id: doc.id, revision: 1 }, undefined, bookId); return billingDocuments(bookId).at(-1)!;
}
async function preview(id: string, bookId = "office", revision = 2) { return await command("billing.delivery.preview", { id, revision }, undefined, bookId) as InvoiceDeliveryResult; }
function sendInput(id: string, p: InvoiceDeliveryResult, extra = {}) { return { id, revision: 2, deliveryId: p.deliveryId, previewDigest: p.previewDigest!, recipient: p.preview!.recipient, ...extra }; }
const accepted = () => Response.json({ id: "<synthetic-mailgun-message@billing.example.invalid>", message: "Queued. Thank you." });
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-invoice-delivery-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("STRIPE_SECRET_KEY", ""); vi.stubEnv("APP_BASE_URL", "https://workspace.example.invalid");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network request in a synthetic test."); })); saveSecrets(connection);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("previews exact minimal content without activating or revoking links or sending email", async () => {
  const doc = await invoice(), existing = executeBillingShare("office", { requestId: randomUUID(), action: "billing.share", input: { id: doc.id, revision: 2, days: 2, reviewed: true } }, owner);
  const p = await preview(doc.id), token = new URL(p.preview!.url).pathname.split("/").at(-1)!;
  expect(fetch).not.toHaveBeenCalled(); expect(p.preview).toMatchObject({ from: connection.MAILGUN_FROM_EMAIL, recipient: doc.party.email, mode: "test" });
  for (const privateText of ["000-12-3456", "Private return work", "Private customer address", "Private terms", "Private client-specific", doc.number]) expect(p.preview!.text).not.toContain(privateText);
  expect(() => workspaceDatabase(db => sharedBillingDocument(db, token))).toThrow();
  expect(workspaceDatabase(db => sharedBillingDocument(db, new URL(existing.url!).pathname.split("/").at(-1)!).doc.id)).toBe(doc.id);
  const persisted = workspaceDatabase(db => JSON.stringify(db.prepare("SELECT body FROM documents WHERE kind='invoice-delivery' UNION ALL SELECT snapshot AS body FROM audit UNION ALL SELECT result AS body FROM commands").all()));
  expect(persisted).not.toContain(p.preview!.url); expect(persisted).not.toContain(connection.MAILGUN_API_KEY);
});

it.each(["US", "EU"])("records the attempt before one bounded %s request and preserves accounting and prior links", async region => {
  saveSecrets({ ...connection, MAILGUN_REGION: region });
  const doc = await invoice(), p = await preview(doc.id), requestId = randomUUID(), input = sendInput(doc.id, p);
  const provider = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe(`https://${region === "EU" ? "api.eu.mailgun.net" : "api.mailgun.net"}/v3/billing.example.invalid/messages`);
    expect(init?.method).toBe("POST"); expect(init?.redirect).toBe("error"); expect(init?.signal).toBeInstanceOf(AbortSignal);
    const form = init!.body as FormData;
    expect(form.get("to")).toBe(doc.party.email); expect(form.get("text")).toBe(p.preview!.text); expect(form.get("o:testmode")).toBe("yes"); expect(form.get("o:tracking-clicks")).toBe("no"); expect(form.get("o:require-tls")).toBe("yes"); expect(form.has("attachment")).toBe(false);
    expect(invoiceDeliveryHistory("office", owner)[0].status).toBe("sending");
    expect(workspaceDatabase(db => db.prepare("SELECT id FROM commands WHERE id=?").get(requestId))).toBeTruthy();
    expect(workspaceDatabase(db => sharedBillingDocument(db, new URL(p.preview!.url).pathname.split("/").at(-1)!).doc.id)).toBe(doc.id);
    return accepted();
  }); vi.stubGlobal("fetch", provider);
  const result = await command("billing.delivery.send", input, requestId); expect(result.status).toBe("accepted"); expect(result.message).toContain("test");
  expect(await command("billing.delivery.send", input, requestId)).toEqual(result); expect(provider).toHaveBeenCalledOnce();
  const view = await bookView("office", owner); expect(view.entries).toHaveLength(1); expect(billingBalance(view.billing[0]).outstanding).toBe(10000);
  const duplicate = await preview(doc.id); await expect(command("billing.delivery.send", sendInput(doc.id, duplicate))).rejects.toThrow(/already accepted/); expect(provider).toHaveBeenCalledOnce();
});

it("rechecks revision, exact recipient, digest, authorization and connection before any request", async () => {
  const doc = await invoice(), p = await preview(doc.id);
  await expect(command("billing.delivery.send", sendInput(doc.id, p, { recipient: "another@example.invalid" }))).rejects.toThrow(/changed/);
  await expect(command("billing.delivery.send", sendInput(doc.id, p, { previewDigest: "0".repeat(64) }))).rejects.toThrow(/changed/);
  await expect(command("billing.delivery.send", sendInput(doc.id, p, { revision: 3 }))).rejects.toThrow(/current/);
  saveSecrets({ MAILGUN_FROM_EMAIL: "other@billing.example.invalid" }); await expect(command("billing.delivery.send", sendInput(doc.id, p))).rejects.toThrow(/changed/);
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects wrong-book and ungranted-client access and expired previews without network or link changes", async () => {
  const makeBook = () => saveClientBook({ clientId: saveBusinessRecord({ kind: "client", title: "Synthetic firm client", fields: { email: "owner@example.invalid" } }, owner.id).id, revision: 0, name: "Separate books", grants: [], reviewed: true }, owner);
  const a = makeBook(), b = makeBook(), doc = await invoice(a.id), p = await preview(doc.id, a.id);
  await expect(command("billing.delivery.send", sendInput(doc.id, p), undefined, b.id)).rejects.toThrow(/unavailable/);
  await expect(command("billing.delivery.send", sendInput(doc.id, p), undefined, a.id, { ...owner, id: randomUUID(), isOwner: false })).rejects.toThrow(/access/);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 11 * 60000);
  await expect(command("billing.delivery.send", sendInput(doc.id, p), undefined, a.id)).rejects.toThrow(/changed/); expect(fetch).not.toHaveBeenCalled();
});

it.each(["timeout", "500", "malformed"])("never resends an uncertain %s outcome, including a new preview or changed retry", async failure => {
  const doc = await invoice(), p = await preview(doc.id), requestId = randomUUID(), input = sendInput(doc.id, p);
  const provider = vi.fn(async () => { if (failure === "timeout") throw new Error("secret or private provider error must not leak"); return failure === "500" ? new Response("provider internal details", { status: 500 }) : Response.json({ missing: "id" }); }); vi.stubGlobal("fetch", provider);
  const result = await command("billing.delivery.send", input, requestId); expect(result.status).toBe("uncertain"); expect(JSON.stringify(result)).not.toContain("secret");
  expect(await command("billing.delivery.send", input, requestId)).toEqual(result);
  await expect(command("billing.delivery.send", { ...input, recipient: "wrong@example.invalid" }, requestId)).rejects.toThrow(/request ID/i);
  const another = await preview(doc.id); await expect(command("billing.delivery.send", sendInput(doc.id, another))).rejects.toThrow(/earlier email/); expect(provider).toHaveBeenCalledOnce();
  await command("billing.delivery.resolve", { id: doc.id, revision: 2, deliveryId: p.deliveryId, outcome: "not_sent", evidence: "Synthetic owner checked the exact request in the provider log; rejected before acceptance." });
  const afterReview = await preview(doc.id); vi.stubGlobal("fetch", vi.fn(async () => accepted()));
  expect((await command("billing.delivery.send", sendInput(doc.id, afterReview))).status).toBe("accepted");
});

it("allows only one concurrent request and never replays a crashed in-flight attempt", async () => {
  const doc = await invoice(), p = await preview(doc.id), requestId = randomUUID(), input = sendInput(doc.id, p);
  let release!: (value: Response) => void, started!: () => void;
  const gate = new Promise<void>(resolve => { started = resolve; }), response = new Promise<Response>(resolve => { release = resolve; });
  const provider = vi.fn(async () => { started(); return response; }); vi.stubGlobal("fetch", provider);
  const first = command("billing.delivery.send", input, requestId); await gate;
  expect((await command("billing.delivery.send", input, requestId)).status).toBe("sending");
  const second = await preview(doc.id); await expect(command("billing.delivery.send", sendInput(doc.id, second))).rejects.toThrow(/earlier email/);
  expect(provider).toHaveBeenCalledOnce(); release(accepted()); expect((await first).status).toBe("accepted");
});

it("keeps rejected requests explicit and records manual acceptance as staff evidence rather than delivery", async () => {
  const doc = await invoice(), p = await preview(doc.id); vi.stubGlobal("fetch", vi.fn(async () => new Response("Do not expose body", { status: 401 })));
  expect((await command("billing.delivery.send", sendInput(doc.id, p))).status).toBe("rejected");
  const next = await preview(doc.id); vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Synthetic lost response"); }));
  await command("billing.delivery.send", sendInput(doc.id, next));
  await expect(command("billing.delivery.resolve", { id: doc.id, revision: 2, deliveryId: next.deliveryId, outcome: "accepted", evidence: "Synthetic provider acceptance reviewed." })).rejects.toThrow(/message ID/);
  const resolved = await command("billing.delivery.resolve", { id: doc.id, revision: 2, deliveryId: next.deliveryId, outcome: "accepted", providerId: "<synthetic-recorded-provider-id>", evidence: "Synthetic operator compared exact delivery metadata in Mailgun." });
  expect(resolved.message).toContain("unconfirmed"); expect(invoiceDeliveryHistory("office", owner)[0].verification).toBe("staff_recorded_provider_evidence");
});

it("fails closed for missing vault-only credentials, arbitrary hosts, wrong sender and insecure origin", async () => {
  const doc = await invoice(); saveSecrets(Object.fromEntries(Object.keys(connection).map(name => [name, null]))); vi.stubEnv("MAILGUN_API_KEY", connection.MAILGUN_API_KEY);
  expect(invoiceDeliveryConnection().ready).toBe(false); await expect(preview(doc.id)).rejects.toThrow(/needs Mailgun/);
  for (const patch of [{ MAILGUN_DOMAIN: "billing.example.invalid/../../evil" }, { MAILGUN_REGION: "https://attacker.invalid" }, { MAILGUN_FROM_EMAIL: "wrong@attacker.invalid" }]) {
    saveSecrets({ ...connection, ...patch }); await expect(preview(doc.id)).rejects.toThrow();
  }
  saveSecrets(connection); vi.stubEnv("APP_BASE_URL", "http://localhost:3000"); await expect(preview(doc.id)).rejects.toThrow(/HTTPS/); expect(fetch).not.toHaveBeenCalled();
});

it("identifies live-mode provider acceptance without claiming delivery or attaching tax data", async () => {
  saveSecrets({ MAILGUN_MODE: "live" }); const doc = await invoice(), p = await preview(doc.id);
  const provider = vi.fn(async (_url: string, init?: RequestInit) => { expect((init!.body as FormData).has("o:testmode")).toBe(false); return accepted(); }); vi.stubGlobal("fetch", provider);
  const result = await command("billing.delivery.send", sendInput(doc.id, p)); expect(result.status).toBe("accepted"); expect(result.message).toContain("has not been confirmed"); expect(billingDocuments("office")[0].settlements).toHaveLength(0);
});

it("allows a reviewed live send after test acceptance without treating a test as delivered email", async () => {
  const doc = await invoice(), test = await preview(doc.id); vi.stubGlobal("fetch", vi.fn(async () => accepted()));
  await command("billing.delivery.send", sendInput(doc.id, test)); saveSecrets({ MAILGUN_MODE: "live" });
  const live = await preview(doc.id); expect(live.preview!.mode).toBe("live");
  expect((await command("billing.delivery.send", sendInput(doc.id, live))).status).toBe("accepted"); expect(fetch).toHaveBeenCalledTimes(2);
  expect(billingDocuments("office")[0].settlements).toHaveLength(0);
});

it("requires a new preview after link revocation without reactivating any revoked link", async () => {
  const doc = await invoice(), share = executeBillingShare("office", { requestId: randomUUID(), action: "billing.share", input: { id: doc.id, revision: 2, days: 2, reviewed: true } }, owner), p = await preview(doc.id);
  executeBillingShare("office", { requestId: randomUUID(), action: "billing.share.revoke", input: { id: doc.id, revision: 2, reviewed: true } }, owner);
  await expect(command("billing.delivery.send", sendInput(doc.id, p))).rejects.toThrow(/link permissions changed/);
  expect(() => workspaceDatabase(db => sharedBillingDocument(db, new URL(share.url!).pathname.split("/").at(-1)!))).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("retains and resolves uncertain evidence after voiding without allowing another send", async () => {
  const doc = await invoice(), p = await preview(doc.id); vi.stubGlobal("fetch", vi.fn(async () => new Response("Synthetic uncertain response", { status: 500 })));
  await command("billing.delivery.send", sendInput(doc.id, p));
  await command("billing.void", { id: doc.id, revision: 2, date: "2026-10-02", reason: "Synthetic invoice correction" });
  const result = await command("billing.delivery.resolve", { id: doc.id, revision: 3, deliveryId: p.deliveryId, outcome: "accepted", providerId: "<synthetic-later-verified>", evidence: "Synthetic owner checked acceptance for the original request in Mailgun." });
  expect(result.status).toBe("accepted"); expect(result.message).toContain("unconfirmed"); expect(billingDocuments("office")[0].status).toBe("void");
  await expect(preview(doc.id, "office", 3)).rejects.toThrow(/only posted/); expect(fetch).toHaveBeenCalledOnce();
});
