// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBusinessMcp } from "../backend/mcp";
import { executeOperation } from "../backend/service";
import { saveBusinessRecord } from "../workspace/store";
it("uses the actual MCP VIN contracts for lookup, reviewed save and resource history", async () => {
  const dir = mkdtempSync(`${tmpdir()}/shuug-vin-mcp-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Results: [{ VIN: "1HGCM82633A004352", ErrorCode: "0", Make: "HONDA", Model: "Accord", ModelYear: "2003", ErrorText: "Clean" }] })));
  const server = createBusinessMcp(executeOperation), client = new Client({ name: "vin-test", version: "1" }), [a, b] = InMemoryTransport.createLinkedPair();
  try {
    const customer = saveBusinessRecord({ kind: "client", title: "MCP client", currency: "USD", fields: { email: "client@example.test" } }, "Fixture"); await server.connect(a); await client.connect(b);
    const available = await client.listTools();
    expect(available.tools.find(t => t.name === "vehicle_vin_lookup")?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(available.tools.find(t => t.name === "vehicle_vin_apply")?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true, openWorldHint: false });
    const lookup = await client.callTool({ name: "vehicle_vin_lookup", arguments: { vin: "1HGCM82633A004352", modelYear: 2003, recordId: null, consent: true } }); expect(lookup.isError).not.toBe(true); const review = JSON.parse((lookup.content as { text: string }[])[0].text);
    const args = { requestId: randomUUID(), proof: review.proof, details: { customer_id: customer.id, registration: "", odometer: null, fleet_id: "", notes: "" }, reviewed: true }; const applied = await client.callTool({ name: "vehicle_vin_apply", arguments: args }); expect(applied.isError).not.toBe(true); expect(await client.callTool({ name: "vehicle_vin_apply", arguments: args })).toEqual(applied);
    const read = await client.callTool({ name: "business_read", arguments: { resource: "vehicles" } }); expect(read.isError).not.toBe(true); const rows = JSON.parse((read.content as { text: string }[])[0].text).data; expect(rows).toHaveLength(1); expect(rows[0].vinReviews[0].reviewedBy).toBe("Authenticated backend");
  } finally { await client.close(); await server.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
});
