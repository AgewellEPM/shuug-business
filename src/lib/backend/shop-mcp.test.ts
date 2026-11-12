// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBusinessMcp } from "./mcp";
import { executeOperation } from "./service";
import { GET, POST } from "../../app/api/website/forms/[id]/route";
import { listEmails } from "../email/store";
import { listBusinessRecords } from "../workspace/store";
import { listTasks } from "../tasks/store";
let directory: string, other: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "shuug-shop-mcp-"));
  other = mkdtempSync(path.join(os.tmpdir(), "shuug-shop-other-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", "https://shop.example.invalid");
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }); });
it("uses actual MCP configuration and public intake to persist one request, task and blocked acknowledgment without a provider", async () => {
  const network = vi.fn(() => { throw new Error("No external request is authorized in this check."); }); vi.stubGlobal("fetch", network);
  const server = createBusinessMcp(executeOperation), client = new Client({ name: "shop-workflow-check", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    const content = (result.content as { type: string; text?: string }[]).filter(item => item.type === "text").map(item => item.text).join("\n");
    expect(result.isError, content).not.toBe(true); return JSON.parse(content);
  }
  try {
    await server.connect(a); await client.connect(b);
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(53);
    expect(tools.find(tool => tool.name === "shop_tick")?.annotations?.openWorldHint).toBe(true);
    expect((await call("shop_catalog")).websiteForm.properties.kind.enum).toContain("auto-repair");
    await call("shop_command", { action: "automation.configure", input: { revision: 0, reviewed: true, enabled: true,
      bookingConfirmations: true, appointmentReminders: true, jobUpdates: true, reminderHours: 24, timeZone: "America/New_York" } });
    const form = await call("website_command", { action: "form.save", input: { title: "Synthetic auto repair intake", kind: "auto-repair", enabled: true, origins: ["https://www.tatewayauto.com"] } });
    const workflow = { name: "Service intake follow-up", formId: form.id, taskTitle: "Review the service request", assigneeId: null, priority: "high", channels: [] };
    const preview = await call("website_command", { action: "workflow.test", input: workflow });
    await call("website_command", { action: "workflow.enable", input: { workflow, testId: preview.testId } });
    const url = `https://shop.example.invalid/api/website/forms/${form.id}`, context = { params: Promise.resolve({ id: form.id }) };
    const html = await (await GET(new Request(url), context)).text(), proof = html.match(/name="proof" value="([^"]+)"/)![1];
    const body = new URLSearchParams({ proof, name: "DEMO Customer", email: "demo.customer@example.invalid", message: "DEMO check-engine-light request", consent: "yes", website: "" });
    const request = () => new Request(url, { method: "POST", headers: { Origin: "https://shop.example.invalid", "Content-Type": "application/x-www-form-urlencoded" }, body });
    expect((await POST(request(), context)).status).toBe(201);
    expect((await POST(request(), context)).status).toBe(200);
    expect((await call("website_read")).submissions).toHaveLength(1);
    expect(listBusinessRecords().map(row => row.kind).sort()).toEqual(["client", "inquiry"]);
    expect(listEmails()).toHaveLength(1);
    expect((await call("shop_tick", { limit: 20 })).status).toBe("completed");
    expect(listTasks()).toHaveLength(1);
    const messages = await call("communications_read");
    expect(messages.messages).toHaveLength(1); expect(messages.messages[0].status).toBe("blocked");
    expect(messages.connections.enabled).toBe(false); expect(network).not.toHaveBeenCalled();
    const state = await call("shop_read"); expect(state.intakePending).toBe(1); expect(state.lastRun.status).toBe("completed");
    vi.stubEnv("DEALDESK_DATA_DIR", other);
    expect((await call("website_read")).forms).toHaveLength(0);
    expect((await call("communications_read")).messages).toHaveLength(0);
  } finally { await client.close(); await server.close(); }
});
