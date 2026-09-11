import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataDirectory, setting, saveSecrets } from "../src/lib/connections/vault";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (!setting("BACKEND_ACCESS_TOKEN")) saveSecrets({ BACKEND_ACCESS_TOKEN: randomBytes(32).toString("hex") });
const dir = dataDirectory(); mkdirSync(dir, { recursive: true, mode: 0o700 });
const config = { mcpServers: { "shuug-business": { command: process.execPath, args: ["--import", path.join(root, "node_modules/tsx/dist/loader.mjs"), path.join(root, "scripts/mcp-server.ts")], env: { DEALDESK_DATA_DIR: dir, SHUUG_BACKEND_URL: process.env.SHUUG_BACKEND_URL || "http://127.0.0.1:3000" } } } };
writeFileSync(path.join(dir, "mcp-client.json"), JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(`Backend authentication configured. MCP client configuration: ${path.join(dir, "mcp-client.json")}. Shopify remains optional. No token was printed.`);

if (process.argv.includes("--print-token")) console.log(setting("BACKEND_ACCESS_TOKEN"));
