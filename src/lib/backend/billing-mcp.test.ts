// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBusinessMcp } from "./mcp";
import { executeOperation } from "./service";
import { backendHandler } from "./http";
import { saveBusinessRecord } from "../workspace/store";
import { saveClientBook } from "../accounting/client-books";
import { billingDocuments } from "../accounting/billing-store";
import { billingBalance } from "../accounting/billing-model";
import { workspaceDatabase } from "../workspace/database";
import type { WorkspaceUser } from "../auth/identity";

let folder: string;
const owner: WorkspaceUser = { id: "workspace-owner", memberId: "owner", name: "Fixture owner", email: "", role: "Owner", isOwner: true };
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "shuug-billing-mcp-"));
  vi.stubEnv("DEALDESK_DATA_DIR", folder); vi.stubEnv("DEMO_DATA", "false");
  vi.stubEnv("APP_BASE_URL", "https://synthetic-workspace.example.com");
  vi.stubEnv("BACKEND_ACCESS_TOKEN", "synthetic-billing-backend-token"); vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider operation is authorized in this fixture."); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(folder, { recursive: true, force: true }); });
function fixtureBook(label: string) {
  const client = saveBusinessRecord({ kind: "client", title: label, fields: { email: "synthetic@example.invalid" } }, owner.id);
  return { client, book: saveClientBook({ revision: 0, clientId: client.id, name: `${label} books`, grants: [], reviewed: true }, owner) };
}
const draft = (number = `SYNTHETIC-${randomUUID()}`) => ({
  revision: 0, kind: "invoice", number, heading: "Invoice", date: "2026-10-01", due: "2026-10-31", currency: "USD",
  party: { name: "Synthetic customer", email: "synthetic@example.invalid", address: "Synthetic address" },
  issuer: "Synthetic firm", terms: "Due on receipt", notes: "Synthetic public invoice note", privateNotes: "PRIVATE-MCP-BILLING-SENTINEL", custom: [], controlAccount: 1200,
  lines: [{ description: "Synthetic accounting service", quantity: "1", unit: "service", unitCents: 12500, discountCents: 0, taxCents: 0, accountNumber: 4000, taxAccountNumber: 2200 }], reviewed: true,
});
const command = (bookId: string, action: string, input: object, requestId = randomUUID()) => ({ bookId, requestId, action, input });
async function session() {
  const server = createBusinessMcp(executeOperation), client = new Client({ name: "native-billing-mcp-test", version: "1" }), [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  return { server, client, call: async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args }); expect(result.isError).not.toBe(true);
    return JSON.parse((result.content as { text: string }[])[0].text);
  } };
}

it("uses genuine MCP tools to draft, read, post and share a native invoice with exact retries and isolated books", async () => {
  const a = fixtureBook("Household A"), b = fixtureBook("Household B"), s = await session();
  try {
    const tools = (await s.client.listTools()).tools; expect(tools).toHaveLength(45);
    expect(tools.find(tool => tool.name === "billing_read")?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(tools.find(tool => tool.name === "billing_command")?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true, openWorldHint: true });
    const catalog = await s.call("billing_catalog");
    expect(catalog.source).toBe("native-client-books"); expect(catalog.boundaries.join(" ")).toContain("does not move money");
    const sendSchema = catalog.actions.find((item: { action: string }) => item.action === "billing.delivery.send").inputSchema;
    expect(sendSchema.required).toEqual(expect.arrayContaining(["id", "revision", "deliveryId", "previewDigest", "recipient", "reviewed"]));
    const input = command(a.book.id, "billing.save", draft()), saved = await s.call("billing_command", input);
    expect(await s.call("billing_command", input)).toEqual(saved);
    const view = await s.call("billing_read", { bookId: a.book.id });
    expect(view.billing).toHaveLength(1); expect(view.billing[0]).toMatchObject({ id: saved.id, status: "draft", revision: 1 }); expect(view.entries).toHaveLength(0);
    const post = command(a.book.id, "billing.post", { id: saved.id, revision: 1, reviewed: true });
    await s.call("billing_command", post); await s.call("billing_command", post);
    const posted = await s.call("billing_read", { bookId: a.book.id });
    expect(posted.billing[0]).toMatchObject({ status: "posted", revision: 2 }); expect(posted.entries).toHaveLength(1); expect(posted.entries[0].source).toBe("native-billing");
    expect(billingBalance(posted.billing[0]).outstanding).toBe(12500);
    const stale = await s.client.callTool({ name: "billing_command", arguments: command(a.book.id, "billing.post", { id: saved.id, revision: 1, reviewed: true }) });
    expect(stale.isError).toBe(true); expect(JSON.stringify(stale.content)).toContain("changed");
    const wrongBook = await s.client.callTool({ name: "billing_command", arguments: command(b.book.id, "billing.post", { id: saved.id, revision: 2, reviewed: true }) });
    expect(wrongBook.isError).toBe(true); expect(JSON.stringify(wrongBook.content)).toContain("unavailable in this book");
    expect((await s.call("billing_read", { bookId: b.book.id })).billing).toHaveLength(0);
    expect((await s.call("billing_read", { bookId: "office" })).billing).toHaveLength(0);
    const shared = await s.call("billing_command", command(a.book.id, "billing.share", { id: saved.id, revision: 2, days: 7, reviewed: true }));
    expect(shared.url).toMatch(/^https:\/\/synthetic-workspace[.]example[.]com\/api\/accounting\/share\/[a-f0-9]{64}$/);
    expect(fetch).not.toHaveBeenCalled();
  } finally { await s.client.close(); await s.server.close(); }
});

