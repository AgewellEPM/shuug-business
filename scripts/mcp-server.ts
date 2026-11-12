import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBusinessMcp } from "../src/lib/backend/mcp";
import { setting } from "../src/lib/connections/vault";
import { createSalesConnection } from "./sales/mcp-connection";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const base = new URL(process.env.SHUUG_BACKEND_URL || "http://127.0.0.1:3000");
if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))) throw new Error("Use HTTPS for a remote backend, or HTTP on loopback.");
const salesOnly = process.env.SHUUG_SALES_ONLY === "true";
const token = salesOnly ? "" : process.env.SHUUG_BACKEND_TOKEN || setting("BACKEND_ACCESS_TOKEN");
const salesInvoke = process.env.GIGTAX_SALES_ORIGIN && process.env.GIGTAX_SALES_CODE_FILE ? createSalesConnection({ origin: process.env.GIGTAX_SALES_ORIGIN, codeFile: process.env.GIGTAX_SALES_CODE_FILE, email: process.env.GIGTAX_SALES_EMAIL }) : undefined;
if (!salesOnly && !token) throw new Error("Run npm run backend:setup locally, or set SHUUG_BACKEND_TOKEN for a remote backend.");
const server = createBusinessMcp(async (operation, args = {}) => {
  const response = await fetch(new URL("/api/backend", base), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation, arguments: args }), redirect: "error", signal: AbortSignal.timeout(120000) });
  const result = await response.json() as { data?: unknown; error?: string };
  if (!response.ok) throw new Error(result.error || `Backend returned ${response.status}`);
  return result.data;
}, { salesInvoke, salesOnly });
async function main() { await server.connect(new StdioServerTransport()); }
main().catch(error => { console.error(error instanceof Error ? error.message : "MCP startup failed"); process.exitCode = 1; });
