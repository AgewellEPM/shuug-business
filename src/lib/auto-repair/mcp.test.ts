// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBusinessMcp } from "../backend/mcp";
import { executeOperation } from "../backend/service";
import { saveBusinessRecord, listBusinessRecords } from "../workspace/store";
import { addRecord } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { fixturePricing, fixtureEstimate } from "./fixture";
it("applies real MCP pricing contracts through publication, estimate review and a single durable proposal", async () => {
  const dir = mkdtempSync(`${tmpdir()}/shuug-repair-mcp-`); vi.stubEnv("DEALDESK_DATA_DIR", dir);
  const server = createBusinessMcp(executeOperation), client = new Client({ name: "repair-test", version: "1" }), [a, b] = InMemoryTransport.createLinkedPair();
  const call = async (name: string, args: Record<string, unknown> = {}) => { const result = await client.callTool({ name, arguments: args }); expect(result.isError).not.toBe(true); return JSON.parse((result.content as { text: string }[])[0].text); };
  try {
    const customer = saveBusinessRecord({ kind: "client", title: "MCP client", fields: { email: "client@example.test" } }, "Fixture"), vehicle = addRecord("vehicles", moduleById("vehicles")!.fields, { customer_id: customer.id, vin: "1HGCM82633A004352", make: "Honda", model: "Accord", year: 2003 });
    await server.connect(a); await client.connect(b); const tools = await client.listTools(); expect(tools.tools.find(t => t.name === "repair_command")?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true, openWorldHint: false }); expect((await call("repair_catalog")).map((c: { action: string }) => c.action)).toContain("estimate.create");
    const today = new Date().toISOString().slice(0, 10), saved = await call("repair_command", { action: "book.save", input: { requestId: randomUUID(), definition: fixturePricing(today), shareInTemplates: false } });
    await call("repair_command", { action: "book.publish", input: { requestId: randomUUID(), id: saved.id, revision: 1, reviewed: true, review: "MCP fixture review" } }); const review = await call("repair_command", { action: "estimate.review", input: fixtureEstimate(saved.id, vehicle.id, today) }); expect(review.quote.total).toBe(9744);
    const args = { action: "estimate.create", input: { requestId: randomUUID(), proof: review.proof, reviewed: true } }, created = await call("repair_command", args); expect(await call("repair_command", args)).toEqual(created); expect((await call("business_read", { resource: "auto-repair-pricing" })).data.estimates).toHaveLength(1); expect(listBusinessRecords(["proposal"])[0].fields.amount).toBe(9744);
  } finally { await client.close(); await server.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
});
