// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBusinessMcp } from "../backend/mcp";
import { executeOperation } from "../backend/service";
import { inspectionFixture, inspectionOwner } from "./inspection-fixture";
import { listBusinessRecords } from "../workspace/store";
it("executes assigned inspection work through actual MCP contracts and preserves one reviewed labor-cost record", async () => {
  const dir = mkdtempSync(`${tmpdir()}/shuug-inspection-mcp-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
  const server = createBusinessMcp(executeOperation), client = new Client({ name: "inspection-test", version: "1" }), [a, b] = InMemoryTransport.createLinkedPair();
  const call = async (name: string, args: Record<string, unknown> = {}) => { const r = await client.callTool({ name, arguments: args }); expect(r.isError, JSON.stringify(r.content)).not.toBe(true); return JSON.parse((r.content as { text: string }[])[0].text); };
  try {
    const f = inspectionFixture(inspectionOwner); await server.connect(a); await client.connect(b); const tools = await client.listTools(); expect(tools.tools.find(t => t.name === "inspection_command")?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true, openWorldHint: false }); expect((await call("inspection_catalog")).map((c: { action: string }) => c.action)).toContain("inspection.review");
    const run = async (action: string, input: Record<string, unknown>) => call("inspection_command", { requestId: randomUUID(), action, input: { id: f.id, ...input } });
    await run("inspection.start", { revision: 1 }); vi.advanceTimersByTime(600000); await run("inspection.save", { revision: 2, odometer: 100, odometerUnit: "miles", staffNotes: "Private note", customerSummary: "MCP report", findings: [{ key: "brakes", outcome: "pass", measurement: "6", observation: "Measured", recommendation: "" }, { key: "lights", outcome: "pass", measurement: "", observation: "Functional", recommendation: "" }] }); await run("inspection.submit", { revision: 3, confirmed: true }); const input = { requestId: randomUUID(), action: "inspection.review", input: { id: f.id, revision: 4, reviewed: true, review: "Reviewed test inspection", dispositions: [], hourlyCost: 3000, shareWithCustomer: false } }; expect(await call("inspection_command", input)).toEqual(await call("inspection_command", input)); const view = await call("business_read", { resource: "auto-repair-inspections" }); expect(view.data.inspections[0].status).toBe("reviewed"); expect(listBusinessRecords(["time_entry"])[0].fields.cost).toBe(500);
  } finally { await client.close(); await server.close(); vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
});
