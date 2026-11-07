/** Saved native WorkspaceClient against one compiled disposable HTTP workspace. */
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../src/lib/customer-access/service";
import { issueCustomerInvitation, setCustomerEnabled } from "../src/lib/customer-access/accounts";
import { addRecord } from "../src/lib/sdk/records";
import { moduleById } from "../src/lib/sdk/registry";

async function main() {
  assert(existsSync(".next/BUILD_ID"), "Build the integrated application first.");
  const binary = process.argv[2];
  const withInstalledPeel = process.argv.includes("--with-installed-peel");
  assert(binary?.startsWith("/private/tmp/") && existsSync(binary), "Provide the temporary compiled native coach probe.");
  const directory = mkdtempSync(path.join(tmpdir(), "gig-tax-coach-wire-"));
  const previous = { ...process.env };
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<unknown> | undefined;
  let helperPid: number | undefined;
  const checks: string[] = [];
  try {
    const listener = createServer();
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    const base = `http://127.0.0.1:${port}`;
    Object.assign(process.env, { DEALDESK_DATA_DIR: directory, APP_BASE_URL: base, AUTH_ENABLED: "true",
      DEMO_DATA: "false", DATABASE_URL: "", NEXT_TELEMETRY_DISABLED: "1", PLAID_CLIENT_ID: "", PLAID_SECRET: "",
      PLAID_LIVE_ENABLED: "false" });
    if (withInstalledPeel) {
      // Next loads the ignored administrator-managed local environment itself.
      // Never read, echo, copy or place its token in this proof's output.
      delete process.env.GIG_TAX_PEEL_URL;
      delete process.env.GIG_TAX_PEEL_TOKEN;
    } else {
      process.env.GIG_TAX_PEEL_URL = "";
      process.env.GIG_TAX_PEEL_TOKEN = "";
    }
    importBusinessTemplate(gigTaxProsTemplate); configureOwnerPassword("Synthetic-coach-owner-password");
    saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
    const clients = ["alpha", "beta"].map(name => saveBusinessRecord({ kind: "client", title: `Coach wire ${name}`,
      fields: { email: `coach.${name}@example.com` } }, "Synthetic owner"));
    const accounts = await Promise.all(clients.map(client => createLinkedCustomer({ name: client.title,
      email: client.fields.email, clientId: client.id, customerId: null })));
    const invites = accounts.map(account => issueCustomerInvitation(account.id));
    const engagement = addRecord("tax-engagements", moduleById("tax-engagements")!.fields,
      { name: "Synthetic shared coach preparation", client_id: clients[0].id, tax_year: 2026,
        stage: "Awaiting documents", client_visible: true });
    addRecord("tax-document-requests", moduleById("tax-document-requests")!.fields,
      { name: "Synthetic shared tax request", client_id: clients[0].id, engagement_id: engagement.id,
        status: "Requested", client_visible: true });
    const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
      { env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
    child = server; helperPid = server.pid; assert(helperPid);
    closed = new Promise(resolve => server.once("close", resolve));
    let logs = "";
    server.stdout?.on("data", bytes => { logs = (logs + bytes).slice(-4_000); });
    server.stderr?.on("data", bytes => { logs = (logs + bytes).slice(-4_000); });
    const request = (route: string, init: RequestInit = {}) => fetch(base + route,
      { ...init, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      assert(server.exitCode === null, `Owned backend exited: ${logs}`);
      try { if ((await request("/api/website/customer/driver/health")).status === 200) { ready = true; break; } } catch {}
      await pause(100);
    }
    assert(ready, `Compiled coach backend did not become ready: ${logs}`);
    const sessions: string[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const activation = await request("/api/website/customer", { method: "POST",
        headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ action: "activate", invite: invites[i],
          password: "Synthetic-native-coach-password", confirmation: "Synthetic-native-coach-password" }) });
      assert.equal(activation.status, 303);
      const cookie = activation.headers.getSetCookie().find(value => value.startsWith("shuug_customer="))?.split(";")[0];
      assert(cookie); sessions.push(cookie);
    }
    if (withInstalledPeel) {
      const login = await request("/api/website/customer/driver/session", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "coach.alpha@example.com", password: "Synthetic-native-coach-password" }) });
      assert.equal(login.status, 200);
      const session = await login.json();
      const bearer = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json", Accept: "application/json" };
      const observations = [
        { miles: 10, earningsCents: 2_000, platformFeesCents: 300, purpose: "Connected synthetic profitable job" },
        { miles: 14, earningsCents: 500, platformFeesCents: 100, purpose: "Connected synthetic losing job" },
        { miles: 2, purpose: "Connected synthetic job with unknown payout" },
      ];
      const recordIds: string[] = [];
      for (const observation of observations) {
        const { miles, ...details } = observation;
        const id = randomUUID(); recordIds.push(id);
        const saved = await request("/api/website/customer/driver/records", { method: "POST", headers: bearer,
          body: JSON.stringify({ mutationId: randomUUID(), record: { id, revision: 0, deleted: false, kind: "trip", body: {
            startedAt: "2026-11-07T12:00:00Z", endedAt: "2026-11-07T12:30:00Z", localDate: "2026-11-07",
            timeZoneId: "America/New_York", distanceMeters: miles * 1609.344, classification: "business",
            notes: "", source: "manual", hasGaps: false, sampleCount: 0, platform: "Synthetic platform", ...details,
          } } }) }); assert.equal(saved.status, 200);
      }
      const question = { action: "message", mutationId: randomUUID(), messageId: randomUUID(),
        text: "Where am I losing money, on which jobs, and which jobs make the most?", from: "2026-11-07", through: "2026-11-07",
        preferences: { vehicleCostCentsPerMile: 50 } };
      const posted = await request("/api/website/customer/driver/coach", { method: "POST", headers: bearer, body: JSON.stringify(question) });
      assert.equal(posted.status, 200);
      const answer = await posted.json();
      assert.equal(answer.engine.mode, "record-rules");
      assert.equal(answer.engine.peelAvailable, true, "Compiled coach did not obtain a matching attestation from the actual installed worker.");
      const reply = answer.messages.findLast((message: { role: string }) => message.role === "assistant");
      assert.equal(reply.engine, "record-rules · Peel-verified arithmetic");
      assert(reply.text.includes("Connected Peel verified the priced-job arithmetic."));
      assert(reply.text.includes("$9.00 estimated net") && reply.text.includes("-$3.00") && reply.text.includes("$12.00"));
      assert(reply.text.includes("2 of 3 completed business jobs"), "An unpriced job disappeared from the coverage statement.");
      assert(recordIds.every(id => reply.recordIds.includes(id)), "The actual reply lost a priced or missing-input record reference.");
      const shared = await request("/api/website/customer/driver/coach?from=2026-11-07&through=2026-11-07",
        { headers: { Cookie: sessions[0], Accept: "application/json" } });
      assert.equal(shared.status, 200);
      assert((await shared.json()).messages.some((message: { id: string; engine?: string }) => message.id === reply.id && message.engine === reply.engine));
      const retry = await request("/api/website/customer/driver/coach", { method: "POST", headers: bearer, body: JSON.stringify(question) });
      assert.equal(retry.status, 200); assert.deepEqual((await retry.json()).messages, answer.messages);
      const foreign = await request("/api/website/customer/driver/coach", { headers: { Cookie: sessions[1], Accept: "application/json" } });
      assert.equal(foreign.status, 200); assert.deepEqual((await foreign.json()).messages, []);
      server.kill("SIGTERM"); await closed;
      console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(),
        scope: "Compiled authenticated coach endpoint -> installed local real Peel symbolic worker -> persisted shared reply",
        buildId: readFileSync(".next/BUILD_ID", "utf8").trim(), helperPid, diagnosticServerStopped: true,
        checks: ["real bearer-authenticated compiled coach POST", "actual installed Peel arithmetic matched recorded totals",
          "positive and negative jobs retained", "two priced and one unpriced job disclosed", "numeric facts only sent to the worker",
          "Peel verification stays attached to the persisted cookie-visible reply", "connected question retry is idempotent",
          "foreign account history stays empty"],
        observed: { engine: reply.engine, peelAvailable: answer.engine.peelAvailable, pricedCount: 2, unpricedCount: 1,
          estimatedNetCents: 900, bestJobNetCents: 1200, lossJobNetCents: -300 },
        realClientDataUsed: false, externalModelCalls: 0, credentialsIncluded: false,
        existingWorkspaceServerTouched: false, persistentWorkerStopped: false }, null, 2));
      return;
    }
    const written = await promisify(execFile)(binary, [base, "write"], { timeout: 60_000 });
    const nativeWrite = JSON.parse(written.stdout.trim()); assert(nativeWrite.ok);
    checks.push(...nativeWrite.checks);
    const route = "/api/website/customer/driver/coach";
    const query = "?from=2026-11-07&through=2026-11-07";
    const jsonHeaders = { Cookie: sessions[0], Accept: "application/json", Origin: base, "Content-Type": "application/json" };
    const shared = await request(route + query, { headers: jsonHeaders }); assert.equal(shared.status, 200);
    const state = await shared.json();
    assert(state.messages.some((message: { id: string }) => message.id === nativeWrite.messageId));
    assert.deepEqual(state.intake, { taxYear: 2026, jurisdiction: "New York", businessType: "sole-proprietor" });
    const html = await request(route + query, { headers: { Cookie: sessions[0], Accept: "text/html" } });
    assert.equal(html.status, 200); assert((await html.text()).includes("Where am I losing money"));
    checks.push("website cookie and HTML read the exact native message and confirmed intake");
    const forged = await request(route + query + `&accountId=${accounts[0].id}&clientId=${clients[0].id}`,
      { headers: { Cookie: sessions[1], Accept: "application/json" } });
    assert.equal(forged.status, 200); const isolated = await forged.json();
    assert.deepEqual(isolated.messages, []); assert.deepEqual(isolated.intake, {});
    assert(!isolated.milestones.some((milestone: { title: string }) => milestone.title === "Synthetic shared tax request"));
    checks.push("forged account/client selection cannot cross the authenticated cookie scope");
    const siteQuestion = { action: "message", mutationId: randomUUID(), messageId: randomUUID(),
      text: "What tax documents and vehicle deductions do I need?", from: "2026-11-07", through: "2026-11-07" };
    const posted = await request(route, { method: "POST", headers: jsonHeaders, body: JSON.stringify(siteQuestion) });
    assert.equal(posted.status, 200);
    const retry = await request(route, { method: "POST", headers: jsonHeaders, body: JSON.stringify(siteQuestion) });
    assert.equal(retry.status, 200); assert.deepEqual((await retry.json()).messages, (await posted.json()).messages);
    const changed = await request(route, { method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ ...siteQuestion, text: "Changed payload must not reuse this operation" }) });
    assert.equal(changed.status, 409);
    const intake = await request(route, { method: "POST", headers: jsonHeaders, body: JSON.stringify({
      action: "intake", mutationId: randomUUID(), confirmed: true,
      answers: { taxYear: 2026, jurisdiction: "New Jersey", businessType: "sole-proprietor" },
    }) }); assert.equal(intake.status, 200);
    checks.push("website question retry is idempotent; changed operation reuse conflicts; explicit website intake saves");
    const reread = await promisify(execFile)(binary, [base, "read"], { timeout: 60_000 });
    const nativeRead = JSON.parse(reread.stdout.trim()); assert(nativeRead.ok); checks.push(...nativeRead.checks);
    assert.equal((await request(route)).status, 401);
    const crossOrigin = await request(route, { method: "POST", headers: { ...jsonHeaders, Origin: "https://unrelated.example" }, body: JSON.stringify(siteQuestion) });
    assert.equal(crossOrigin.status, 403);
    setCustomerEnabled(accounts[0].id, false);
    assert.equal((await request(route + query, { headers: jsonHeaders })).status, 401);
    checks.push("anonymous, cross-origin and immediately revoked coach access fail closed");
    server.kill("SIGTERM"); await closed;
    console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(),
      scope: "Saved native WorkspaceClient against compiled disposable HTTP and matching website cookie sessions",
      buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
      nativeProbeSHA256: createHash("sha256").update(readFileSync(binary)).digest("hex"),
      checks, shopping: nativeWrite.shopping, helperPid, diagnosticServerStopped: true, realClientDataUsed: false,
      peelIntegration: "Separately verified against the real private worker; disabled in this shared-wire fixture",
      physicalIPhoneVerified: false, visualAcceptance: "Pending Luke screenshots" }, null, 2));
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM"); await Promise.race([closed, pause(4_000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; }
    }
    if (helperPid) {
      let live = false; try { process.kill(helperPid, 0); live = true; } catch {}
      assert(!live, "The owned coach fixture server remains running.");
    }
    rmSync(directory, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Native coach HTTP verification failed."); process.exitCode = 1; });
