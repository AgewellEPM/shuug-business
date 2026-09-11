/** Uses an explicitly supplied, downloaded WordPress + SQLite integration tree.
 * Copies it into a disposable fixture; never opens an existing site's database. */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, cpSync, existsSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeDiningCommand } from "../src/lib/restaurant/dining";
import { emptyDining } from "../src/lib/restaurant/dining-model";
import { saveRestaurantTable } from "../src/lib/restaurant/store";
import { executeRestaurantCommand } from "../src/lib/restaurant/business";
import { randomBytes, randomUUID } from "node:crypto";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { createEmployeeAccount, issueEmployeeInvitation, acceptEmployeeInvitation } from "../src/lib/auth/employees";
import { addMember } from "../src/lib/team/store";
import { assignRole } from "../src/lib/permissions/store";
import { saveSecrets } from "../src/lib/connections/vault";
import { saveWebsitePaymentSettings, websitePaymentSettings } from "../src/lib/website-payments/settings";
import { saveBranding } from "../src/lib/branding/store";
import { saveForm } from "../src/lib/getting-started/store";
import { saveCustomerSettings } from "../src/lib/customer-access/service";
import { createCustomerAccount, issueCustomerInvitation, acceptCustomerInvitation } from "../src/lib/customer-access/accounts";
import { saveBusinessRecord } from "../src/lib/workspace/store";
async function port() { const s = createServer(); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const n = (s.address() as { port: number }).port; await new Promise<void>(r => s.close(() => r())); return n; }
const phpQuote = (s: string) => `'${s.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
async function main() {
  const source = process.argv[2];
  if (!source || !existsSync(path.join(source, "wp-load.php")) || !existsSync(path.join(source, "wp-content/db.php"))) throw new Error("Supply a WordPress source tree with the official SQLite integration drop-in installed. See docs/WORDPRESS.md.");
  if (!existsSync(".next/BUILD_ID")) throw new Error("Run npm run build first.");
  const fixture = mkdtempSync(path.join(tmpdir(), "shuug-wordpress-check-")), wordpress = path.join(fixture, "wordpress"), previous = process.env.DEALDESK_DATA_DIR;
  let backend: ReturnType<typeof spawn> | undefined, php: ReturnType<typeof spawn> | undefined;
  const stop = () => { backend?.kill("SIGTERM"); php?.kill("SIGTERM"); }; process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    cpSync(source, wordpress, { recursive: true, filter: file => !["wp-config.php", "wp-content/database", "wp-content/uploads"].includes(path.relative(source, file).split(path.sep).join("/")) });
    cpSync("integrations/wordpress/shuug-business", path.join(wordpress, "wp-content/plugins/shuug-business"), { recursive: true });
    writeFileSync(path.join(fixture, ".shuug-wordpress-fixture"), "Synthetic data only", { mode: 0o600 });
    const base = `http://127.0.0.1:${await port()}`, password = `Synthetic-${randomBytes(18).toString("hex")}`;
    const constants: Record<string, string | boolean> = { DB_NAME: "synthetic", DB_USER: "synthetic", DB_PASSWORD: "synthetic", DB_HOST: "localhost", DB_CHARSET: "utf8", DB_COLLATE: "", DB_ENGINE: "sqlite", WP_HOME: "http://localhost:8089", WP_SITEURL: "http://localhost:8089", WP_ENVIRONMENT_TYPE: "local", SHUUG_ALLOW_LOCAL_BACKEND: true, DISABLE_WP_CRON: true, AUTOMATIC_UPDATER_DISABLED: true, WP_HTTP_BLOCK_EXTERNAL: true, WP_ACCESSIBLE_HOSTS: "127.0.0.1,localhost", WP_DEBUG: false };
    for (const key of ["AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY", "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT"]) constants[key] = randomBytes(32).toString("hex");
    writeFileSync(path.join(wordpress, "wp-config.php"), `<?php\n${Object.entries(constants).map(([k, v]) => `define(${phpQuote(k)}, ${typeof v === "boolean" ? String(v) : phpQuote(v)});`).join("\n")}\n$table_prefix='wp_';\nif (!defined('ABSPATH')) define('ABSPATH', __DIR__.'/');\nrequire_once ABSPATH.'wp-settings.php';`, { mode: 0o600 });
    process.env.DEALDESK_DATA_DIR = path.join(fixture, "backend-data");
    configureOwnerPassword(password); saveBranding({ organizationTypes: ["service", "nonprofit"] });
    saveSecrets({ APP_BASE_URL: base, STRIPE_SECRET_KEY: "sk_test_syntheticfixture", STRIPE_WEBHOOK_SECRET: "whsec_syntheticfixture" });
    saveWebsitePaymentSettings({ ...websitePaymentSettings(), invoiceEnabled: true, donationsEnabled: true });
    const kitchenOffset = new Date().getUTCHours() - 12, kitchenTimezone = `Etc/GMT${kitchenOffset >= 0 ? "+" : "-"}${Math.abs(kitchenOffset)}`;
    executeRestaurantCommand({ requestId: randomUUID(), action: "configure", input: { name: "WP Kitchen", timezone: kitchenTimezone, taxBasisPoints: 0, taxReviewed: true, businessDayStartHour: 0 } }, "Synthetic owner");
    executeRestaurantCommand({ requestId: randomUUID(), action: "website.configure", input: { revision: 1, enabled: true, origins: [], instructions: "Pay on pickup at the restaurant." } }, "Synthetic owner");
    const restaurant = (action: string, input: unknown) => executeRestaurantCommand({ requestId: randomUUID(), action, input }, "Synthetic owner");
    const stockDate = new Date().toISOString().slice(0, 10), supplier = restaurant("supplier.save", { name: "WP supplier", email: "", phone: "", active: true }).id;
    const ingredient = restaurant("ingredient.save", { name: "WP rice", unit: "g", reorderAt: 0, targetStock: 1000, supplierId: supplier, active: true }).id;
    restaurant("receive", { supplierId: supplier, invoiceReference: "WP-STOCK", date: stockDate, purchaseId: null, lines: [{ ingredientId: ingredient, quantity: 1000, cost: 1000, expires: null }] });
    const menu = restaurant("menu.save", { name: "WordPress rice bowl", category: "Main", price: 1000, station: "Line", description: "Synthetic bowl", allergens: "Reviewed by fixture kitchen", recipe: [{ ingredientId: ingredient, quantity: 100 }], active: true }).id;
    restaurant("pickup.save", { at: new Date(Date.now() + 3600000).toISOString(), capacity: 20, enabled: true });
    const special = restaurant("special.save", { name: "WordPress bowl offer", code: "WP10", description: "Synthetic ten percent bowl offer.", startDate: stockDate, endDate: stockDate, weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "00:00", overnight: true, channels: ["online"], menuIds: [menu], discountBasisPoints: 1000, minimumFoodContribution: 500, maxOrders: 20, maxOrdersPerDate: 20, discountBudget: 2000, advertisingBudget: 0 });
    restaurant("special.publish", { id: special.id, revision: 1, reviewed: true });
    const diningTable = saveRestaurantTable({ name: "WP table", seats: 4, area: "Main" });
    executeDiningCommand({ requestId: randomUUID(), action: "settings.save", input: { ...emptyDining().settings, enabled: true, tableIds: [diningTable.id], weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: "11:00", end: "23:00", overnight: false })) } }, "Synthetic owner", true);
    saveCustomerSettings({ enabled: true, pricing: true, ordering: true, orderStatus: true, servicePortal: true, booking: true });
    const websiteForm = saveForm({ title: "WordPress contact", kind: "contact", enabled: true, origins: ["http://localhost:8089"] });
    const client = saveBusinessRecord({ kind: "client", title: "WordPress customer", fields: { email: "website-customer@example.test" } }, "Synthetic owner");
    const customer = createCustomerAccount({ name: "WordPress customer", email: "website-customer@example.test", customerId: null, clientId: client.id }); acceptCustomerInvitation(issueCustomerInvitation(customer.id), password);
    function account(name: string) { const member = addMember({ name, email: `${name}@example.test`, role: "Employee" }); assignRole(member.id, "Employee"); const user = createEmployeeAccount({ memberId: member.id, name, email: member.email }); acceptEmployeeInvitation(issueEmployeeInvitation(user.id), password); return user; }
    const alice = account("wordpress-alice"), bob = account("wordpress-bob"), env = { ...process.env };
    for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) if (existsSync(file)) for (const line of readFileSync(file, "utf8").split("\n")) { const key = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1]; if (key) env[key] = ""; }
    Object.assign(env, { NODE_ENV: "production", APP_BASE_URL: base, DEALDESK_DATA_DIR: process.env.DEALDESK_DATA_DIR, DEMO_DATA: "false", DATABASE_URL: "", AUTH_ENABLED: "true", WORKSPACE_ACCESS_TOKEN: "", PPC_WORKSPACE_ACCESS_TOKEN: "" });
    backend = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", new URL(base).port], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = ""; backend.stdout?.on("data", b => { log = (log + b).slice(-3000); }); backend.stderr?.on("data", b => { log = (log + b).slice(-3000); });
    let ready = false;
    for (let i = 0; i < 50; i++) { try { await fetch(base + "/api/auth/login", { signal: AbortSignal.timeout(2000) }); ready = true; break; } catch { if (backend.exitCode !== null) throw new Error(`Backend failed: ${log}`); await new Promise(r => setTimeout(r, 200)); } }
    if (!ready) throw new Error("Backend did not start.");
    for (const resume of [false, true]) {
    php = spawn("php", ["scripts/wordpress-runtime-check.php"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = ""; php.stdout?.on("data", b => { output += b; }); php.stderr?.on("data", b => { errors += b; });
    php.stdin?.end(JSON.stringify({ resume, root: wordpress, backend: base, password, websiteFormId: websiteForm.id, customerEmail: customer.email, aliceMember: alice.memberId, aliceId: alice.id, aliceEmail: alice.email, bobMember: bob.memberId, bobEmail: bob.email }));
    const code = await new Promise<number | null>((resolve, reject) => { const timeout = setTimeout(() => { php?.kill("SIGTERM"); reject(new Error("WordPress check timed out.")); }, 120000); php!.once("exit", c => { clearTimeout(timeout); resolve(c); }); php!.once("error", reject); });
    if (code !== 0) throw new Error(`WordPress runtime check failed: ${errors.slice(-5000)} ${output.slice(-1000)}`);
    const result = JSON.parse(output); if (!result.ok) throw new Error("WordPress did not report a successful check."); console.log(JSON.stringify(result));
    }
  } finally {
    stop();
    for (const child of [php, backend]) if (child && child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => { const timer = setTimeout(() => child.kill("SIGKILL"), 5000); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
    if (previous === undefined) delete process.env.DEALDESK_DATA_DIR; else process.env.DEALDESK_DATA_DIR = previous;
    rmSync(fixture, { recursive: true, force: true }); console.log(JSON.stringify({ cleanup: "complete", backendPid: backend?.pid, phpPid: php?.pid }));
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "WordPress check failed."); process.exitCode = 1; });
