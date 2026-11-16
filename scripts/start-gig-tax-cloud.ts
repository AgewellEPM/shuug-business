/** First boot of a dedicated empty qualification volume; never imports client data. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setting, saveSecrets } from "../src/lib/connections/vault";
import { getBranding } from "../src/lib/branding/store";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveCustomerSettings } from "../src/lib/customer-access/service";

const directory = process.env.DEALDESK_DATA_DIR;
assert(directory && path.isAbsolute(directory) && directory !== "/", "Dedicated persistent data directory required.");
assert(process.env.AUTH_ENABLED === "true" && process.env.DEMO_DATA === "false", "Authentication must be enabled; demo seeding is forbidden.");
const origin = new URL(process.env.APP_BASE_URL || "");
assert(origin.protocol === "https:" && origin.hostname.endsWith(".up.railway.app")
  && !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash,
  "Verified Railway HTTPS origin required.");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const marker = path.join(directory, "cloud-installation.json");
if (!existsSync(marker)) {
  assert(readdirSync(directory).length === 0, "Refusing to initialize an existing workspace.");
  const ownerHash = process.env.GIGTAX_INITIAL_OWNER_HASH;
  assert(ownerHash && /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(ownerHash), "Private first-boot owner hash required.");
  // An interrupted setup stays explicitly incomplete and cannot replace real data.
  writeFileSync(marker, JSON.stringify({ version: 1, origin: origin.origin, status: "initializing", qualificationOnly: true }), { mode: 0o600, flag: "wx" });
  saveSecrets({ WORKSPACE_OWNER_PASSWORD_HASH: ownerHash, APP_BASE_URL: origin.origin });
  importBusinessTemplate(gigTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  writeFileSync(marker, JSON.stringify({ version: 1, origin: origin.origin, status: "ready", qualificationOnly: true }), { mode: 0o600 });
}
const installed = JSON.parse(readFileSync(marker, "utf8"));
assert(installed.version === 1 && installed.status === "ready" && installed.origin === origin.origin
  && installed.qualificationOnly === true, "Existing cloud installation needs review; no data was replaced.");
assert(setting("WORKSPACE_OWNER_PASSWORD_HASH") && getBranding().industrySetup?.industryId === "tax-firm", "Existing setup is incomplete.");
delete process.env.GIGTAX_INITIAL_OWNER_HASH;
const port = process.env.PORT || "3000";
assert(/^\d+$/.test(port) && Number(port) > 0 && Number(port) < 65536, "Invalid listener port.");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", port], {
  stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=640" },
});
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Workspace process could not start."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 0; });
