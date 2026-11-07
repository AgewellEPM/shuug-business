/** Actual compiled HTTP proof using disposable synthetic accounts/keys only.
 * Run after `next build` and compilation of the synthetic CryptoKit helper.
 * This does not activate a real vault, migrate real data or prove offhost custody. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../src/lib/customer-access/service";
import { issueCustomerInvitation, setCustomerEnabled } from "../src/lib/customer-access/accounts";
import { addRecord } from "../src/lib/sdk/records";
import { moduleById } from "../src/lib/sdk/registry";
import { canonicalManifest, type SignedRecipientManifest, type SecureTaxEnvelope } from "../src/lib/secure-tax/envelope";

function syntheticKeyPair() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  return { privateKey: pair.privateKey, rawPrivateKey: jwk.d!, publicKey,
    keyId: createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest("base64url") };
}

async function main() {
  assert(existsSync(".next/BUILD_ID"), "Build the integrated application first.");
  const buildTime = statSync(".next/BUILD_ID").mtimeMs;
  for (const source of ["store.ts", "envelope.ts", "manifest.ts", "policy.ts", "http.ts", "session.ts"]) {
    assert(buildTime >= statSync(path.join("src/lib/secure-tax", source)).mtimeMs, "Rebuild after the latest secure API change.");
  }
  const binary = process.argv[2] ?? "/private/tmp/native-secure-tax-envelope-proof";
  assert(binary.startsWith("/private/tmp/") && existsSync(binary), "Supply the compiled synthetic CryptoKit proof helper from /private/tmp.");
  const scratch = mkdtempSync(path.join(tmpdir(), "gig-tax-secure-http-")), directory = path.join(scratch, "synthetic-workspace");
  const trustedOrigin = "https://trusted-client.example.test", workspaceId = `synthetic-${randomUUID()}`;
  const password = `Synthetic-only-${randomUUID()}`, signer = syntheticKeyPair(), recovery = syntheticKeyPair();
  const checks: string[] = [], pids: number[] = [];
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<unknown> | undefined, base = "";
  let stopped: Promise<void> | undefined;
  const request = (route: string, init: RequestInit = {}) => fetch(base + route, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  const secure = "/api/website/customer/secure";
  const cookieFor = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith("shuug_customer="))?.split(";")[0];
  const native = (command: "self-test" | "seal" | "open", input?: unknown) => {
    const result = spawnSync(binary, [command], { input: input === undefined ? undefined : JSON.stringify(input), encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 15000 });
    assert.equal(result.status, 0, `Synthetic CryptoKit ${command} failed.`);
    const value = JSON.parse(result.stdout); assert.equal(value.ok, true); return value;
  };
  async function stop() {
    if (stopped) return stopped;
    stopped = (async () => {
      const server = child;
      if (server && server.exitCode === null && server.signalCode === null) {
        server.kill("SIGTERM"); await Promise.race([closed, pause(4000)]);
        if (server.exitCode === null && server.signalCode === null) { server.kill("SIGKILL"); await closed; }
      }
      child = undefined;
    })();
    try { await stopped; } finally { stopped = undefined; }
  }
  async function start() {
    assert(!child, "A diagnostic server is already owned by this runner.");
    const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", new URL(base).port], {
      env: { ...process.env, NODE_ENV: "production", WORKSPACE_ACCESS_TOKEN: "", PPC_WORKSPACE_ACCESS_TOKEN: "",
        PLAID_CLIENT_ID: "", PLAID_SECRET: "", PLAID_LIVE_ENABLED: "false", UBER_DRIVER_CLIENT_ID: "", UBER_DRIVER_CLIENT_SECRET: "", UBER_DRIVER_APPROVED: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = server; if (server.pid) pids.push(server.pid);
    let logs = "";
    server.stdout?.on("data", bytes => { logs = (logs + bytes).slice(-4000); });
    server.stderr?.on("data", bytes => { logs = (logs + bytes).slice(-4000); });
    closed = new Promise(resolve => { server.once("close", resolve); server.once("error", resolve); });
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      assert(server.exitCode === null && server.signalCode === null, `Owned server exited: ${logs}`);
      try {
        const health = await fetch(base + "/api/website/customer/driver/health", { signal: AbortSignal.timeout(1000) });
        if (health.status === 200) return;
      } catch { /* Readiness retries remain within the owned server deadline. */ }
      await pause(200);
    }
    throw new Error(`Compiled synthetic backend did not become ready: ${logs}`);
  }
  const onInterrupt = () => { void stop().finally(() => { rmSync(scratch, { recursive: true, force: true }); process.exit(130); }); };
  process.once("SIGINT", onInterrupt); process.once("SIGTERM", onInterrupt);
  try {
    const listener = createServer();
    await new Promise<void>((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(resolve => listener.close(() => resolve())); base = `http://127.0.0.1:${port}`;
    Object.assign(process.env, { DEALDESK_DATA_DIR: directory, APP_BASE_URL: base, AUTH_ENABLED: "true", DEMO_DATA: "false", DATABASE_URL: "", NEXT_TELEMETRY_DISABLED: "1",
      SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY: signer.publicKey, SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY: recovery.publicKey,
      SHUUG_SECURE_TAX_WORKSPACE_ID: workspaceId, SHUUG_SECURE_TAX_TRUSTED_ORIGIN: trustedOrigin });
    importBusinessTemplate(gigTaxProsTemplate); configureOwnerPassword(password);
    saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
    const clients = ["Alpha", "Beta"].map(name => saveBusinessRecord({ kind: "client", title: `Secure Smoke ${name}`, fields: { email: `secure-${name.toLowerCase()}@example.test` } }, "Synthetic owner"));
    const accounts = await Promise.all(clients.map(client => createLinkedCustomer({ name: client.title, email: client.fields.email, clientId: client.id, customerId: null })));
    const invites = accounts.map(account => issueCustomerInvitation(account.id)), clientKeys = accounts.map(() => syntheticKeyPair());
    const engagement = addRecord("tax-engagements", moduleById("tax-engagements")!.fields, { name: "Synthetic requested work", client_id: clients[0].id, tax_year: 2026, stage: "Awaiting documents", client_visible: true });
    const taxRequest = addRecord("tax-document-requests", moduleById("tax-document-requests")!.fields, { name: "Synthetic document request", client_id: clients[0].id, engagement_id: engagement.id, status: "Requested", client_visible: true });
    const nativeProof = native("self-test");
    await start();
    const cookies: string[] = [], tokens: string[] = [], browserTokens: string[] = [];
    for (const [index, account] of accounts.entries()) {
      const activated = await request("/api/website/customer", { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "activate", invite: invites[index], password, confirmation: password }) });
      assert.equal(activated.status, 303); const cookie = cookieFor(activated); assert(cookie); cookies.push(cookie);
      const login = await request("/api/website/customer/driver/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, password }) });
      assert.equal(login.status, 200); const session = await login.json(); assert.equal(session.account.id, account.id); assert.equal(session.branding.name, "Gig Tax Pros"); tokens.push(session.token);
      const browserLogin = await request(secure + "/session", { method: "POST", headers: { Origin: trustedOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, password }) });
      assert.equal(browserLogin.status, 200); assert.equal(browserLogin.headers.get("access-control-allow-origin"), trustedOrigin);
      const browserSession = await browserLogin.json(); assert.deepEqual(browserSession.identity, { accountId: account.id, clientId: clients[index].id }); browserTokens.push(browserSession.token);
      const sessionHeaders: Record<string, string>[] = [bearer(session.token), { Cookie: cookie }, { ...bearer(browserSession.token), Origin: trustedOrigin }];
      for (const headers of sessionHeaders) {
        const status = await request(secure + "/status", { headers }); assert.equal(status.status, 200);
        const value = await status.json(); assert.equal(value.enrolled, false); assert.equal(value.secureRequired, false);
        assert.deepEqual(value.identity, { accountId: account.id, clientId: clients[index].id });
      }
    }
    checks.push("two real invitation activations and native, web-cookie and trusted-browser sessions report the exact same secure account/client identity");
    function manifest(index: number, epoch = 1, key = clientKeys[index]): SignedRecipientManifest {
      const value: SignedRecipientManifest = { version: 1, manifestId: randomUUID(), workspaceId, accountId: accounts[index].id, clientId: clients[index].id, epoch,
        client: { keyId: key.keyId, publicKey: key.publicKey }, firmRecovery: { keyId: recovery.keyId, publicKey: recovery.publicKey },
        issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
        signature: { algorithm: "ES256-P1363", signerKeyId: signer.keyId, value: "" } };
      value.signature.value = sign("sha256", Buffer.from(canonicalManifest(value)), { key: signer.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url"); return value;
    }
    const manifests = accounts.map((_, index) => manifest(index));
    const enroll = (value: SignedRecipientManifest, headers: Record<string, string> = bearer(tokens[0])) => request(secure + "/enroll", { method: "POST", headers, body: JSON.stringify(value) });
    assert.equal((await enroll(manifests[0], bearer(tokens[1]))).status, 403);
    const forged = structuredClone(manifests[0]); forged.signature.value = randomBytes(64).toString("base64url");
    assert.equal((await enroll(forged)).status, 403);
    for (const [index, signed] of manifests.entries()) {
      const enrolled = await enroll(signed, bearer(tokens[index])); assert.equal(enrolled.status, 200);
      const value = await enrolled.json(); assert.equal(value.enrolled, true); assert.equal(value.plaintextMigrationPerformed, false); assert.equal(value.hostCompromiseProtectionVerified, false);
      assert.deepEqual(value.identity, { accountId: accounts[index].id, clientId: clients[index].id });
    }
    checks.push("only independently signed account-bound public manifests enroll; foreign and forged manifests fail without host private keys");
    const preflight = await request(secure + "/objects", { method: "OPTIONS", headers: { Origin: trustedOrigin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type" } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), trustedOrigin);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
    for (const origin of [base, trustedOrigin + ".attacker.test", "https://unrelated.example.test"]) {
      const rejected = await request(secure + "/status", { headers: { ...bearer(tokens[0]), Origin: origin } });
      assert.equal(rejected.status, 403); assert.equal(rejected.headers.get("access-control-allow-origin"), null);
      assert.equal((await request(secure + "/session", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: accounts[0].email, password }) })).status, 403);
    }
    assert.equal((await enroll(manifests[0], { Cookie: cookies[0], "Content-Type": "application/json" })).status, 403);
    const trustedWeb = await enroll(manifests[0], { Cookie: cookies[0], Origin: trustedOrigin, "Content-Type": "application/json" });
    assert.equal(trustedWeb.status, 200); assert.equal(trustedWeb.headers.get("access-control-allow-origin"), trustedOrigin);
    checks.push("exact independent-origin credentialed CORS works; first-party/foreign origins and untrusted cookie writes fail while native Bearer works");
    const legacyMutation = { mutationId: randomUUID(), record: { id: randomUUID(), revision: 0, deleted: false, kind: "income", body: { date: "2026-11-07", platform: "uber", description: "Synthetic legacy write rejection", amountCents: 100, currency: "USD", notes: "" } } };
    assert.equal((await request("/api/website/customer/driver/records", { method: "POST", headers: bearer(tokens[0]), body: JSON.stringify(legacyMutation) })).status, 409);
    assert.equal((await request(`/api/website/customer/driver/receipts/${randomUUID()}`, { method: "PUT", headers: bearer(tokens[0]), body: Buffer.from("89504e470d0a1a0a", "hex") })).status, 409);
    const upload = new FormData(); upload.set("requestId", taxRequest.id); upload.set("file", new Blob(["%PDF-1.4\nSynthetic legacy write rejection\n%%EOF"], { type: "application/pdf" }), "synthetic-request.pdf");
    assert.equal((await request("/api/website/customer/documents", { method: "POST", headers: { Authorization: `Bearer ${tokens[0]}`, Accept: "application/json" }, body: upload })).status, 409);
    assert.equal((await request("/api/website/customer/driver/coach", { method: "POST", headers: bearer(tokens[0]), body: "not-json" })).status, 409);
    assert.equal((await request("/api/website/customer/driver/profile", { method: "PATCH", headers: bearer(tokens[0]), body: "not-json" })).status, 409);
    const bank = await request("/api/website/customer/driver/banks", { headers: bearer(tokens[0]) }); assert.equal(bank.status, 200);
    const bankStatus = await bank.json(); assert.equal(bankStatus.ready, false); assert.equal(bankStatus.secureTaxRequired, true);
    const uber = await request("/api/website/customer/connections/uber", { headers: bearer(tokens[0]) }); assert.equal(uber.status, 200);
    const uberStatus = await uber.json(); assert.equal(uberStatus.ready, false); assert.equal(uberStatus.secureTaxRequired, true);
    checks.push("enrolled clients reject legacy journal, receipt, requested-document, coach and profile mutations before parsing their bodies; host provider availability stays disabled");
    const objectId = randomUUID(), deletedId = randomUUID();
    const payload = Buffer.from(JSON.stringify({ syntheticOnly: true, ssn: "000-12-3456", label: "SECURE_HTTP_SYNTHETIC_PAYLOAD", documentName: "synthetic-private-tax.pdf", amountCents: 123456 }));
    const context = (id: string, revision: number): SecureTaxEnvelope["context"] => ({ workspaceId, accountId: accounts[0].id, objectId: id, revision, domain: "tax-identity" });
    const trusted = { clientPublicKey: clientKeys[0].publicKey, firmRecoveryPublicKey: recovery.publicKey };
    const seal = (id: string, revision: number, bytes = payload): SecureTaxEnvelope => native("seal", { syntheticOnly: true, context: context(id, revision), ...trusted,
      plaintext: bytes.toString("base64url"), authorRole: "client", authorPrivateKey: clientKeys[0].rawPrivateKey }).envelope;
    const primitives = await import(pathToFileURL(path.resolve("packages/secure-tax-client/envelope.mjs")).href);
    const openBoth = async (envelope: SecureTaxEnvelope, expected: Buffer) => {
      for (const [role, key] of [["client", clientKeys[0]], ["firm-recovery", recovery]] as const) {
        const opened = native("open", { syntheticOnly: true, context: envelope.context, ...trusted, role, privateKey: key.rawPrivateKey, envelope });
        assert.deepEqual(Buffer.from(opened.plaintext, "base64url"), expected);
        const jwk = key.privateKey.export({ format: "jwk" });
        const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
        assert.deepEqual(Buffer.from(await primitives.openEnvelope(envelope, envelope.context, trusted, role, privateKey)), expected);
      }
    };
    const objectRoute = (id: string = objectId) => secure + "/objects/" + id;
    const write = (id: string, body: unknown, token = tokens[0]) => request(objectRoute(id), { method: "PUT", headers: bearer(token), body: JSON.stringify(body) });
    const initialEnvelope = seal(objectId, 1), initial = { mutationId: randomUUID(), expectedRevision: 0, envelope: initialEnvelope };
    assert.equal((await write(objectId, { ...initial, envelope: { ...initialEnvelope, filename: "Forbidden plaintext alias" } })).status, 400);
    assert.equal((await write(objectId, { ...initial, envelope: { ...initialEnvelope, version: 1 } })).status, 400);
    const created = await write(objectId, initial); assert.equal(created.status, 200); assert.equal((await created.json()).duplicate, false);
    const retry = await write(objectId, initial); assert.equal(retry.status, 200); assert.equal((await retry.json()).duplicate, true);
    assert.equal((await write(objectId, { ...initial, mutationId: randomUUID() })).status, 409);
    assert.equal((await write(randomUUID(), initial)).status, 409);
    const foreign = await Promise.all([request(objectRoute(), { headers: bearer(tokens[1]) }), write(objectId, initial, tokens[1]), request(objectRoute(), { method: "DELETE", headers: bearer(tokens[1]), body: JSON.stringify({ expectedRevision: 1 }) })]);
    for (const response of foreign) assert([403, 404].includes(response.status));
    const updateBytes = Buffer.from(JSON.stringify({ ...JSON.parse(payload.toString()), revisionNote: "Synthetic revision two" })), updatedEnvelope = seal(objectId, 2, updateBytes);
    assert.equal((await write(objectId, { mutationId: randomUUID(), expectedRevision: 1, envelope: updatedEnvelope })).status, 200);
    assert.equal((await write(objectId, { mutationId: randomUUID(), expectedRevision: 1, envelope: updatedEnvelope })).status, 409);
    const download = await request(objectRoute(), { headers: { Cookie: cookies[0], Origin: trustedOrigin } }); assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "private, no-store"); assert.equal(download.headers.get("x-content-type-options"), "nosniff");
    const stored = await download.json(); assert.equal(stored.revision, 2); assert.deepEqual(stored.envelope, updatedEnvelope); await openBoth(stored.envelope, updateBytes);
    checks.push("actual CryptoKit ciphertext crosses compiled HTTP and opens with both native/WebCrypto recipients; CAS, retry, framing and foreign ownership checks hold");
    const toDelete = { mutationId: randomUUID(), expectedRevision: 0, envelope: seal(deletedId, 1) };
    assert.equal((await write(deletedId, toDelete)).status, 200);
    const deletion = await request(objectRoute(deletedId), { method: "DELETE", headers: bearer(tokens[0]), body: JSON.stringify({ expectedRevision: 1 }) });
    assert.equal(deletion.status, 200); const tombstone = await deletion.json(); assert.equal(tombstone.deleted, true); assert.equal(tombstone.liveCiphertextPurged, true);
    assert.equal((await write(deletedId, toDelete)).status, 409);
    const deleted = await (await request(objectRoute(deletedId), { headers: bearer(tokens[0]) })).json(); assert.equal(deleted.deleted, true); assert.equal(deleted.envelope, undefined);
    const changes = await (await request(secure + "/objects?after=0&limit=1", { headers: bearer(tokens[0]) })).json(); assert.equal(changes.changes.length, 1); assert.equal(changes.hasMore, true);
    const nextPage = await (await request(secure + `/objects?after=${changes.cursor}&limit=1`, { headers: bearer(tokens[0]) })).json(); assert.equal(nextPage.changes[0].objectId, deletedId); assert.equal(nextPage.changes[0].deleted, true);
    const otherChanges = await (await request(secure + "/objects", { headers: bearer(tokens[1]) })).json(); assert.deepEqual(otherChanges.changes, []);
    assert.equal((await enroll(manifest(0, 2, syntheticKeyPair()))).status, 409);
    const renewed = await enroll(manifest(0, 2)); assert.equal(renewed.status, 200);
    checks.push("content-free paginated tombstones cannot be resurrected by create retries; live-object key rotation fails while same-key renewal works");
    await stop(); await start();
    const persisted = await request(objectRoute(), { headers: bearer(tokens[0]) }); assert.equal(persisted.status, 200);
    const durable = await persisted.json(); assert.deepEqual(durable.envelope, updatedEnvelope); await openBoth(durable.envelope, updateBytes);
    assert.equal((await (await request(objectRoute(deletedId), { headers: { Cookie: cookies[0] } })).json()).deleted, true);
    assert.equal((await request(objectRoute(), { headers: { ...bearer(browserTokens[0]), Origin: trustedOrigin } })).status, 200);
    assert.equal((await (await request(secure + "/status", { headers: bearer(tokens[0]) })).json()).manifest.epoch, 2);
    checks.push("real server restart preserves original web/native sessions, enrollment renewal, exact ciphertext bytes and deletion tombstones");
    setCustomerEnabled(accounts[0].id, false);
    for (const route of [secure + "/status", secure + "/objects", objectRoute()]) {
      assert.equal((await request(route, { headers: bearer(tokens[0]) })).status, 401);
      assert.equal((await request(route, { headers: { Cookie: cookies[0] } })).status, 401);
      assert.equal((await request(route, { headers: { ...bearer(browserTokens[0]), Origin: trustedOrigin } })).status, 401);
    }
    assert.equal((await write(objectId, initial)).status, 401);
    assert.equal((await request(objectRoute(), { method: "DELETE", headers: bearer(tokens[0]), body: JSON.stringify({ expectedRevision: 2 }) })).status, 401);
    assert.equal((await enroll(manifests[0])).status, 401);
    assert.equal((await request(secure + "/status", { headers: bearer(tokens[1]) })).status, 200);
    const logout = await request(secure + "/session", { method: "DELETE", headers: { ...bearer(browserTokens[1]), Origin: trustedOrigin } }); assert.equal(logout.status, 200);
    assert.equal((await request(secure + "/status", { headers: { ...bearer(browserTokens[1]), Origin: trustedOrigin } })).status, 401);
    assert.equal((await request(secure + "/status", { headers: bearer(tokens[1]) })).status, 200);
    checks.push("account revocation disables every secure session; trusted-browser logout removes only its own session without disabling the other client");
    await stop();
    for (const filename of readdirSync(directory).filter(name => name.startsWith("workspace.sqlite"))) {
      const bytes = readFileSync(path.join(directory, filename));
      for (const secret of ["000-12-3456", "SECURE_HTTP_SYNTHETIC_PAYLOAD", "synthetic-private-tax.pdf", signer.rawPrivateKey, recovery.rawPrivateKey, clientKeys[0].rawPrivateKey]) {
        assert(!bytes.includes(Buffer.from(secret)), "Synthetic private payload/key appeared in host database files.");
      }
    }
    for (const pid of pids) {
      try { process.kill(pid, 0); assert.fail("Owned diagnostic server remains running."); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
      scope: "Compiled production HTTP with disposable synthetic accounts and actual CryptoKit/WebCrypto envelopes; real server restart",
      checks, nativeChecks: nativeProof.checks?.length ?? nativeProof.checkCount, ciphertextSha256: createHash("sha256").update(updatedEnvelope.ciphertext).digest("hex"),
      diagnosticServersStopped: true, realClientDataUsed: false, realPrivateKeysUsed: false, plaintextMigrationPerformed: false,
      offhostPhysicalCustodyVerified: false, publicHostingVerified: false, fullFeatureParityVerified: false }, null, 2));
  } finally {
    await stop(); process.removeListener("SIGINT", onInterrupt); process.removeListener("SIGTERM", onInterrupt);
    rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
