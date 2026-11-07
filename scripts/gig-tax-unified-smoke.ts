/** Compiled HTTP proof of one account across app, portal, staff and restored storage. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../src/lib/customer-access/service";
import { issueCustomerInvitation, setCustomerEnabled } from "../src/lib/customer-access/accounts";
import { addRecord } from "../src/lib/sdk/records";
import { moduleById } from "../src/lib/sdk/registry";
import { backupWorkspace, restoreWorkspace } from "../src/lib/workspace/backup";

async function main() {
  assert(existsSync(".next/BUILD_ID"), "Build the integrated application first.");
  const scratch = mkdtempSync(path.join(tmpdir(), "gig-tax-unified-"));
  const original = path.join(scratch, "original"), restored = path.join(scratch, "restored");
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`, password = `Synthetic-only-${randomUUID()}`;
  Object.assign(process.env, { DEALDESK_DATA_DIR: original, APP_BASE_URL: base, AUTH_ENABLED: "true", DEMO_DATA: "false", DATABASE_URL: "", NEXT_TELEMETRY_DISABLED: "1" });
  const checks: string[] = [], pids: number[] = [];
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<unknown> | undefined;
  const request = (route: string, init: RequestInit = {}) => fetch(base + route, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const headers = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM"); await Promise.race([closed, pause(4000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; }
    }
    child = undefined;
  }
  async function start(directory: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DEALDESK_DATA_DIR: directory, WORKSPACE_ACCESS_TOKEN: "", PPC_WORKSPACE_ACCESS_TOKEN: "", PLAID_CLIENT_ID: "", PLAID_SECRET: "", PLAID_LIVE_ENABLED: "false" };
    const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    child = server;
    if (server.pid) pids.push(server.pid);
    let logs = ""; server.stdout?.on("data", b => { logs = (logs + b).slice(-4000); }); server.stderr?.on("data", b => { logs = (logs + b).slice(-4000); });
    closed = new Promise(resolve => server.once("close", resolve));
    for (let attempt = 0; attempt < 120; attempt++) {
      assert(server.exitCode === null, `Owned server exited: ${logs}`);
      try { if ((await request("/api/website/customer/driver/health")).status === 200) return; } catch {}
      await pause(200);
    }
    throw new Error(`Compiled backend did not become ready: ${logs}`);
  }
  const post = (body: Record<string, string>, cookie = "") => request("/api/website/customer", {
    method: "POST", headers: { Origin: base, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body),
  });
  const cookieFor = (response: Response, name: string) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(";")[0];
  try {
    importBusinessTemplate(gigTaxProsTemplate); configureOwnerPassword(password);
    saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
    const clients = ["Alpha", "Beta"].map(name => saveBusinessRecord({ kind: "client", title: `Unified ${name}`, fields: { email: `${name.toLowerCase()}@example.com` } }, "Synthetic owner"));
    const accounts = await Promise.all(clients.map(client => createLinkedCustomer({ name: client.title, email: client.fields.email, customerId: null, clientId: client.id })));
    const invites = accounts.map(account => issueCustomerInvitation(account.id));
    const engagement = addRecord("tax-engagements", moduleById("tax-engagements")!.fields, { name: "Unified 2026 tax preparation", client_id: clients[0].id, tax_year: 2026, stage: "Awaiting documents", client_visible: true });
    const document = addRecord("tax-document-requests", moduleById("tax-document-requests")!.fields, { name: "Unified requested tax document", client_id: clients[0].id, engagement_id: engagement.id, status: "Requested", client_visible: true });
    await start(original);
    const health = await request("/api/website/customer/driver/health"); assert.deepEqual(await health.json(), { service: "gig-tax-pros-workspace", apiVersion: 1, ready: true });
    const sessions: string[] = [], tokens: string[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const activate = await post({ action: "activate", invite: invites[i], password, confirmation: password });
      assert.equal(activate.status, 303, "Invitation should activate and sign in in one step.");
      const cookie = cookieFor(activate, "shuug_customer"); assert(cookie); sessions.push(cookie);
      const native = await request("/api/website/customer/driver/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: accounts[i].email, password }) });
      assert.equal(native.status, 200); const reply = await native.json(); assert.equal(reply.account.id, accounts[i].id); assert.equal(reply.branding.name, "Gig Tax Pros"); tokens.push(reply.token);
    }
    checks.push("two invitation activations sign in directly; web and native sessions share the exact client identity");
    const receiptId = randomUUID(), png = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");
    const receiptRoute = `/api/website/customer/driver/receipts/${receiptId}`;
    const upload = await request(receiptRoute, { method: "PUT", headers: headers(tokens[0]), body: png }); assert.equal(upload.status, 200);
    const trip = { id: randomUUID(), revision: 0, deleted: false, kind: "trip", body: { startedAt: "2026-11-07T05:00:00Z", endedAt: "2026-11-07T05:20:00Z", localDate: "2026-11-07", timeZoneId: "America/New_York", distanceMeters: 3218.688, classification: "business", purpose: "Unified trip", notes: "", source: "manual", hasGaps: false, sampleCount: 0 } };
    const expense = { id: randomUUID(), revision: 0, deleted: false, kind: "expense", body: { date: "2026-11-07", merchant: "Unified fuel", category: "fuel", amountCents: 2300, currency: "USD", classification: "business", notes: "", receiptId } };
    const income = { id: randomUUID(), revision: 0, deleted: false, kind: "income", body: { date: "2026-11-07", platform: "uber", description: "Unified payout", amountCents: 12500, currency: "USD", notes: "" } };
    const mutations = [trip, expense, income].map(record => ({ mutationId: randomUUID(), record }));
    for (const mutation of mutations) { const response = await request("/api/website/customer/driver/records", { method: "POST", headers: headers(tokens[0]), body: JSON.stringify(mutation) }); assert.equal(response.status, 200); }
    const alphaPage = await (await request("/api/website/customer/driver/records", { headers: headers(tokens[0]) })).json(); assert.equal(alphaPage.records.length, 3);
    const betaPage = await (await request("/api/website/customer/driver/records", { headers: headers(tokens[1]) })).json(); assert.equal(betaPage.records.length, 0);
    const retry = await request("/api/website/customer/driver/records", { method: "POST", headers: headers(tokens[0]), body: JSON.stringify(mutations[0]) }); assert.equal(retry.status, 200);
    const stale = await request("/api/website/customer/driver/records", { method: "POST", headers: headers(tokens[0]), body: JSON.stringify({ ...mutations[0], mutationId: randomUUID() }) }); assert.equal(stale.status, 409);
    checks.push("native API stores trips, expenses, income and receipt; retry is idempotent and stale overwrite is rejected");
    const dashboard = () => request("/api/website/customer?year=2026", { headers: { Cookie: sessions[0] } });
    let portal = await dashboard(), html = await portal.text(); assert.equal(portal.status, 200);
    for (const label of ["Unified fuel", "Unified payout", "Unified trip", "Unified 2026 tax preparation"]) assert(html.includes(label), `Missing shared account data: ${label}`);
    const beta = await request(`/api/website/customer?year=2026&client_id=${clients[0].id}`, { headers: { Cookie: sessions[1] } }); const betaHtml = await beta.text(); assert(!betaHtml.includes("Unified fuel") && !betaHtml.includes("Unified 2026 tax preparation"));
    const receipt = await request(receiptRoute, { headers: { Cookie: sessions[0] } }); assert.equal(receipt.status, 200); assert.deepEqual(Buffer.from(await receipt.arrayBuffer()), png);
    assert.equal((await request(receiptRoute, { headers: { Cookie: sessions[1] } })).status, 404);
    checks.push("client portal shows own exact synced records; forged client selection and foreign receipt access cannot cross accounts");
    const loginForm = await request("/api/auth/login"), loginHtml = await loginForm.text(); const csrf = loginHtml.match(/name="csrf" value="([a-f0-9]+)"/)?.[1]; assert(csrf);
    const owner = await request("/api/auth/login", { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", Cookie: loginForm.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") }, body: new URLSearchParams({ csrf, password }) });
    assert.equal(owner.status, 303); const ownerCookie = cookieFor(owner, "dd_session"); assert(ownerCookie);
    const staff = await request("/rideshare", { headers: { Cookie: ownerCookie } }); assert.equal(staff.status, 200); const staffHtml = await staff.text(); assert(staffHtml.includes("Unified fuel") && staffHtml.includes("Unified payout"));
    assert.equal((await request("/api/setup/customers", { headers: { Cookie: sessions[0] } })).status, 403);
    checks.push("authorized tax staff sees those same records; client cannot administer accounts");
    const pdf = Buffer.from("%PDF-1.4\nSynthetic unified tax document\n%%EOF\n");
    const form = new FormData(); form.set("requestId", document.id); form.set("file", new Blob([pdf], { type: "application/pdf" }), "platform-summary.pdf");
    const submitted = await request("/api/website/customer/documents", { method: "POST", headers: { Origin: base, Cookie: sessions[0], Accept: "application/json" }, body: form });
    assert.equal(submitted.status, 201); const submittedDocument = (await submitted.json()).document;
    assert.equal(submittedDocument.status, "received");
    const documentRoute = `/api/website/customer/documents/${submittedDocument.id}`;
    const privateDocument = await request(documentRoute, { headers: { Cookie: sessions[0] } }); assert.equal(privateDocument.status, 200); assert.deepEqual(Buffer.from(await privateDocument.arrayBuffer()), pdf);
    assert.equal((await request(documentRoute, { headers: { Cookie: sessions[1] } })).status, 404);
    const foreignForm = new FormData(); foreignForm.set("requestId", document.id); foreignForm.set("file", new Blob([pdf], { type: "application/pdf" }), "foreign.pdf");
    assert.equal((await request("/api/website/customer/documents", { method: "POST", headers: { Origin: base, Cookie: sessions[1], Accept: "application/json" }, body: foreignForm })).status, 404);
    const staffDocument = await request(`/api/tax-documents/${submittedDocument.id}`, { headers: { Cookie: ownerCookie } }); assert.equal(staffDocument.status, 200); assert.deepEqual(Buffer.from(await staffDocument.arrayBuffer()), pdf);
    const review = await request(`/api/tax-documents/${submittedDocument.id}`, { method: "POST", headers: { Cookie: ownerCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ status: "reviewed" }) }); assert.equal(review.status, 200);
    checks.push("client submits a requested private tax document, foreign account is denied, authorized staff downloads identical bytes and records review");
    await stop(); await start(original);
    assert((await (await dashboard()).text()).includes("Unified fuel"));
    checks.push("client account, session and shared journal persist across a real server restart");
    await stop();
    const backup = backupWorkspace(original, path.join(scratch, "backup"));
    restoreWorkspace(path.join(scratch, "backup"), restored); await start(restored);
    assert((await (await dashboard()).text()).includes("Unified payout"));
    const recovered = await request(receiptRoute, { headers: { Cookie: sessions[0] } }); assert.equal(recovered.status, 200); assert.deepEqual(Buffer.from(await recovered.arrayBuffer()), png);
    assert.equal((await request("/api/website/customer/driver/records", { headers: headers(tokens[0]) })).status, 200);
    const recoveredDocument = await request(documentRoute, { headers: { Cookie: sessions[0] } }); assert.equal(recoveredDocument.status, 200); assert.deepEqual(Buffer.from(await recoveredDocument.arrayBuffer()), pdf);
    checks.push("verified full-volume backup restores account, web/native sessions, journal, receipt and requested tax-document bytes");
    process.env.DEALDESK_DATA_DIR = restored; setCustomerEnabled(accounts[0].id, false);
    assert.equal((await request("/api/website/customer/driver/records", { headers: headers(tokens[0]) })).status, 401);
    assert((await (await dashboard()).text()).includes("Client sign-in"));
    checks.push("revoking one account immediately removes app and portal access after recovery");
    await stop();
    for (const pid of pids) { let live = false; try { process.kill(pid, 0); live = true; } catch {} assert(!live, "Owned diagnostic server remains running."); }
    console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), buildId: readFileSync(".next/BUILD_ID", "utf8").trim(), scope: "Compiled production HTTP with disposable synthetic accounts and real restart/restore", checks, backupFiles: backup.files, receiptSha256: createHash("sha256").update(png).digest("hex"), diagnosticServersStopped: true, realClientDataUsed: false, publicHostingVerified: false, visualAcceptance: "Pending Luke screenshots" }, null, 2));
  } finally { await stop(); rmSync(scratch, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
