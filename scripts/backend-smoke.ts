import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { setting } from "../src/lib/connections/vault";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const base = new URL(process.env.SHUUG_BACKEND_URL || "http://127.0.0.1:3000");
if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))) throw new Error("Use HTTPS for a remote backend, or HTTP on loopback.");
const token = process.env.SHUUG_BACKEND_TOKEN || setting("BACKEND_ACCESS_TOKEN");
if (!token) throw new Error("Run npm run backend:setup first.");
async function verify(client: Client) {
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 39);
  for (const name of ["expense_catalog", "receivable_catalog", "account_catalog", "journal_catalog", "dining_catalog", "restaurant_catalog", "schedule_catalog", "restaurant_report"]) assert.notEqual((await client.callTool({ name, arguments: {} })).isError, true);
  for (const resource of ["expense-accounting", "receivables", "accounts", "accounting-journal", "accounting-manual", "auto-repair-inspections", "auto-repair-pricing", "vehicles", "restaurant-credits", "restaurant-stocktakes", "restaurant-specials", "restaurant-dining", "restaurant", "restaurant-accounting", "staff-schedule"]) { const result = await client.callTool({ name: "business_read", arguments: { resource } }); assert.notEqual(result.isError, true, `business_read ${resource} failed: ${JSON.stringify(result.content)}`); }
  const result = await client.callTool({ name: "shopify_status", arguments: {} });
  assert.notEqual(result.isError, true);
  const text = result.content as { type: string; text: string }[];
  assert.equal(JSON.parse(text[0].text).optional, true);
  assert.notEqual((await client.callTool({ name: "business_read", arguments: { resource: "features" } })).isError, true);
  const resource = await client.readResource({ uri: "shuug://capabilities" });
  const content = resource.contents[0];
  assert.ok(content && "text" in content);
  assert.equal(JSON.parse(content.text).shopifyRequired, false);
}
async function main() {
  const denied = await fetch(new URL("/api/backend", base), { headers: { Authorization: "Bearer deliberately-invalid" }, signal: AbortSignal.timeout(60000) });
  assert.equal(denied.status, 401);
  const response = await fetch(new URL("/api/backend", base), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).shopifyRequired, false);
  const http = new Client({ name: "shuug-http-smoke", version: "1" });
  try { await http.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", base), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })); await verify(http); }
  finally { await http.close(); }
  const stdio = new Client({ name: "shuug-stdio-smoke", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(root, "node_modules/tsx/dist/loader.mjs"), path.join(root, "scripts/mcp-server.ts")], cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")), SHUUG_BACKEND_URL: base.origin, SHUUG_BACKEND_TOKEN: token }, stderr: "inherit" });
  try { await stdio.connect(transport); await verify(stdio); }
  finally { await stdio.close(); }
  console.log("Live backend authentication, Streamable HTTP MCP, stdio MCP, 39 tools, business reads and standalone Shopify status passed. No store changes were made.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Backend smoke failed"); process.exitCode = 1; });