it("keeps manual settlements as native accounting evidence and payment configuration free of provider claims or secret outputs", async () => {
  const { book } = fixtureBook("Synthetic business"), s = await session();
  try {
    const { id } = await s.call("billing_command", command(book.id, "billing.save", draft()));
    await s.call("billing_command", command(book.id, "billing.post", { id, revision: 1, reviewed: true }));
    const settlement = { id, revision: 2, date: "2026-10-02", direction: "payment", amountCents: 12500, accountNumber: 1000, method: "Bank transfer", reference: "SYNTHETIC-VERIFIED-TRANSFER", evidence: "Synthetic externally verified bank transfer", reviewed: true };
    const request = command(book.id, "billing.settle", settlement);
    await s.call("billing_command", request); await s.call("billing_command", request);
    const view = await s.call("billing_read", { bookId: book.id });
    expect(view.entries).toHaveLength(2); expect(view.billing[0].settlements).toHaveLength(1);
    expect(view.billing[0].settlements[0]).toMatchObject({ reference: settlement.reference, evidence: settlement.evidence });
    expect(view.billing[0].settlements[0].providerPaymentId).toBeUndefined(); expect(billingBalance(view.billing[0]).outstanding).toBe(0);
    const configured = await s.call("billing_command", command(book.id, "billing.connection", { enabled: true, secretKey: "sk_test_SYNTHETICONLY", reviewed: true }));
    expect(configured).toEqual({ enabled: true, live: false });
    const after = await s.call("billing_read", { bookId: book.id }); expect(after.paymentConnection).toEqual({ enabled: true, live: false });
    expect(JSON.stringify(after)).not.toContain("sk_test_SYNTHETICONLY"); expect(fetch).not.toHaveBeenCalled();
  } finally { await s.client.close(); await s.server.close(); }
});

it("denies billing reads and mutations for enrolled client books without returning legacy plaintext", async () => {
  const { client, book } = fixtureBook("Enrolled client"), s = await session();
  try {
    const { id } = await s.call("billing_command", command(book.id, "billing.save", draft()));
    workspaceDatabase(db => { db.exec("CREATE TABLE secure_tax_enrollments(accountId TEXT,clientId TEXT,status TEXT)"); db.prepare("INSERT INTO secure_tax_enrollments VALUES(?,?,'active')").run("synthetic-encrypted-account", client.id); }, true);
    for (const [name, args] of [["billing_read", { bookId: book.id }], ["billing_command", command(book.id, "billing.post", { id, revision: 1, reviewed: true })]] as const) {
      const denied = await s.client.callTool({ name, arguments: args }); expect(denied.isError).toBe(true);
      expect(JSON.stringify(denied.content)).toContain("offhost encrypted tax vault"); expect(JSON.stringify(denied.content)).not.toContain("PRIVATE-MCP-BILLING-SENTINEL");
    }
    expect(billingDocuments(book.id)[0]).toMatchObject({ status: "draft", revision: 1 }); expect(fetch).not.toHaveBeenCalled();
  } finally { await s.client.close(); await s.server.close(); }
});

it("authenticates native billing at the real backend boundary and rejects broader commands or unreviewed inputs", async () => {
  const { book } = fixtureBook("Guarded business");
  const request = (operation: string, args: object, bearer = "synthetic-billing-backend-token") => new Request("https://synthetic-workspace.example.com/api/backend", { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation, arguments: args }) });
  expect((await backendHandler(request("billing_read", { bookId: book.id }, "invalid"))).status).toBe(401);
  expect((await backendHandler(request("billing_command", command(book.id, "billing.save", draft()), "invalid"))).status).toBe(401);
  const unreviewed = { ...draft(), reviewed: false };
  expect((await backendHandler(request("billing_command", command(book.id, "billing.save", unreviewed)))).status).toBe(400);
  expect((await backendHandler(request("billing_command", command(book.id, "journal.post", {})))).status).toBe(400);
  const invalidBook = await backendHandler(request("billing_read", { bookId: "../../other-firm" }));
  expect(invalidBook.status).toBe(400);
  expect(billingDocuments(book.id)).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
});
