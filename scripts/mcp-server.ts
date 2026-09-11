import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBusinessMcp } from "../src/lib/backend/mcp";
import { setting } from "../src/lib/connections/vault";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const base = new URL(process.env.SHUUG_BACKEND_URL || "http://127.0.0.1:3000");
if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))) throw new Error("Use HTTPS for a remote backend, or HTTP on loopback.");
const token = process.env.SHUUG_BACKEND_TOKEN || setting("BACKEND_ACCESS_TOKEN");
if (!token) throw new Error("Run npm run backend:setup locally, or set SHUUG_BACKEND_TOKEN for a remote backend.");
const server = createBusinessMcp(async (operation, args = {}) => {
  const response = await fetch(new URL("/api/backend", base), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation, arguments: args }), redirect: "error", signal: AbortSignal.timeout(120000) });
  const result = await response.json() as { data?: unknown; error?: string };
  if (!response.ok) throw new Error(result.error || `Backend returned ${response.status}`);
  return result.data;
});
async function main() { await server.connect(new StdioServerTransport()); }
main().catch(error => { console.error(error instanceof Error ? error.message : "MCP startup failed"); process.exitCode = 1; });
