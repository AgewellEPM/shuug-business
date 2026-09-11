// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createBusinessMcp } from "./mcp";
import { executeOperation } from "./service";
import { backendHandler } from "./http";
import { POST as mcpPost } from "../../app/api/mcp/route";
import { proxyHandler, webhookHandler } from "../shopify-backend/http";
import { ShopifyStore } from "../shopify-backend/store";
let dir: string;
const token = "backend-fixture-token", shop = "client.myshopify.com", secret = "shopify-fixture-secret";
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "shuug-backend-"));
  vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("BACKEND_ACCESS_TOKEN", token);
  vi.stubEnv("SHOPIFY_STORE_DOMAIN", ""); vi.stubEnv("SHOPIFY_BACKEND_ENABLED", "false");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
function request(operation: string, args = {}, bearer = token) { return new Request("http://localhost:3000/api/backend", { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation, arguments: args }) }); }
it("works standalone, authenticates reads and rejects unregistered operations", async () => {
  expect((await backendHandler(request("capabilities", {}, "bad"))).status).toBe(401);
  expect((await backendHandler(request("capabilities"))).status).toBe(200);
  const status = await (await backendHandler(request("shopify_status"))).json();
  expect(status.data).toMatchObject({ optional: true, enabled: false, connected: false, state: "disabled" });
  expect((await backendHandler(request("arbitrary_network_call"))).status).toBe(400);
  const req = request("capabilities"); req.headers.set("Origin", "https://attacker.test");
  expect((await backendHandler(req)).status).toBe(403);
});
it("creates a durable business tracker through HTTP with conflict protection", async () => {
  const trackerId = randomUUID(), recordId = randomUUID();
  const definition = { name: "Client deliveries", description: "Delivery log", fields: [{ id: "reference", label: "Reference", type: "text", required: true }] };
  expect((await backendHandler(request("tracker_create", { requestId: trackerId, definition }))).status).toBe(200);
  const input = { trackerId, id: recordId, revision: 0, channel: "online", values: { reference: "SO-1" } };
  expect((await backendHandler(request("tracker_save_record", input))).status).toBe(200);
  expect((await backendHandler(request("tracker_save_record", input))).status).toBe(200);
  const saved = JSON.parse(readFileSync(path.join(dir, "features.json"), "utf8"));
  expect(saved.trackers[0].records).toHaveLength(1);
  expect(saved.trackers[0].records[0].values.reference).toBe("SO-1");
  const edited = { ...input, revision: 1, values: { reference: "SO-2" } };
  await backendHandler(request("tracker_save_record", edited));
  expect((await backendHandler(request("tracker_save_record", { ...edited, values: { reference: "stale" } }))).status).toBeGreaterThanOrEqual(400);
});
it("negotiates a genuine MCP session and invokes actual backend tools", async () => {
  const server = createBusinessMcp(executeOperation), client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a); await client.connect(b);
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(39);
    const result = await client.callTool({ name: "shopify_status", arguments: {} });
    expect(result.isError).not.toBe(true);
    const text = result.content as { type: string; text: string }[];
    expect(JSON.parse(text[0].text).state).toBe("disabled");
    const read = await client.callTool({ name: "business_read", arguments: { resource: "features" } });
    expect(read.isError).not.toBe(true);
    const catalog = await client.callTool({ name: "restaurant_catalog", arguments: {} });
    const contracts = JSON.parse((catalog.content as { text: string }[])[0].text);
    expect(contracts.find((c: { action: string }) => c.action === "order.fire").inputSchema.required).toContain("allergensReviewed");
    expect(contracts.find((c: { action: string }) => c.action === "hours.review").inputSchema.required).toContain("reviewed");
    const salesReport = await client.callTool({ name: "restaurant_report", arguments: { from: "2026-08-01", to: "2026-08-28", basis: "open_hour" } });
    expect(salesReport.isError).not.toBe(true); expect(JSON.parse((salesReport.content as { text: string }[])[0].text).query).toEqual({ from: "2026-08-01", to: "2026-08-28", basis: "open_hour" });
    expect((await client.callTool({ name: "restaurant_report", arguments: { from: "2026-08-01" } })).isError).toBe(true);
    expect(tools.tools.find(t => t.name === "restaurant_report")?.annotations?.readOnlyHint).toBe(true);
    const accountsCatalog = await client.callTool({ name: "account_catalog", arguments: {} });
    expect(JSON.parse((accountsCatalog.content as { text: string }[])[0].text).classifications).toHaveLength(15);
    const accountCommand = { requestId: randomUUID(), action: "account.save", input: { number: 7100, revision: 0, name: "MCP other income", classification: "other_income", parentNumber: null, active: true, reviewed: true } };
    const savedAccount = await client.callTool({ name: "account_command", arguments: accountCommand }); expect(savedAccount.isError).not.toBe(true);
    expect(await client.callTool({ name: "account_command", arguments: accountCommand })).toEqual(savedAccount);
    const journalContracts = await client.callTool({ name: "journal_catalog", arguments: {} });
    expect(journalContracts.isError).not.toBe(true);
    expect(JSON.parse((journalContracts.content as { text: string }[])[0].text)).toHaveLength(2);
    const journalCommand = { requestId: randomUUID(), action: "journal.post", input: { date: "2026-09-10", memo: "MCP journal fixture", reviewed: true, lines: [{ accountNumber: 1000, debitCents: 1100, creditCents: 0 }, { accountNumber: 7100, debitCents: 0, creditCents: 1100 }] } };
    const posted = await client.callTool({ name: "journal_command", arguments: journalCommand }); expect(posted.isError).not.toBe(true);
    expect(await client.callTool({ name: "journal_command", arguments: journalCommand })).toEqual(posted);
    const journalId = JSON.parse((posted.content as { text: string }[])[0].text).id;
    expect((await client.callTool({ name: "journal_command", arguments: { requestId: randomUUID(), action: "journal.reverse", input: { id: journalId, revision: 1, date: "2026-09-11", reason: "Synthetic reversal", reviewed: true } } })).isError).not.toBe(true);
    const history = await client.callTool({ name: "business_read", arguments: { resource: "accounting-journal" } });
    expect(JSON.parse((history.content as { text: string }[])[0].text).data.entries).toHaveLength(2);
    const requirements = await client.callTool({ name: "business_read", arguments: { resource: "accounting-manual" } }); expect(requirements.isError).not.toBe(true);
    expect(tools.tools.find(t => t.name === "journal_command")?.annotations?.idempotentHint).toBe(true);
    const restaurantCommand = { requestId: randomUUID(), action: "supplier.save", input: { name: "MCP fixture supplier", email: "", phone: "", active: true } };
    const first = await client.callTool({ name: "restaurant_command", arguments: restaurantCommand });
    expect(first.isError).not.toBe(true);
    expect(await client.callTool({ name: "restaurant_command", arguments: restaurantCommand })).toEqual(first);
    const restaurant = await client.callTool({ name: "business_read", arguments: { resource: "restaurant" } });
    expect(JSON.parse((restaurant.content as { text: string }[])[0].text).data.operations.suppliers).toHaveLength(1);
    expect((await client.callTool({ name: "business_read", arguments: { resource: "restaurant-accounting" } })).isError).not.toBe(true);
    const counts = await client.callTool({ name: "business_read", arguments: { resource: "restaurant-stocktakes" } }); expect(counts.isError).not.toBe(true); expect(JSON.parse((counts.content as { text: string }[])[0].text).data).toEqual([]);
    expect(contracts.find((c: { action: string }) => c.action === "stocktake.post").inputSchema.required).toContain("reviewed");
    expect((await client.callTool({ name: "business_read", arguments: { resource: "restaurant-credits" } })).isError).not.toBe(true);
    expect(contracts.find((c: { action: string }) => c.action === "refund.record").inputSchema.required).toContain("returned");
    const diningCommand = { requestId: randomUUID(), action: "reservation.save", input: { name: "MCP guest", partySize: 2, dateISO: "2099-01-01", time: "18:00", phone: "", email: "", notes: "", walkIn: false, tableId: null, quotedWaitMinutes: null, host: "MCP host" } };
    const dining = await client.callTool({ name: "dining_command", arguments: diningCommand }); expect(dining.isError).not.toBe(true);
    expect(await client.callTool({ name: "dining_command", arguments: diningCommand })).toEqual(dining);
    const diningData = await client.callTool({ name: "business_read", arguments: { resource: "restaurant-dining" } }); expect(diningData.isError).not.toBe(true);
    const diningCatalog = await client.callTool({ name: "dining_catalog", arguments: {} });
    expect(JSON.parse((diningCatalog.content as { text: string }[])[0].text).find((c: { action: string }) => c.action === "visit.status").inputSchema.required).toContain("revision");
    expect((await client.listResources()).resources[0].uri).toBe("shuug://capabilities");
  } finally { await client.close(); await server.close(); }
});
it("speaks Streamable HTTP across stateless requests using the SDK client", async () => {
  const client = new Client({ name: "http-test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/api/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: async (url, init) => {
      const req = new Request(url, init);
      return req.method === "POST" ? mcpPost(req) : new Response(null, { status: 405 });
    },
  });
  try { await client.connect(transport); expect((await client.listTools()).tools).toHaveLength(39); expect((await client.callTool({ name: "shopify_status", arguments: {} })).isError).not.toBe(true); }
  finally { await client.close(); }
});
function proxyRequest(customerId: string) {
  const params = new URLSearchParams({ shop, timestamp: String(Math.floor(Date.now() / 1000)), logged_in_customer_id: customerId, resource: "orders", path_prefix: "/apps/shuug" });
  params.set("signature", createHmac("sha256", secret).update([...params.keys()].sort().map(k => `${k}=${params.get(k)}`).join("")).digest("hex"));
  return new Request(`http://localhost:3000/api/shopify/proxy?${params}`);
}
it("only exposes orders belonging to the signed storefront customer", async () => {
  vi.stubEnv("SHOPIFY_STORE_DOMAIN", shop); vi.stubEnv("SHOPIFY_CLIENT_SECRET", secret); vi.stubEnv("SHOPIFY_BACKEND_ENABLED", "true");
  const store = new ShopifyStore();
  for (const number of [1, 2]) store.upsert(shop, "orders", { id: `gid://shopify/Order/${number}`, updatedAt: new Date().toISOString(), name: `#${number}`, customer: { id: `gid://shopify/Customer/${number}` }, internalMargin: "never-public" });
  store.close();
  expect((await proxyHandler(proxyRequest(""))).status).toBe(401);
  const result = await (await proxyHandler(proxyRequest("1"))).json();
  expect(result.orders).toHaveLength(1); expect(result.orders[0].name).toBe("#1");
  expect(JSON.stringify(result)).not.toContain("internalMargin");
});
it("acks verified webhooks durably before network work and persists no address body", async () => {
  vi.stubEnv("SHOPIFY_STORE_DOMAIN", shop); vi.stubEnv("SHOPIFY_CLIENT_SECRET", secret);
  const raw = JSON.stringify({ id: 42, customer: { id: 1, email: "private@example.test" }, shipping_address: { address1: "private" } });
  const make = () => new Request("http://localhost:3000/api/shopify/webhooks", { method: "POST", body: raw, headers: { "x-shopify-shop-domain": shop, "x-shopify-topic": "orders/create", "x-shopify-webhook-id": "fixture-1", "x-shopify-hmac-sha256": createHmac("sha256", secret).update(raw).digest("base64") } });
  expect((await webhookHandler(make())).status).toBe(200);
  expect(await (await webhookHandler(make())).json()).toMatchObject({ received: true, duplicate: true });
  const store = new ShopifyStore();
  try { expect(store.jobs(shop)).toHaveLength(1); expect(store.jobs(shop)[0].payload).toEqual({ id: 42 }); } finally { store.close(); }
});
