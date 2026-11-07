/** Actual native WorkspaceClient against one compiled, disposable reputation workspace. */
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer as createHTTPServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../src/lib/customer-access/service";
import { issueCustomerInvitation, setCustomerEnabled } from "../src/lib/customer-access/accounts";

async function main() {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const serverRoot = realpathSync(process.argv[3] ?? process.cwd());
  assert.notEqual(serverRoot, realpathSync(sourceRoot), "Use a separate compiled server checkout; the live source .next stays untouched.");
  assert(existsSync(path.join(serverRoot, ".next/BUILD_ID")), "Build the separate reputation server checkout first.");
  const binary = process.argv[2];
  assert(binary?.startsWith("/private/tmp/") && existsSync(binary), "Provide the temporary native reputation probe.");
  const buildID = readFileSync(path.join(serverRoot, ".next/BUILD_ID"), "utf8").trim();
  const sourceBuild = path.join(sourceRoot, ".next/BUILD_ID");
  const sourceBuildID = existsSync(sourceBuild) ? readFileSync(sourceBuild, "utf8") : null;
  const directory = mkdtempSync(path.join(tmpdir(), "gig-tax-reputation-wire-"));
  const previous = { ...process.env };
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<unknown> | undefined;
  let helperPID: number | undefined;
  const trapRequests: { url: string; body: unknown }[] = [];
  const trap = createHTTPServer((request, response) => {
    const bytes: Buffer[] = [];
    request.on("data", value => bytes.push(Buffer.from(value)));
    request.on("end", () => {
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(bytes).toString("utf8")); } catch { body = null; }
      trapRequests.push({ url: request.url ?? "", body });
      // This counter deliberately cannot issue a Peel attestation or qualify arithmetic.
      response.writeHead(503, { "Content-Type": "application/json" }); response.end('{"unavailable":true}');
    });
  });
  try {
    const listener = createServer();
    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve);
    });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    await new Promise<void>((resolve, reject) => {
      trap.once("error", reject); trap.listen(0, "127.0.0.1", resolve);
    });
    const trapPort = (trap.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    Object.assign(process.env, { DEALDESK_DATA_DIR: directory, APP_BASE_URL: base, AUTH_ENABLED: "true",
      DEMO_DATA: "false", DATABASE_URL: "", NEXT_TELEMETRY_DISABLED: "1", PLAID_CLIENT_ID: "", PLAID_SECRET: "",
      PLAID_LIVE_ENABLED: "false", GIG_TAX_PEEL_URL: `http://127.0.0.1:${trapPort}/v1/financial-attestation`,
      GIG_TAX_PEEL_TOKEN: "synthetic-reputation-proof-counter-token" });
    importBusinessTemplate(gigTaxProsTemplate); configureOwnerPassword("Synthetic-reputation-owner-password");
    saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
    const clients = ["alpha", "beta"].map(name => saveBusinessRecord({ kind: "client", title: `Reputation proof ${name}`,
      fields: { email: `reputation.${name}@example.com` } }, "Synthetic owner"));
    const accounts = await Promise.all(clients.map(client => createLinkedCustomer({ name: client.title,
      email: client.fields.email, clientId: client.id, customerId: null })));
    const invites = accounts.map(account => issueCustomerInvitation(account.id));
    child = spawn(process.execPath, [path.join(serverRoot, "node_modules/next/dist/bin/next"), "start",
      "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: serverRoot, env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
    helperPID = child.pid; assert(helperPID);
    closed = new Promise(resolve => child!.once("close", resolve));
    let logs = "";
    child.stdout?.on("data", bytes => { logs = (logs + bytes).slice(-4000); });
    child.stderr?.on("data", bytes => { logs = (logs + bytes).slice(-4000); });
    const request = (route: string, init: RequestInit = {}) => fetch(base + route,
      { ...init, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    let ready = false;
    for (let count = 0; count < 120; count++) {
      assert(child.exitCode === null, `Owned reputation backend exited: ${logs}`);
      try { if ((await request("/api/website/customer/driver/health")).status === 200) { ready = true; break; } } catch {}
      await pause(100);
    }
    assert(ready, `Separate compiled backend did not become ready: ${logs}`);
    const cookies: string[] = [];
    for (const invite of invites) {
      const activation = await request("/api/website/customer", { method: "POST",
        headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ action: "activate", invite, password: "Synthetic-reputation-password",
          confirmation: "Synthetic-reputation-password" }) });
      assert.equal(activation.status, 303);
      const cookie = activation.headers.getSetCookie().find(value => value.startsWith("shuug_customer="))?.split(";")[0];
      assert(cookie); cookies.push(cookie);
    }
    const execute = promisify(execFile);
    const nativeWrite = JSON.parse((await execute(binary, [base, "write"], { timeout: 120_000 })).stdout.trim());
    assert(nativeWrite.ok);
    assert.equal(trapRequests.length, 1, "Reputation chat unexpectedly dispatched financial verification.");
    assert.equal(trapRequests[0].url, "/v1/financial-attestation");
    const numeric = trapRequests[0].body as { rows: Record<string, unknown>[] };
    assert(Array.isArray(numeric.rows) && numeric.rows.length === 1);
    assert.deepEqual(Object.keys(numeric.rows[0]).sort(), ["feesCents", "grossCents", "id", "netCents", "vehicleCents"]);
    assert.equal(numeric.rows[0].netCents, 1200);
    const checks: string[] = [...nativeWrite.checks, "configured unavailable financial adapter received numeric baseline only; rating advice bypassed it"];
    const reputationPath = "/api/website/customer/driver/reputation";
    const coachPath = "/api/website/customer/driver/coach";
    const headers = { Cookie: cookies[0], Accept: "application/json", Origin: base, "Content-Type": "application/json" };
    const shared = await request(reputationPath, { headers }); assert.equal(shared.status, 200);
    const state = await shared.json(); assert.equal(state.ratings.length, 4); assert.equal(state.reviews.length, 3);
    assert(nativeWrite.ratingIDs.every((id: string) => state.ratings.some((rating: { id: string }) => rating.id === id)));
    assert.equal(state.acknowledgedMutationId, undefined);
    assert(shared.headers.get("cache-control")?.includes("no-store"));
    const page = await request(reputationPath, { headers: { Cookie: cookies[0], Accept: "text/html" } });
    assert.equal(page.status, 200); const html = await page.text();
    assert(html.includes("Native tagged accuracy feedback") && html.includes("4.9/5") && html.includes("previous same-scale snapshot 4.7/5"));
    checks.push("same invited website cookie reads exact native rating/review history and same-scale guidance");
    const selection = `?accountId=${accounts[0].id}&clientId=${clients[0].id}&platformID=uber-driver`;
    const foreign = await request(reputationPath + selection, { headers: { Cookie: cookies[1], Accept: "application/json" } });
    assert.equal(foreign.status, 200); assert.deepEqual(await foreign.json(), { apiVersion: 1, ratings: [], reviews: [] });
    const foreignDelete = await request(reputationPath, { method: "POST", headers: { ...headers, Cookie: cookies[1] },
      body: JSON.stringify({ action: "deleteReview", mutationId: randomUUID(), id: nativeWrite.negativeReviewID }) });
    assert.equal(foreignDelete.status, 404);
    checks.push("forged account/client/platform selection and foreign deletion cannot access another account");
    const siteReview = { action: "addReview", mutationId: randomUUID(), review: { id: randomUUID(),
      platformID: "uber-driver", platformName: "Uber Driver", recordedAt: "2026-11-07T13:00:00Z",
      text: "Website positive communication feedback", sentiment: "positive", topics: ["communication"], deleted: false } };
    const added = await request(reputationPath, { method: "POST", headers, body: JSON.stringify(siteReview) });
    assert.equal(added.status, 200); const addedState = await added.json();
    const retry = await request(reputationPath, { method: "POST", headers, body: JSON.stringify(siteReview) });
    assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), addedState);
    const changed = await request(reputationPath, { method: "POST", headers,
      body: JSON.stringify({ ...siteReview, review: { ...siteReview.review, text: "Changed retry content" } }) });
    assert.equal(changed.status, 409);
    const removal = await request(reputationPath, { method: "POST",
      headers: { Cookie: cookies[0], Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "deleteReview", mutationId: randomUUID(), id: nativeWrite.negativeReviewID, confirmed: "yes" }) });
    assert.equal(removal.status, 303);
    const nativeRead = JSON.parse((await execute(binary, [base, "read"], { timeout: 120_000 })).stdout.trim());
    assert(nativeRead.ok); checks.push("cookie add retry stays idempotent and changed digest conflicts", "confirmed website form deletion persists a tombstone", ...nativeRead.checks);
    const reputationQuestion = { action: "message", mutationId: randomUUID(), messageId: randomUUID(),
      text: "Show my ratings and personal reviews", from: "2024-01-01", through: "2024-01-02" };
    const coachReply = await request(coachPath, { method: "POST", headers, body: JSON.stringify(reputationQuestion) });
    assert.equal(coachReply.status, 200); const reputationCoach = await coachReply.json();
    const reply = reputationCoach.messages.findLast((message: { role: string }) => message.role === "assistant");
    assert.equal(reply.engine, "record-rules"); assert.equal(reputationCoach.engine.peelAvailable, false);
    assert(reply.text.includes("4.9/5") && reply.text.includes("4.7/5"));
    assert.equal(trapRequests.length, 1);
    const finance = await request(coachPath, { method: "POST", headers, body: JSON.stringify({ ...reputationQuestion,
      mutationId: randomUUID(), messageId: randomUUID(), text: "Show recorded financial profit and goals",
      from: "2026-11-07", through: "2026-11-07" }) });
    assert.equal(finance.status, 200); const financial = await finance.json();
    const financialReply = financial.messages.findLast((message: { role: string }) => message.role === "assistant");
    assert(financialReply.text.includes("$12.00")); assert.equal(trapRequests.length, 2);
    assert.equal(financial.preferences.vehicleCostCentsPerMile, 50); assert.equal(financial.preferences.dailyNetCents, 10000);
    checks.push("cookie reputation chat reads shared manual history without a Peel call or label", "financial1200cent baseline and explicit preferences survive reputation activity");
    assert.equal((await request(reputationPath)).status, 401);
    const crossOrigin = await request(reputationPath, { method: "POST", headers: { ...headers, Origin: "https://unrelated.example" }, body: JSON.stringify(siteReview) });
    assert.equal(crossOrigin.status, 403);
    setCustomerEnabled(accounts[0].id, false);
    assert.equal((await request(reputationPath, { headers })).status, 401);
    checks.push("anonymous and cross-origin reputation access fail closed", "disabling the invited account immediately revokes cookie access");
    child.kill("SIGTERM"); await closed;
    await new Promise<void>(resolve => trap.close(() => resolve()));
    assert.equal(existsSync(sourceBuild) ? readFileSync(sourceBuild, "utf8") : null, sourceBuildID, "Live source .next changed.");
    console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(),
      scope: "Actual compiled native WorkspaceClient against separate compiled HTTP and matching invited website accounts",
      serverRoot, buildID, nativeProbeSHA256: createHash("sha256").update(readFileSync(binary)).digest("hex"),
      checks, helperPID, diagnosticServerStopped: true, financialCounterStopped: true,
      financialBaselineNetCents: 1200, financialCounterRequests: trapRequests.length,
      peelExecutionVerified: false, peelCounterBehavior: "Owned unavailable503counter only; no symbolic qualification issued",
      physicalIPhoneVerified: false, realClientDataUsed: false, existingPort3126Touched: false,
      liveSourceBuildUnchanged: true, credentialsIncluded: false }, null, 2));
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM"); await Promise.race([closed, pause(4000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; }
    }
    if (trap.listening) await new Promise<void>(resolve => trap.close(() => resolve()));
    if (helperPID) { let live = false; try { process.kill(helperPID, 0); live = true; } catch {} assert(!live, "Owned reputation server remains running."); }
    rmSync(directory, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Native reputation HTTP proof failed."); process.exitCode = 1; });
