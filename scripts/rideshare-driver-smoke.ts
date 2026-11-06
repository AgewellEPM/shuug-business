/** Real compiled HTTP + native Swift transport proof. Only disposable synthetic accounts. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { rideshareTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../src/lib/customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, setCustomerEnabled } from "../src/lib/customer-access/accounts";

async function main() {
  assert(existsSync(".next/BUILD_ID"), "Build the actual backend first.");
  const binary = process.argv[2]; assert(binary?.startsWith("/private/tmp/") && existsSync(binary), "Provide the compiled native proof binary from this task's temporary build.");
  const directory = mkdtempSync(path.join(tmpdir(), "shuug-driver-http-"));
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<unknown> | undefined, helperPid: number | undefined;
  const previous = { ...process.env }; let stopped = false;
  try {
    const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = (listener.address() as { port: number }).port; await new Promise<void>(resolve => listener.close(() => resolve()));
    const base = `http://127.0.0.1:${port}`;
    Object.assign(process.env, { DEALDESK_DATA_DIR: directory, APP_BASE_URL: base, AUTH_ENABLED: "true", DEMO_DATA: "false", DATABASE_URL: "", NEXT_TELEMETRY_DISABLED: "1", PLAID_CLIENT_ID: "", PLAID_SECRET: "", PLAID_LIVE_ENABLED: "false" });
    const ownerPassword = "Synthetic-native-owner-password";
    configureOwnerPassword(ownerPassword); importBusinessTemplate(rideshareTaxProsTemplate);
    saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
    for (const name of ["alpha", "beta"]) {
      const client = saveBusinessRecord({ kind: "client", title: `Native ${name} fixture`, fields: { email: `ios.${name}@example.com` } }, "Synthetic owner");
      const account = await createLinkedCustomer({ name: `Native ${name}`, email: `ios.${name}@example.com`, customerId: null, clientId: client.id });
      acceptCustomerInvitation(issueCustomerInvitation(account.id), "Synthetic-native-driver-password");
    }
    let output = "";
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
    helperPid = child.pid; assert(helperPid);
    closed = new Promise(resolve => child!.once("close", resolve));
    child.stdout?.on("data", bytes => { output = (output + bytes).slice(-8000); }); child.stderr?.on("data", bytes => { output = (output + bytes).slice(-8000); });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error("The owned backend exited before becoming ready.");
      try { if ((await fetch(base + "/api/auth/login", { signal: AbortSignal.timeout(800) })).ok) { ready = true; break; } } catch {}
      await pause(200);
    }
    assert(ready, "The compiled fixture server did not become ready.");
    const native = await promisify(execFile)(binary, [base], { timeout: 90_000 });
    const proof = JSON.parse(native.stdout.trim()); assert(proof.ok && proof.checks.length === 20);
    const form = await fetch(base + "/api/auth/login"), html = await form.text();
    const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)?.[1]; assert(csrf);
    const owner = await fetch(base + "/api/auth/login", { method: "POST", redirect: "manual", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", cookie: form.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") }, body: new URLSearchParams({ csrf, password: ownerPassword }) });
    assert.equal(owner.status, 303); const cookie = owner.headers.getSetCookie().find(c => c.startsWith("dd_session="))?.split(";")[0]; assert(cookie);
    const staff = await fetch(base + "/rideshare", { headers: { cookie } });
    assert.equal(staff.status, 200); const staffHtml = await staff.text(); assert(staffHtml.includes("Native fixture fuel") && staffHtml.includes("Native fixture payout") && staffHtml.includes("Private receipt"));
    assert(staffHtml.includes("Native fixture participants") && staffHtml.includes("Native fixture vehicle") && staffHtml.includes("12,345.6") && staffHtml.includes("Meals &amp; food"));
    const receiptPath = staffHtml.match(/href="(\/api\/rideshare\/receipts\/[^\"]+)"/)?.[1]; assert(receiptPath);
    const staffReceipt = await fetch(base + receiptPath, { headers: { cookie } }); assert.equal(staffReceipt.status, 200); assert.equal(staffReceipt.headers.get("content-type"), "image/png");
    const anonymous = await fetch(base + "/rideshare", { redirect: "manual" }); assert([303, 307].includes(anonymous.status));
    const rewardPage = await fetch(base + "/rideshare/referrals", { headers: { cookie } });
    assert.equal(rewardPage.status, 200); const rewardHtml = await rewardPage.text();
    assert(rewardHtml.includes("pending") && rewardHtml.includes("first paid"));
    const noSession = await fetch(base + "/api/website/customer/driver/records"); assert.equal(noSession.status, 401);
    const crossOrigin = await fetch(base + "/api/website/customer/driver/session", { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "application/json" }, body: JSON.stringify({ email: "ios.alpha@example.com", password: "Synthetic-native-driver-password" }) }); assert.equal(crossOrigin.status, 403);
    const renewed = await fetch(base + "/api/website/customer/driver/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "ios.alpha@example.com", password: "Synthetic-native-driver-password" }) }); assert.equal(renewed.status, 200); const session = await renewed.json();
    setCustomerEnabled(session.account.id, false);
    const revoked = await fetch(base + "/api/website/customer/driver/records", { headers: { Authorization: `Bearer ${session.token}` } }); assert.equal(revoked.status, 401);
    proof.checks.push("compiled staff review and private receipt", "anonymous staff denial", "compiled API origin enforcement", "immediate account revocation");
    if (child.exitCode === null) child.kill("SIGTERM"); await closed; stopped = true;
    console.log(JSON.stringify({ ...proof, verifiedAt: new Date().toISOString(), buildId: readFileSync(".next/BUILD_ID", "utf8").trim(), helperPid, diagnosticServerStopped: true, physicalIPhone: "Not established by this loopback transport proof; Luke deferred phone testing." }, null, 2));
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM"); await Promise.race([closed, pause(4000, undefined, { ref: false })]);
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; }
    }
    if (helperPid) { let running = false; try { process.kill(helperPid, 0); running = true; } catch {} assert(!running, "The owned diagnostic server remains running."); }
    rmSync(directory, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Native driver HTTP verification failed."); process.exitCode = 1; });
