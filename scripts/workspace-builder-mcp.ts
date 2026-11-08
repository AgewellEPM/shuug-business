/** Drive Shuug's real stdio MCP interface. Credentials stay in the local vault.
 * This client does not implement a substitute builder or write application data. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setting } from "../src/lib/connections/vault";

async function main() {
  const options = new Map<string, string>(); let apply = false;
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (key === "--apply") { if (apply) throw new Error("Duplicate apply option."); apply = true; continue; }
    if (!["--url", "--data-dir", "--plan", "--out", "--current-digest", "--proposed-digest"].includes(key) || options.has(key) || !process.argv[i + 1] || process.argv[i + 1].startsWith("--")) throw new Error("Use --url ORIGIN --data-dir PRIVATE_DIR --plan BUSINESS_PLAN.json [--out NEW_RECEIPT.json] [--apply --current-digest HASH --proposed-digest HASH].");
    options.set(key, process.argv[++i]);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const selected = options.get("--url"), directory = options.get("--data-dir"), filename = options.get("--plan");
  if (!selected || !directory || !filename || !path.isAbsolute(directory)) throw new Error("Select the actual backend origin, absolute private data directory and reviewed business plan file.");
  const url = new URL(selected);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use an HTTPS origin, or explicit loopback HTTP. Never put credentials in the URL.");
  const bytes = readFileSync(filename); if (bytes.length > 32768) throw new Error("The public business plan is too large.");
  const plan: Record<string, unknown> = JSON.parse(bytes.toString("utf8"));
  process.env.DEALDESK_DATA_DIR = directory;
  if (!setting("BACKEND_ACCESS_TOKEN") && !process.env.SHUUG_BACKEND_TOKEN) throw new Error("Configure this workspace's MCP access with backend:setup first. No credential was printed.");
  const env = Object.fromEntries(Object.entries({ ...process.env, DEALDESK_DATA_DIR: directory, SHUUG_BACKEND_URL: url.origin }).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(root, "node_modules/tsx/dist/loader.mjs"), path.join(root, "scripts/mcp-server.ts")], cwd: root, env, stderr: "pipe" });
  const client = new Client({ name: "shuug-workspace-builder-client", version: "1.0.0" });
  const calls: string[] = [];
  async function call(name: string, input: Record<string, unknown> = {}) {
    process.stderr.write(`Shuug MCP → ${name}\n`);
    const response = await client.callTool({ name, arguments: input }); calls.push(name);
    const content = response.content as { type: string; text?: string }[];
    const text = content.filter(item => item.type === "text").map(item => item.text).join("\n");
    if (response.isError) throw new Error(text || `${name} failed.`);
    return JSON.parse(text);
  }
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    await call("business_capabilities"); await call("shopify_status");
    if (!tools.tools.some(tool => tool.name === "workspace_preview")) throw new Error("This running Shuug build does not expose its workspace builder yet. Build/update it before applying a plan.");
    const catalog = await call("workspace_catalog");
    let result;
    if (apply) {
      const currentDigest = options.get("--current-digest"), proposedDigest = options.get("--proposed-digest");
      if (![currentDigest, proposedDigest].every(value => value && /^[a-f0-9]{64}$/.test(value))) throw new Error("Apply needs both digests from the reviewed MCP preview.");
      result = await call("workspace_apply", { plan, currentDigest, proposedDigest });
    } else result = await call("workspace_preview", plan);
    const receipt = { ok: true, server: client.getServerVersion(), toolCount: tools.tools.length, backendOrigin: url.origin, operation: apply ? "workspace_apply" : "workspace_preview", calls, businessDescription: plan.description, catalogVersion: catalog.version ?? null, result, generatedAt: new Date().toISOString() };
    if (options.has("--out")) writeFileSync(options.get("--out")!, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    const output = options.has("--out") ? { ...receipt, result: { applied: result.applied ?? false, duplicate: result.duplicate ?? false, currentDigest: result.currentDigest, proposedDigest: result.proposedDigest, receiptId: result.receipt?.id, visibleTools: result.visibleTools, hiddenToolCount: result.hiddenToolIds?.length, unsupportedRequests: result.unsupportedRequests, connectionsRequiringSeparateAuthorization: result.connectionsRequiringSeparateAuthorization } } : receipt;
    console.log(JSON.stringify(output, null, 2));
  } finally { await client.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Shuug MCP workspace build failed."); process.exitCode = 1; });
